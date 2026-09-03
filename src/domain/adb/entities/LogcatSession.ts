import type { AppErrorKind } from '../../../core/result'

/** Một yêu cầu mở luồng log. Đây là toàn bộ những gì trình duyệt gửi lên. */
export interface LogcatRequest {
  readonly serial: string
  readonly packageName: string
  /** Chạy `adb logcat -c` trước khi bám: bắt đầu từ một màn hình sạch. */
  readonly clearFirst?: boolean
}

/**
 * Những gì máy chủ đẩy về trong lúc luồng đang chảy.
 *
 * `lines` mang dòng THÔ, chưa tách. Máy chủ không cần hiểu định dạng log, và
 * một dòng thô nhẹ hơn nhiều so với cùng dòng đó đã tách thành sáu trường —
 * trên một luồng vài nghìn dòng mỗi phút thì đó là khác biệt đáng kể.
 */
export type LogcatEvent =
  /** Đã tìm thấy tiến trình và bắt đầu đọc log của nó. */
  | { readonly type: 'attached'; readonly pid: number }
  /** App chưa chạy. Máy chủ vẫn đang dò lại; người dùng không phải bấm gì. */
  | { readonly type: 'waiting' }
  | { readonly type: 'lines'; readonly lines: readonly string[] }
  /** Tiến trình đã chết. Máy chủ tự đi tìm pid mới ngay sau đó. */
  | { readonly type: 'detached'; readonly pid: number }
  /** Chuyện đáng nói nhưng không làm hỏng luồng, ví dụ xoá đệm không thành. */
  | { readonly type: 'notice'; readonly message: string }
  | {
      readonly type: 'failed'
      readonly kind: AppErrorKind
      readonly message: string
      readonly detail?: string
    }
