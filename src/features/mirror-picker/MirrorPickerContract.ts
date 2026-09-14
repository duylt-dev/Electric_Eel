import type { AppError } from '@/core/result'
import { isUsable } from '@/domain/adb/entities/AdbDevice'
import type { AdbDevice } from '@/domain/adb/entities/AdbDevice'

/**
 * Hợp đồng của màn chọn thiết bị để mở Màn hình máy.
 *
 * Nhỏ hơn nhiều so với `LogcatPickerContract`: không có bước chọn app, vì
 * mirror gắn thẳng vào một thiết bị chứ không phải một tiến trình trên đó.
 *
 *   State  — thứ màn hình vẽ ra. Dữ liệu thuần.
 *   Intent — mọi thứ có thể yêu cầu ViewModel làm.
 *   Effect — việc xảy ra một lần: thông báo, điều hướng sang màn mirror.
 */

// ─── State ──────────────────────────────────────────────────────────────────

export type MirrorPickerStatus = 'loading' | 'ready' | 'failed'

export interface MirrorPickerState {
  readonly status: MirrorPickerStatus
  readonly devices: readonly AdbDevice[]
  readonly selectedSerial: string | null
  readonly error: AppError | null
}

export const initialMirrorPickerState: MirrorPickerState = {
  status: 'loading',
  devices: [],
  selectedSerial: null,
  error: null,
}

// ─── Intent ─────────────────────────────────────────────────────────────────

export type MirrorPickerIntent =
  | { type: 'DevicesRefreshRequested' }
  | { type: 'DeviceSelected'; serial: string }
  | { type: 'MirrorOpened' }

// ─── Effect ─────────────────────────────────────────────────────────────────

export type MirrorPickerEffect =
  | { type: 'ShowMessage'; severity: 'success' | 'error' | 'info'; message: string }
  /** Điều hướng là Effect, không phải lời gọi router từ trong ViewModel. */
  | { type: 'OpenMirror'; serial: string }

// ─── Dẫn xuất từ state ──────────────────────────────────────────────────────

/** Máy đang sẵn sàng nhận lệnh. Máy `unauthorized`/`offline` vẫn hiện, nhưng không chọn được. */
export const usableDevices = (state: MirrorPickerState): AdbDevice[] => state.devices.filter(isUsable)
