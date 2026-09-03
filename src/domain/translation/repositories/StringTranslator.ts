import type { Result } from '../../../core/result'
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
  translateChunk(request: TranslateChunkRequest, signal?: AbortSignal): Promise<Result<string>>
}
