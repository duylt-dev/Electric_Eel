import type { Result } from '../../../core/result'
import type { LlmProviderName } from '../entities/LlmProvider'
import type { TranslationSettings, TranslationSettingsPatch } from '../entities/TranslationSettings'

/**
 * Kho cấu hình mô hình của người dùng. Cổng CHỈ dùng ở phía máy chủ.
 *
 * Hai đường đọc tách hẳn nhau, và đó là điểm chính của cổng này:
 *
 *   · `read`  trả về thứ vẽ được lên màn hình. Không có khoá.
 *   · `resolve` trả về khoá thật, và chỉ được gọi ở nơi sắp gọi nhà cung cấp.
 *
 * Gộp làm một hàm thì mỗi lần vẽ màn hình lại kéo một khoá đã giải mã vào bộ
 * nhớ tiến trình mà không ai cần tới nó.
 */
export interface ResolvedLlmCredential {
  readonly provider: LlmProviderName
  /** Khoá đã giải mã. Không bao giờ được đưa vào phản hồi HTTP. */
  readonly apiKey: string
  readonly model: string
}

export interface TranslationSettingsStore {
  /** Cấu hình để vẽ màn hình. Người chưa từng cấu hình gì vẫn nhận về mặc định. */
  read(userId: string): Promise<Result<TranslationSettings>>

  /** Khoá thật của một nhà cung cấp. `null` khi người này chưa gắn khoá nào. */
  resolve(userId: string, provider: LlmProviderName): Promise<Result<ResolvedLlmCredential | null>>

  /**
   * Ghi khoá mới (đã mã hoá) kèm model đi cùng.
   *
   * Bên gọi phải xác thực khoá TRƯỚC khi gọi hàm này — kho không biết thế nào
   * là một khoá dùng được, và ghi một khoá hỏng đè lên khoá đang chạy được là
   * cách làm hỏng thứ đang hoạt động.
   */
  saveCredential(
    userId: string,
    provider: LlmProviderName,
    apiKey: string,
    model: string,
  ): Promise<Result<void>>

  /** Ghi phần không phải khoá. Trường nào không truyền thì giữ nguyên. */
  savePreference(userId: string, patch: TranslationSettingsPatch): Promise<Result<void>>
}
