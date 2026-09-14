import type { Result } from '../../../core/result'
import type { MirrorControlMessage } from '../entities/MirrorControlMessage'
import type { MirrorRequest } from '../entities/MirrorRequest'
import type { MirrorStreamEvent } from '../entities/MirrorStreamEvent'

/**
 * Cổng phía TRÌNH DUYỆT mà ViewModel dùng (cùng vai trò với `AdbRepository`
 * bên logcat, khác domain).
 */
export interface MirrorRepository {
  /**
   * Mở luồng video của một phiên mirror, giữ tới khi bị huỷ.
   *
   * Chỉ trả về khi luồng kết thúc. Huỷ bằng `signal` là cách dừng DUY NHẤT —
   * không có `stop()` riêng, cùng lý do với `AdbRepository.streamLogcat`: một
   * luồng dừng được bằng hai đường là một luồng có hai chỗ để quên dọn.
   */
  stream(
    request: MirrorRequest,
    onEvent: (event: MirrorStreamEvent) => void,
    signal: AbortSignal,
  ): Promise<Result<void>>

  /**
   * Gửi MỘT thông điệp điều khiển.
   *
   * Gộp lô (move theo pointer) là việc của ĐƯỜNG TRUYỀN — `HttpMirrorRepository`
   * (phase 04) tự gom qua `ControlOutbox` trước khi bắn POST. ViewModel không
   * cần biết chuyện gộp lô, nó chỉ gửi từng thông điệp khi sự kiện xảy ra.
   */
  sendControl(sessionId: string, message: MirrorControlMessage, signal: AbortSignal): Promise<Result<void>>
}
