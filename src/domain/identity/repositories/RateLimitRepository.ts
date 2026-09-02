import type { Result } from '../../../core/result'
import type { RateLimitRule, RateLimitVerdict } from '../entities/RateLimitPolicy'

/**
 * Bộ đếm nhịp.
 *
 * Cổng chỉ nói "đếm" và "ghi thêm một lần hỏng"; chuyện đếm ở đâu là việc của
 * tầng data. Hiện đếm trong DB — chọn vậy vì môi trường triển khai chưa chốt,
 * mà bộ đếm trong bộ nhớ tiến trình thì sai ngay khi có instance thứ hai, và
 * sai theo hướng nguy hiểm: mỗi instance cấp cho kẻ dò một hạn mức mới.
 */
export interface RateLimitRepository {
  /**
   * Hỏi xem một khoá còn lượt không. KHÔNG ghi gì — đây là phép đọc, gọi trước
   * khi làm việc nặng (so sánh bcrypt) chứ không phải sau.
   */
  check(bucket: string, rule: RateLimitRule): Promise<Result<RateLimitVerdict>>

  /** Ghi lại một lần hỏng. Gọi sau khi biết chắc là hỏng. */
  recordFailure(bucket: string): Promise<void>

  /** Xoá lịch sử hỏng của một khoá. Gọi khi đăng nhập thành công. */
  clear(bucket: string): Promise<void>
}
