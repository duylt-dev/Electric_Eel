import type { AppErrorKind } from '../../../core/result'
import type { MirrorVideoPacket } from './MirrorVideoPacket'

/**
 * Mọi thứ máy chủ đẩy về trình duyệt trong một phiên mirror, đi qua
 * `mirrorFrameCodec` (khung nhị phân) — cùng vai trò với `LogcatEvent` bên
 * logcat, chỉ khác domain và khác đường truyền (nhị phân thay vì NDJSON, vì
 * `video` mang `Uint8Array` + `bigint`).
 */
export type MirrorStreamEvent =
  /**
   * Gói ĐẦU TIÊN của phiên: đủ thông tin để trình duyệt dựng canvas + decoder
   * trước khi gói `video` nào tới. `width`/`height` ở đây là kích cỡ BAN ĐẦU —
   * xoay máy giữa phiên thì đổi qua sự kiện `size`, không sửa lại `meta`.
   */
  | {
      readonly type: 'meta'
      readonly sessionId: string
      readonly deviceName: string
      readonly width: number
      readonly height: number
      readonly codec: 'h264'
      readonly control: boolean
    }
  | { readonly type: 'video'; readonly packet: MirrorVideoPacket }
  /** Máy xoay màn hình — kích cỡ video đổi giữa phiên. Không phải lỗi. */
  | { readonly type: 'size'; readonly width: number; readonly height: number }
  | {
      readonly type: 'failed'
      readonly kind: AppErrorKind
      readonly message: string
      readonly detail?: string
    }
