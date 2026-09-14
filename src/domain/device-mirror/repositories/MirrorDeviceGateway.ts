import type { Result } from '../../../core/result'
import type { MirrorControlMessage } from '../entities/MirrorControlMessage'
import type { MirrorRequest } from '../entities/MirrorRequest'
import type { MirrorVideoPacket } from '../entities/MirrorVideoPacket'

export interface MirrorDeviceSessionMeta {
  readonly deviceName: string
  readonly width: number
  readonly height: number
}

/**
 * Một phiên scrcpy đang chạy — chỉ kiểu WEB CHUẨN (`AsyncIterable`,
 * `Uint8Array`, hàm huỷ đăng ký), không lộ bất cứ kiểu nào của Tango
 * (`Consumable`, `ReadableStream` gốc, `AdbScrcpyClient`) ra khỏi `data/`.
 *
 * Đổi lại, adapter ở phase 03 phải tự quy đổi: gói `data` của Tango có
 * `keyframe`/`pts` OPTIONAL (spike-report §2) thành `keyframe === true` /
 * `pts ?? 0n` bắt buộc trước khi đưa vào `packets()`.
 */
export interface MirrorDeviceSession {
  readonly meta: MirrorDeviceSessionMeta
  /** Gói video, theo đúng thứ tự nhận được từ scrcpy-server. */
  packets(): AsyncIterable<MirrorVideoPacket>
  /** Máy xoay màn hình giữa phiên. Trả về hàm huỷ đăng ký. */
  onSize(listener: (size: { width: number; height: number }) => void): () => void
  control(messages: readonly MirrorControlMessage[]): Promise<Result<void>>
  close(): Promise<void>
}

/**
 * Cổng phía SERVER: mở một phiên scrcpy thật trên máy đang cắm qua adb.
 *
 * Chỉ một hàm — mở phiên. Đóng phiên là việc của chính `MirrorDeviceSession`
 * (`close()`), không phải của cổng, vì vòng đời một phiên gắn với chính nó
 * (huỷ theo `AbortSignal` của request đã mở nó), không gắn với gateway.
 */
export interface MirrorDeviceGateway {
  start(request: MirrorRequest, signal: AbortSignal): Promise<Result<MirrorDeviceSession>>
}
