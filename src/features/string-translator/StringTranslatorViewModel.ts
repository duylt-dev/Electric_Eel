import { defineViewModel } from '@/core/mvi'
import type { IntentContext } from '@/core/mvi'
import { clientContainer } from '@/di/client'
import { SUPPORTED_LANGUAGES } from '@/domain/translation/entities/LanguageCode'
import { inspectApiKeyShape } from '@/domain/translation/entities/LlmProvider'
import type { TranslationSettings } from '@/domain/translation/entities/TranslationSettings'
import type { TranslationRepository } from '@/domain/translation/repositories/TranslationRepository'
import type { TranslationSettingsRepository } from '@/domain/translation/repositories/TranslationSettingsRepository'
import { validateStringsXml } from '@/domain/translation/validation/validateStringsXml'
import {
  activeCredential,
  applySettings,
  canTranslate,
  initialStringTranslatorState,
} from './StringTranslatorContract'
import type {
  ModelSettingsState,
  StringTranslatorEffect,
  StringTranslatorIntent,
  StringTranslatorState,
} from './StringTranslatorContract'

/**
 * ViewModel của màn dịch chuỗi.
 *
 * Không một dòng React nào trong file này — luật ESLint chặn nếu ai đó thêm
 * vào. Việc tải tệp về là Effect, không phải lời gọi thẳng vào `document`.
 *
 * Phần soi tệp chạy NGAY tại trình duyệt, không gửi lên máy chủ. Người dùng
 * biết tệp hỏng ở đâu trong vài mili giây thay vì sau một vòng gọi mạng, và
 * cùng bộ luật đó vẫn chạy lại lần nữa ở Route Handler — bên này là màn hình,
 * không phải hàng rào.
 */
export interface StringTranslatorDeps {
  translation: TranslationRepository
  settings: TranslationSettingsRepository
  /**
   * Cấu hình máy chủ đã đọc sẵn lúc dựng trang.
   *
   * Đi qua phụ thuộc chứ không qua một intent "nạp lúc mở màn": trang là Server
   * Component nên nó đọc được DB trước khi HTML rời máy chủ. Nạp lại bằng một
   * lượt gọi API sau khi màn hình đã hiện chỉ để lấy đúng dữ liệu đó là thêm
   * một nhịp nháy ô chọn model từ rỗng sang có.
   */
  initialSettings: TranslationSettings
}

type Context = IntentContext<StringTranslatorState, StringTranslatorEffect>

/** Đúng thứ tự trong danh sách hỗ trợ, để chọn/bỏ chọn không xáo trộn thứ tự. */
const inCanonicalOrder = (codes: readonly string[]): string[] =>
  SUPPORTED_LANGUAGES.filter((language) => codes.includes(language.code)).map(
    (language) => language.code,
  )

function pickFile(ctx: Context, fileName: string, content: string): void {
  const report = validateStringsXml(content)

  ctx.setState((state) => ({
    ...state,
    status: 'ready',
    fileName,
    xml: content,
    report,
    // Chọn tệp mới là bắt đầu lại: giữ lại tệp zip của lượt trước thì nút tải
    // về vẫn bấm được và người dùng tải nhầm bản cũ mà không có gì báo.
    archive: null,
    failed: [],
    finished: [],
    running: 0,
    error: null,
  }))

  if (!report.acceptable) {
    const errors = report.findings.filter((finding) => finding.severity === 'error').length
    ctx.emit({
      type: 'ShowMessage',
      severity: 'error',
      message: `Tệp có ${errors} lỗi phải sửa trước khi dịch.`,
    })
    return
  }

  ctx.emit({
    type: 'ShowMessage',
    severity: 'success',
    message: `Đã nạp ${report.translatableCount} chuỗi từ ${fileName}.`,
  })
}

const patchSettings = (
  ctx: Context,
  change: (settings: ModelSettingsState) => ModelSettingsState,
): void => {
  ctx.setState((state) => ({ ...state, settings: change(state.settings) }))
}

/**
 * Gắn khoá API.
 *
 * Máy chủ xác thực khoá bằng một lượt hỏi danh sách model, nên thành công ở đây
 * đồng thời cho luôn danh sách để đổ vào ô chọn — không cần một lượt gọi thứ hai.
 */
async function submitApiKey(ctx: Context, deps: StringTranslatorDeps): Promise<void> {
  const { settings } = ctx.getState()
  const apiKey = settings.keyDraft.trim()

  const shape = inspectApiKeyShape(settings.provider, apiKey)
  if (!shape.ok) {
    patchSettings(ctx, (current) => ({ ...current, keyNotice: shape.message ?? null }))
    return
  }

  patchSettings(ctx, (current) => ({
    ...current,
    checkingKey: true,
    // Cảnh báo hình dạng (sai tiền tố) vẫn hiện trong lúc kiểm — nó không chặn
    // lượt gọi, nhưng nếu lượt gọi hỏng thì đó là manh mối đầu tiên nên xem.
    keyNotice: shape.message ?? null,
  }))

  const outcome = await deps.settings.checkCredential(settings.provider, apiKey, ctx.signal)
  if (ctx.signal.aborted) return

  if (!outcome.ok) {
    patchSettings(ctx, (current) => ({
      ...current,
      checkingKey: false,
      keyNotice: outcome.error.message,
    }))
    return
  }

  const checked = outcome.value
  patchSettings(ctx, (current) => ({
    ...current,
    checkingKey: false,
    keyNotice: null,
    // Ô nhập được dọn sạch: từ đây trở đi màn hình vẽ khoá bằng `keyHint`, và
    // giữ lại khoá thô trong state là giữ một bí mật lâu hơn mức cần thiết.
    keyDraft: '',
    models: checked.models,
    modelsFor: checked.provider,
    credentials: current.credentials.map((credential) =>
      credential.provider === checked.provider
        ? { ...credential, hasKey: true, keyHint: checked.keyHint, model: checked.model }
        : credential,
    ),
  }))

  ctx.emit({
    type: 'ShowMessage',
    severity: 'success',
    message: `Khoá dùng được. Đang dịch bằng ${checked.model}.`,
  })
}

/** Nạp danh sách model bằng khoá ĐÃ lưu. Chỉ chạy khi ô chọn thật sự được mở. */
async function loadModels(ctx: Context, deps: StringTranslatorDeps): Promise<void> {
  const { settings } = ctx.getState()

  // Đã có danh sách đúng của nhà cung cấp này thì thôi. Không có chốt này thì
  // mỗi lần mở ô chọn là một lượt gọi ra ngoài.
  if (settings.modelsFor === settings.provider && settings.models.length > 0) return
  if (!activeCredential(settings).hasKey) return

  patchSettings(ctx, (current) => ({ ...current, loadingModels: true }))

  const outcome = await deps.settings.listModels(settings.provider, ctx.signal)
  if (ctx.signal.aborted) return

  if (!outcome.ok) {
    patchSettings(ctx, (current) => ({ ...current, loadingModels: false }))
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: outcome.error.message })
    return
  }

  patchSettings(ctx, (current) => ({
    ...current,
    loadingModels: false,
    models: outcome.value,
    modelsFor: settings.provider,
  }))
}

/**
 * Ghi phần cấu hình không phải khoá xuống máy chủ.
 *
 * Máy chủ trả về nguyên trạng thái sau khi ghi, và state nhận theo nó — đổi nhà
 * cung cấp kéo theo model đổi sang model của bên kia, mà màn hình không tự suy
 * ra được điều đó.
 */
async function savePreference(
  ctx: Context,
  deps: StringTranslatorDeps,
  patch: Parameters<TranslationSettingsRepository['savePreference']>[0],
): Promise<void> {
  const outcome = await deps.settings.savePreference(patch, ctx.signal)
  if (ctx.signal.aborted || !outcome.ok) {
    // Ghi hỏng không làm hỏng màn hình: giá trị người dùng vừa gõ vẫn nằm trong
    // state và vẫn đi theo lượt dịch. Thứ mất là việc nhớ cho lần sau.
    if (!ctx.signal.aborted && outcome.ok === false) {
      ctx.emit({ type: 'ShowMessage', severity: 'error', message: outcome.error.message })
    }
    return
  }

  ctx.setState((state) => ({ ...state, settings: applySettings(state.settings, outcome.value) }))
}

async function translate(ctx: Context, deps: StringTranslatorDeps): Promise<void> {
  const state = ctx.getState()
  if (state.xml === null || !canTranslate(state)) return

  ctx.setState((current) => ({
    ...current,
    status: 'translating',
    running: current.selected.length,
    finished: [],
    failed: [],
    archive: null,
    error: null,
  }))

  const outcome = await deps.translation.translate(
    {
      fileName: state.fileName ?? 'strings.xml',
      xml: state.xml,
      appName: state.appName.trim(),
      appDescription: state.appDescription.trim(),
      languages: state.selected,
    },
    (event) => {
      // Tiến độ chỉ được ghi khi lượt này còn sống. Không có chốt chặn này thì
      // một lượt đã huỷ vẫn vẽ tiếp lên màn hình của lượt mới.
      if (ctx.signal.aborted) return
      if (event.type === 'language') {
        ctx.setState((current) => ({
          ...current,
          finished: [
            ...current.finished,
            {
              code: event.code,
              ok: event.ok,
              ...(event.message !== undefined ? { message: event.message } : {}),
            },
          ],
        }))
      }
    },
    ctx.signal,
  )

  if (ctx.signal.aborted) return

  if (!outcome.ok) {
    ctx.setState((current) => ({ ...current, status: 'failed', error: outcome.error }))
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: outcome.error.message })
    return
  }

  ctx.setState((current) => ({
    ...current,
    status: 'done',
    archive: outcome.value.archive,
    failed: outcome.value.failed,
  }))

  const failedCount = outcome.value.failed.length
  ctx.emit({
    type: 'ShowMessage',
    severity: failedCount === 0 ? 'success' : 'info',
    message:
      failedCount === 0
        ? 'Dịch xong. Bấm "Tải tệp .zip" để lưu về máy.'
        : `Dịch xong, ${failedCount} ngôn ngữ chưa trọn vẹn. Xem danh sách bên dưới rồi chạy lại riêng những ngôn ngữ đó.`,
  })
}

export const StringTranslatorViewModel = defineViewModel<
  StringTranslatorState,
  StringTranslatorIntent,
  StringTranslatorEffect,
  StringTranslatorDeps
>({
  name: 'StringTranslator',

  initialState: (deps) => ({
    ...initialStringTranslatorState,
    appName: deps.initialSettings.appName,
    appDescription: deps.initialSettings.appDescription,
    settings: applySettings(initialStringTranslatorState.settings, deps.initialSettings),
  }),

  /**
   * Cả `TranslateRequested` và `TranslationCancelled` cùng mang khoá
   * `translate`, và đó chính là cơ chế huỷ: intent mới cùng khoá huỷ intent cũ.
   * Nhờ vậy không cần giữ một `AbortController` nào trong state, và bấm "Dịch"
   * hai lần liên tiếp cũng không bao giờ chạy hai lượt chồng nhau.
   */
  intentKey: (intent) => {
    switch (intent.type) {
      case 'TranslateRequested':
      case 'TranslationCancelled':
        return 'translate'
      // Bấm "Kiểm tra" hai lần liên tiếp thì lượt sau huỷ lượt trước, thay vì
      // hai lượt cùng ghi và lượt chậm hơn thắng.
      case 'ApiKeySubmitted':
        return 'credential'
      case 'ModelListRequested':
        return 'models'
      // Gõ nhanh rồi rời ô nhập nhiều lần: chỉ lượt ghi cuối cùng còn sống.
      case 'AppContextCommitted':
        return 'preference:app'
      // Khoá RIÊNG, không dùng chung với dòng trên. Dùng chung thì đổi provider
      // rồi rời ô mô tả ngay sau đó sẽ huỷ lượt ghi provider giữa chừng: giao
      // diện hiện Gemini còn máy chủ vẫn dịch bằng OpenAI, không có gì báo.
      //
      // Hai nhánh này thì CHIA chung khoá được, vì `ModelChanged` gửi kèm cả
      // `provider` trong cùng một lượt ghi — huỷ lượt trước không mất gì.
      case 'ProviderChanged':
      case 'ModelChanged':
        return 'preference:provider'
      default:
        return undefined
    }
  },

  onError: (error, _intent, ctx) => {
    ctx.setState((state) => ({ ...state, status: 'failed', error }))
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: error.message })
  },

  handleIntent: async (intent, ctx, deps) => {
    switch (intent.type) {
      case 'FilePicked':
        pickFile(ctx, intent.fileName, intent.content)
        return

      case 'FileCleared':
        ctx.setState((state) => ({
          ...initialStringTranslatorState,
          // Những thứ này là lựa chọn của người dùng chứ không thuộc về tệp,
          // nên chọn tệp khác không được xoá chúng đi.
          appName: state.appName,
          appDescription: state.appDescription,
          selected: state.selected,
          settings: state.settings,
        }))
        return

      case 'AppNameChanged':
        ctx.setState((state) => ({ ...state, appName: intent.value }))
        return

      case 'AppDescriptionChanged':
        ctx.setState((state) => ({ ...state, appDescription: intent.value }))
        return

      case 'AppContextCommitted': {
        const state = ctx.getState()
        await savePreference(ctx, deps, {
          appName: state.appName,
          appDescription: state.appDescription,
        })
        return
      }

      case 'ProviderChanged':
        // Đổi state trước rồi mới ghi: ô chọn phải nhảy ngay theo tay người
        // dùng chứ không đợi một vòng gọi mạng.
        patchSettings(ctx, (current) => ({
          ...current,
          provider: intent.provider,
          models: [],
          modelsFor: null,
          keyDraft: '',
          keyNotice: null,
        }))
        await savePreference(ctx, deps, { provider: intent.provider })
        return

      case 'ModelChanged':
        patchSettings(ctx, (current) => ({
          ...current,
          credentials: current.credentials.map((credential) =>
            credential.provider === current.provider
              ? { ...credential, model: intent.model }
              : credential,
          ),
        }))
        await savePreference(ctx, deps, { provider: ctx.getState().settings.provider, model: intent.model })
        return

      case 'ModelListRequested':
        await loadModels(ctx, deps)
        return

      case 'ApiKeyDraftChanged':
        patchSettings(ctx, (current) => ({ ...current, keyDraft: intent.value, keyNotice: null }))
        return

      case 'ApiKeySubmitted':
        await submitApiKey(ctx, deps)
        return

      case 'LanguageToggled':
        ctx.setState((state) => ({
          ...state,
          selected: inCanonicalOrder(
            state.selected.includes(intent.code)
              ? state.selected.filter((code) => code !== intent.code)
              : [...state.selected, intent.code],
          ),
        }))
        return

      case 'AllLanguagesToggled':
        ctx.setState((state) => ({
          ...state,
          selected: intent.value ? SUPPORTED_LANGUAGES.map((language) => language.code) : [],
        }))
        return

      case 'TranslateRequested':
        await translate(ctx, deps)
        return

      case 'TranslationCancelled':
        // Lượt đang chạy đã bị huỷ bởi chính khoá intent trước khi tới đây;
        // ở đây chỉ còn việc đưa màn hình về trạng thái bấm lại được.
        ctx.setState((state) => ({
          ...state,
          status: state.xml === null ? 'idle' : 'ready',
          running: 0,
          finished: [],
        }))
        ctx.emit({ type: 'ShowMessage', severity: 'info', message: 'Đã dừng lượt dịch.' })
        return

      case 'DownloadRequested': {
        const { archive } = ctx.getState()
        if (archive === null) {
          ctx.emit({ type: 'ShowMessage', severity: 'error', message: 'Chưa có tệp nào để tải.' })
          return
        }
        ctx.emit({
          type: 'DownloadArchive',
          fileName: archive.fileName,
          base64: archive.base64,
        })
        return
      }
    }
  },

  // Không có `createDependencies`: `initialSettings` chỉ máy chủ mới biết, nên
  // phụ thuộc phải do `StringTranslatorRoot` truyền vào. Bỏ trống ở đây khiến
  // trình biên dịch bắt lỗi ngay nếu ai đó dựng Provider mà quên `deps`.
})

/** Dựng phụ thuộc thật cho màn hình. Test truyền bộ khác vào. */
export const stringTranslatorDeps = (
  initialSettings: TranslationSettings,
): StringTranslatorDeps => ({
  translation: clientContainer.translation,
  settings: clientContainer.translationSettings,
  initialSettings,
})
