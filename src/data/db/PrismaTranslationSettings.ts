import { AppErrors, type Result, attemptAsync, err, ok } from '../../core/result'
import { LLM_PROVIDERS, LLM_PROVIDER_INFO, isLlmProvider, keyHintOf } from '../../domain/translation/entities/LlmProvider'
import type { LlmProviderName } from '../../domain/translation/entities/LlmProvider'
import {
  MAX_APP_DESCRIPTION_LENGTH,
  MAX_APP_NAME_LENGTH,
  defaultTranslationSettings,
} from '../../domain/translation/entities/TranslationSettings'
import type {
  ProviderCredentialSummary,
  TranslationSettings,
  TranslationSettingsPatch,
} from '../../domain/translation/entities/TranslationSettings'
import type {
  ResolvedLlmCredential,
  TranslationSettingsStore,
} from '../../domain/translation/repositories/TranslationSettingsStore'
import { decryptCredential, encryptCredential } from '../remote-config/ServiceAccountCipher'
import { prisma } from './prismaClient'

/**
 * Kho cấu hình mô hình của người dùng.
 *
 * ── Vì sao dùng lại cipher của service account ──
 *
 * `ServiceAccountCipher` mang cái tên hẹp hơn việc nó làm, nhưng dùng lại nó là
 * đúng chứ không phải tiện tay: nhờ vậy khoá LLM đi theo CÙNG một
 * `CREDENTIAL_ENCRYPTION_KEY`, cùng một vòng khoá cũ/mới, và cùng một lệnh
 * `pnpm rotate:key`. Viết một phép mã hoá thứ hai ở đây là dựng ra một khoá thứ
 * hai phải nhớ xoay — và cái không ai nhớ xoay là cái sẽ không được xoay.
 *
 * `scripts/rotate-credential-key.ts` đã được mở rộng để chạm cả bảng này. Thêm
 * một bảng có bản mã mà quên bước đó thì lần xoay khoá kế tiếp biến nó thành rác.
 */
// Lấy từ `defaultTranslationSettings()` chứ không viết lại các giá trị: hai
// bản mặc định rời nhau thì trang hiện một thứ còn DB ghi một thứ khác, và
// khác biệt đó chỉ lộ ra sau khi người dùng lưu.
const DEFAULTS = defaultTranslationSettings()

const DEFAULT_PREFERENCE = {
  provider: DEFAULTS.provider,
  appName: DEFAULTS.appName,
  appDescription: DEFAULTS.appDescription,
}

const asProvider = (value: string): LlmProviderName =>
  isLlmProvider(value) ? value : DEFAULT_PREFERENCE.provider

const clamp = (value: string, max: number): string => value.trim().slice(0, max)

export class PrismaTranslationSettings implements TranslationSettingsStore {
  async read(userId: string): Promise<Result<TranslationSettings>> {
    return attemptAsync(async () => {
      const [preference, credentials] = await Promise.all([
        prisma.translationPreference.findUnique({ where: { userId } }),
        prisma.userLlmCredential.findMany({
          where: { userId },
          // Bản mã cố tình KHÔNG nằm trong lát cắt này. Hàm này phục vụ việc vẽ
          // màn hình, nên một khoá đã giải mã lọt vào đây là một khoá nằm trong
          // HTML của trang mà không ai cần tới nó.
          select: { provider: true, keyHint: true, model: true },
        }),
      ])

      const byProvider = new Map(credentials.map((row) => [asProvider(row.provider), row]))

      // Trả về đủ CẢ HAI nhà cung cấp, kể cả cái chưa có khoá: màn hình vẽ cả
      // hai lựa chọn, và "chưa có khoá" là một trạng thái phải vẽ được.
      const summaries: ProviderCredentialSummary[] = LLM_PROVIDERS.map((provider) => {
        const row = byProvider.get(provider)
        return {
          provider,
          hasKey: row !== undefined,
          keyHint: row?.keyHint ?? '',
          model: row?.model ?? LLM_PROVIDER_INFO[provider].defaultModel,
        }
      })

      return {
        provider: asProvider(preference?.provider ?? DEFAULT_PREFERENCE.provider),
        appName: preference?.appName ?? DEFAULT_PREFERENCE.appName,
        appDescription: preference?.appDescription ?? DEFAULT_PREFERENCE.appDescription,
        credentials: summaries,
      }
    }, 'Không đọc được cấu hình mô hình dịch.')
  }

  async resolve(
    userId: string,
    provider: LlmProviderName,
  ): Promise<Result<ResolvedLlmCredential | null>> {
    const row = await attemptAsync(
      () =>
        prisma.userLlmCredential.findUnique({
          where: { userId_provider: { userId, provider } },
          select: { apiKeyCiphertext: true, model: true },
        }),
      'Không đọc được khoá API đã lưu.',
    )
    if (!row.ok) return row
    if (row.value === null) return ok(null)

    const apiKey = decryptCredential(row.value.apiKeyCiphertext)
    if (!apiKey.ok) {
      // Giải mã hỏng gần như luôn nghĩa là khoá mã hoá đã đổi mà chưa chạy
      // `pnpm rotate:key`. Nói đúng nguyên nhân, đừng để người dùng đi tìm một
      // khoá API hỏng mà thực ra khoá của họ vẫn nguyên vẹn.
      return err(
        AppErrors.unknown(
          'Không đọc lại được khoá API đã lưu. Gắn lại khoá, hoặc báo quản trị viên kiểm tra khoá mã hoá của hệ thống.',
          { detail: apiKey.error.detail ?? apiKey.error.message },
        ),
      )
    }

    return ok({ provider, apiKey: apiKey.value, model: row.value.model })
  }

  async saveCredential(
    userId: string,
    provider: LlmProviderName,
    apiKey: string,
    model: string,
  ): Promise<Result<void>> {
    const trimmedKey = apiKey.trim()
    const ciphertext = encryptCredential(trimmedKey)
    if (!ciphertext.ok) return ciphertext

    const hint = keyHintOf(trimmedKey)
    const chosenModel = clamp(model, 120)

    return attemptAsync(async () => {
      await prisma.userLlmCredential.upsert({
        where: { userId_provider: { userId, provider } },
        create: {
          userId,
          provider,
          apiKeyCiphertext: ciphertext.value,
          keyHint: hint,
          model: chosenModel,
        },
        update: { apiKeyCiphertext: ciphertext.value, keyHint: hint, model: chosenModel },
      })
    }, 'Không lưu được khoá API.')
  }

  async savePreference(userId: string, patch: TranslationSettingsPatch): Promise<Result<void>> {
    return attemptAsync(async () => {
      // `model` thuộc về hàng credential chứ không thuộc hàng preference: một
      // người có thể giữ hai khoá với hai model khác nhau, và đổi nhà cung cấp
      // phải lấy lại đúng model của bên kia chứ không kéo theo model bên này.
      if (patch.model !== undefined) {
        const provider = patch.provider ?? (await this.currentProvider(userId))
        await prisma.userLlmCredential.updateMany({
          where: { userId, provider },
          data: { model: clamp(patch.model, 120) },
        })
      }

      const preference = {
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.appName !== undefined ? { appName: clamp(patch.appName, MAX_APP_NAME_LENGTH) } : {}),
        ...(patch.appDescription !== undefined
          ? { appDescription: clamp(patch.appDescription, MAX_APP_DESCRIPTION_LENGTH) }
          : {}),
      }

      if (Object.keys(preference).length === 0) return

      await prisma.translationPreference.upsert({
        where: { userId },
        create: { userId, ...DEFAULT_PREFERENCE, ...preference },
        update: preference,
      })
    }, 'Không lưu được cấu hình mô hình dịch.')
  }

  private async currentProvider(userId: string): Promise<LlmProviderName> {
    const row = await prisma.translationPreference.findUnique({
      where: { userId },
      select: { provider: true },
    })
    return asProvider(row?.provider ?? DEFAULT_PREFERENCE.provider)
  }
}
