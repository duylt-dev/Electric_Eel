import type { Result } from '../../core/result'
import type { LlmProviderName } from '../../domain/translation/entities/LlmProvider'
import type {
  CredentialCheckResult,
  TranslationSettings,
  TranslationSettingsPatch,
} from '../../domain/translation/entities/TranslationSettings'
import type { TranslationSettingsRepository } from '../../domain/translation/repositories/TranslationSettingsRepository'
import { httpJson } from '../http/httpJson'

/**
 * Hiện thực CHẠY TRÊN TRÌNH DUYỆT của cổng cấu hình mô hình.
 *
 * Khoá API đi lên qua thân POST và không bao giờ quay xuống: `checkCredential`
 * nhận về danh sách model cùng bốn ký tự cuối, không nhận về khoá. Nhờ vậy
 * khoá chỉ tồn tại trong bộ nhớ trang đúng quãng từ lúc người dùng dán vào tới
 * lúc gửi đi.
 */
const BASE = '/api/translations'

export class HttpTranslationSettingsRepository implements TranslationSettingsRepository {
  checkCredential(
    provider: LlmProviderName,
    apiKey: string,
    signal?: AbortSignal,
  ): Promise<Result<CredentialCheckResult>> {
    return httpJson<CredentialCheckResult>(`${BASE}/credential`, {
      method: 'POST',
      body: { provider, apiKey },
      ...(signal !== undefined ? { signal } : {}),
    })
  }

  async listModels(provider: LlmProviderName, signal?: AbortSignal): Promise<Result<string[]>> {
    const outcome = await httpJson<{ models: string[] }>(
      `${BASE}/models?provider=${encodeURIComponent(provider)}`,
      signal !== undefined ? { signal } : {},
    )
    return outcome.ok ? { ok: true, value: outcome.value.models } : outcome
  }

  savePreference(
    patch: TranslationSettingsPatch,
    signal?: AbortSignal,
  ): Promise<Result<TranslationSettings>> {
    return httpJson<TranslationSettings>(`${BASE}/settings`, {
      method: 'PUT',
      body: patch,
      ...(signal !== undefined ? { signal } : {}),
    })
  }
}
