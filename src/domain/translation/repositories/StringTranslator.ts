import type { AppError, Result } from '../../../core/result'
import type { LanguageOption } from '../entities/LanguageCode'

export interface TranslateChunkRequest {
  /** Mẻ XML ĐÃ che biểu tượng. Bên gọi che trước, không phải việc của adapter. */
  readonly xml: string
  readonly language: LanguageOption
  readonly appName: string
  /**
   * Mô tả app — app làm gì, cho ai. Chuỗi rỗng nghĩa là người dùng không viết,
   * và prompt bỏ hẳn phần đó đi thay vì gửi một dòng trống.
   */
  readonly appDescription: string
}

/**
 * Lỗi của một lượt gọi mô hình, kèm gợi ý thử lại.
 *
 * Hai trường thêm vào so với `AppError` là thứ duy nhất use case cần để quyết
 * định thử lại thế nào, và chỉ tầng data mới biết: nó đọc được mã HTTP và
 * tiêu đề `Retry-After`, còn use case chỉ thấy một câu tiếng Việt.
 *
 *   · `transient` — 429, 5xx, mất mạng: chờ rồi gọi lại là có cơ hội. Khoá sai
 *     hay model không tồn tại thì gọi lại một trăm lần vẫn thế.
 *   · `retryAfterMs` — nhà cung cấp nói rõ phải chờ bao lâu. Có thì dùng đúng
 *     số đó; thử sớm hơn chỉ ăn thêm một lần 429 nữa.
 *
 * Cả hai đều tuỳ chọn để một adapter giả trong test trả `AppError` thường vẫn
 * hợp lệ.
 */
export interface TranslateChunkError extends AppError {
  readonly transient?: boolean
  readonly retryAfterMs?: number
}

/**
 * Cổng ra mô hình ngôn ngữ.
 *
 * Hẹp có chủ ý — một hàm, nhận một mẻ, trả về một mẻ. Nhờ vậy toàn bộ phần
 * điều phối (cắt mẻ, che biểu tượng, chạy song song, thử lại, ghép tệp) nằm
 * trong use case và kiểm thử được bằng một adapter giả, không cần mạng và
 * không tốn một đồng token nào.
 */
export interface StringTranslator {
  /** Nhà cung cấp và model đang dùng, để ghi nhật ký và hiện lên giao diện. */
  readonly label: string
  translateChunk(
    request: TranslateChunkRequest,
    signal?: AbortSignal,
  ): Promise<Result<string, TranslateChunkError>>
}
