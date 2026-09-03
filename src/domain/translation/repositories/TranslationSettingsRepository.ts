import type { Result } from '../../../core/result'
import type { LlmProviderName } from '../entities/LlmProvider'
import type {
  CredentialCheckResult,
  TranslationSettings,
  TranslationSettingsPatch,
} from '../entities/TranslationSettings'

/**
 * Cổng cấu hình mô hình nhìn từ TRÌNH DUYỆT.
 *
 * Khác `TranslationSettingsStore` ở chỗ nó không biết gì về DB hay mã hoá — nó
 * chỉ gọi Route Handler. ViewModel phụ thuộc vào đây nên test được bằng một
 * adapter giả, không cần dựng máy chủ.
 */
export interface TranslationSettingsRepository {
  /**
   * Gửi khoá lên để xác thực. Trả về danh sách model nếu khoá dùng được.
   *
   * Khoá đi lên qua thân POST và không quay xuống lại: phản hồi chỉ mang bốn
   * ký tự cuối.
   */
  checkCredential(
    provider: LlmProviderName,
    apiKey: string,
    signal?: AbortSignal,
  ): Promise<Result<CredentialCheckResult>>

  /** Danh sách model theo khoá ĐÃ lưu của người dùng. */
  listModels(provider: LlmProviderName, signal?: AbortSignal): Promise<Result<string[]>>

  savePreference(
    patch: TranslationSettingsPatch,
    signal?: AbortSignal,
  ): Promise<Result<TranslationSettings>>
}
