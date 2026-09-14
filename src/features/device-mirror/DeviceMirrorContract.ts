import type { AppError } from '@/core/result'
import type { MirrorKey, MirrorTouchAction } from '@/domain/device-mirror/entities/MirrorControlMessage'
import { DEFAULT_MIRROR_QUALITY } from '@/domain/device-mirror/entities/MirrorRequest'
import type { MirrorRequest } from '@/domain/device-mirror/entities/MirrorRequest'

/**
 * Hợp đồng của màn mirror một thiết bị.
 *
 *   State  — thứ màn hình vẽ ra. KHÔNG chứa canvas/decoder: đó là tài sản của
 *            `MirrorVideoSink`, sống ở Root ngoài State (`docs/architecture.md`
 *            §2 — State chỉ chứa dữ liệu, không tham chiếu DOM).
 *   Intent — bốn cái đầu chạy được ở phase này (mở/dừng luồng, đổi chất lượng,
 *            bật/tắt điều khiển). Tám cái sau (chạm, cuộn, phím, gõ chữ, xoay,
 *            tắt/bật màn hình, kéo thanh thông báo, chụp màn hình) khai SẴN ở
 *            đây để `switch` trong ViewModel vét cạn ngay từ bây giờ — phase 06
 *            chỉ phải lấp nội dung, không phải sửa Contract lần thứ hai.
 *   Effect — thông báo, tải tệp (dùng cho `SnapshotRequested` ở phase 06).
 */

// ─── State ──────────────────────────────────────────────────────────────────

export type MirrorStatus = 'connecting' | 'streaming' | 'stopped' | 'failed' | 'unsupported'

/** Ba tham số scrcpy có thể đổi được sau khi đã mở luồng — đổi nghĩa là nối lại. */
export type MirrorQuality = Pick<MirrorRequest, 'maxSize' | 'maxFps' | 'bitRateMbps'>

export interface MirrorFrameSize {
  readonly width: number
  readonly height: number
}

export interface DeviceMirrorState {
  readonly serial: string
  readonly status: MirrorStatus

  /** Định danh phiên hiện tại trên máy chủ — cần để gửi lệnh điều khiển (phase 06). */
  readonly sessionId: string | null
  /** Tên máy do scrcpy-server báo, đến từ sự kiện `meta`. `null` tới khi luồng chưa mở xong. */
  readonly deviceName: string | null
  /**
   * Kích cỡ khung hình đang chảy. Đổi khi máy xoay (sự kiện `size`), không đụng
   * tới canvas — WebGL renderer trong `MirrorVideoSink` tự resize theo khung.
   */
  readonly frameSize: MirrorFrameSize | null

  readonly quality: MirrorQuality
  /** Có mở kênh điều khiển (chạm/phím) hay chỉ xem. Đổi thì phải nối lại luồng — server cần biết ngay lúc bắt tay, không có API "bật giữa chừng". */
  readonly controlEnabled: boolean
  /** Màn hình thiết bị đang bật hay tắt — phase 06 đổi bằng `DisplayPowerToggled`. */
  readonly displayOn: boolean

  readonly error: AppError | null
}

export const initialDeviceMirrorState = (serial: string): DeviceMirrorState => ({
  serial,
  status: 'connecting',
  sessionId: null,
  deviceName: null,
  frameSize: null,
  quality: DEFAULT_MIRROR_QUALITY,
  controlEnabled: false,
  displayOn: true,
  error: null,
})

// ─── Intent ─────────────────────────────────────────────────────────────────

export type DeviceMirrorIntent =
  | { type: 'StreamRequested' }
  | { type: 'StreamStopped' }
  | { type: 'QualityChanged'; quality: MirrorQuality }
  | { type: 'ControlToggled'; enabled: boolean }
  // ─ phase 06 — điều khiển thật. ViewModel hiện xử lý bằng nhánh no-op. ─
  | {
      type: 'TouchInput'
      action: MirrorTouchAction
      pointer: number
      nx: number
      ny: number
      pressure: number
    }
  | { type: 'ScrollInput'; nx: number; ny: number; dx: number; dy: number }
  | { type: 'KeyTapped'; key: MirrorKey }
  | { type: 'TextSubmitted'; text: string }
  | { type: 'RotateRequested' }
  | { type: 'DisplayPowerToggled' }
  | { type: 'NotificationsRequested' }
  | { type: 'SnapshotRequested' }

// ─── Effect ─────────────────────────────────────────────────────────────────

export type DeviceMirrorEffect =
  | { type: 'ShowMessage'; severity: 'success' | 'error' | 'info'; message: string }
  /** Trình duyệt lưu tệp về thư mục Tải xuống — dùng cho `SnapshotRequested` ở phase 06. */
  | { type: 'DownloadFile'; fileName: string; bytes: Uint8Array; mimeType: string }

// ─── Dẫn xuất từ state ──────────────────────────────────────────────────────
//
// Để ở đây thay vì tính trong component: đây là quy tắc, không phải cách trình
// bày, và cần kiểm thử được mà không cần render gì.

export const isLive = (state: DeviceMirrorState): boolean =>
  state.status === 'connecting' || state.status === 'streaming'

/**
 * Kích cỡ khung hình "đã biết", hay `null` khi máy chủ chưa biết.
 *
 * Tango chỉ đọc được kích cỡ SAU khi gói SPS đầu tiên đi qua, nên sự kiện
 * `meta` luôn mang `0×0` (đo trên máy thật, `phase-03-report.md` §4.5); con
 * số thật tới ngay sau bằng sự kiện `size`. Coi `0×0` là "chưa biết" thay vì
 * hiện "0×0" trên MetaChip trong vài mili-giây.
 */
export const knownFrameSize = (width: number, height: number): MirrorFrameSize | null =>
  width > 0 && height > 0 ? { width, height } : null

/** Gửi được lệnh điều khiển khi: đang chảy thật, người dùng đã bật điều khiển, và có phiên để gửi tới. */
export const canControl = (state: DeviceMirrorState): boolean =>
  state.status === 'streaming' && state.controlEnabled && state.sessionId !== null

/** `mirror-RF8Y60B9NCZ-20260913-1145.png` — đọc tên là biết máy nào, chụp lúc nào. */
export function snapshotFileName(serial: string, at: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`
  return `mirror-${serial}-${stamp}.png`
}

/** `1440p · 60fps · 8Mbps` — `maxSize: 0` là độ phân giải GỐC, không phải "0p". */
export function qualityLabel(quality: MirrorQuality): string {
  const size = quality.maxSize === 0 ? 'Gốc' : `${quality.maxSize}p`
  return `${size} · ${quality.maxFps}fps · ${quality.bitRateMbps}Mbps`
}
