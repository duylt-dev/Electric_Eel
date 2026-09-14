import type { AppError, Result } from '../../../core/result'
import type { MirrorVideoPacket } from '../entities/MirrorVideoPacket'

/**
 * Cổng phía TRÌNH DUYỆT: nơi gói video đi vào để được giải mã và vẽ.
 *
 * Hiện thực thật (phase 04) bọc `WebCodecsVideoDecoder` +
 * `WebGLVideoFrameRenderer` của Tango lên một `<canvas>`. v1 chỉ có đường này
 * — không tinyh264 (xem quyết định #5 trong `plan.md`), nên `supported` là
 * `false` khi trình duyệt không có WebCodecs H.264, và Screen phải báo
 * "đổi Chrome/Edge" thay vì cố decode.
 */
export interface MirrorVideoSink {
  readonly supported: boolean
  push(packet: MirrorVideoPacket): void
  /**
   * Bộ giải mã hỏng không hồi phục được (profile H.264 máy không hỗ trợ, GPU
   * reset). `push` là một chiều và không trả gì, nên đây là đường DUY NHẤT để
   * ViewModel biết canvas đã đứng hình mà luồng thì vẫn chảy — không có nó,
   * màn hình báo "đang chảy" trên một ảnh chết. Gọi listener nhiều nhất một
   * lần cho mỗi vòng đời decoder; trả hàm gỡ đăng ký.
   */
  onError(listener: (error: AppError) => void): () => void
  /** Chụp khung hiện tại trên canvas thành PNG — độ phân giải = luồng video, không phải màn hình gốc. */
  snapshotPng(): Promise<Result<Uint8Array>>
  dispose(): void
}
