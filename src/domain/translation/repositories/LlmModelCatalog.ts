import type { Result } from '../../../core/result'
import type { LlmProviderName } from '../entities/LlmProvider'

/**
 * Cổng "hỏi nhà cung cấp xem khoá này dùng được model nào".
 *
 * Một lượt gọi phục vụ hai việc cùng lúc, nên nó rẻ hơn vẻ ngoài:
 *
 *   1. XÁC THỰC khoá. Khoá sai thì nhà cung cấp trả 401 ngay, không tốn token.
 *   2. Đổ danh sách model cho ô chọn — đúng những model mà chính khoá đó truy
 *      cập được, thay vì một danh sách viết cứng trong code rồi lạc hậu dần.
 *
 * Tách khỏi `StringTranslator` vì hai cổng có vòng đời khác nhau: cổng này
 * chạy lúc cấu hình, cổng kia chạy lúc dịch.
 */
export interface LlmModelCatalog {
  /**
   * Danh sách model sinh văn bản được, đã lọc và sắp xếp.
   *
   * Lỗi xác thực về dưới dạng `AppError` loại `upstream` — cùng cách quy lỗi
   * với lúc dịch, nên màn hình không phải học hai bộ mã lỗi.
   */
  list(provider: LlmProviderName, apiKey: string, signal?: AbortSignal): Promise<Result<string[]>>
}
