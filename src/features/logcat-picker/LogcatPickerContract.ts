import type { AppError } from '@/core/result'
import { isUsable } from '@/domain/adb/entities/AdbDevice'
import type { AdbDevice } from '@/domain/adb/entities/AdbDevice'

/**
 * Hợp đồng của màn chọn thiết bị và app.
 *
 * Đây là cửa vào của công cụ Logcat: chọn máy, rồi chọn app trên máy đó. Màn
 * hình thứ hai (luồng log) có ViewModel riêng — hai màn hình có vòng đời khác
 * hẳn nhau, một cái sống vài giây, cái kia giữ một kết nối mở hàng giờ.
 *
 *   State  — thứ màn hình vẽ ra. Dữ liệu thuần.
 *   Intent — mọi thứ có thể yêu cầu ViewModel làm.
 *   Effect — việc xảy ra một lần: thông báo, điều hướng.
 */

// ─── State ──────────────────────────────────────────────────────────────────

export type DeviceListStatus = 'loading' | 'ready' | 'failed'

/** `idle` = chưa chọn máy nào, nên chưa có gì để hỏi. */
export type PackageListStatus = 'idle' | 'loading' | 'ready' | 'failed'

export interface LogcatPickerState {
  readonly status: DeviceListStatus
  readonly devices: readonly AdbDevice[]
  readonly selectedSerial: string | null

  readonly packagesStatus: PackageListStatus
  /**
   * applicationId trần của các app CÀI THÊM, đúng thứ tự máy trả về.
   *
   * App hệ thống không bao giờ có trong này và không có công tắc để bật —
   * `pm list packages -3` là cố định ở tầng use case.
   *
   * Nhãn và thứ tự hiển thị KHÔNG nằm ở đây: chúng phụ thuộc danh bạ app, mà
   * danh bạ là dữ liệu của trang chứ không của thiết bị. Màn hình ghép hai thứ
   * lại bằng `buildPackageList` — một hàm thuần, chạy lại khi ô tìm kiếm đổi
   * mà không cần ViewModel biết gì về việc đó.
   */
  readonly packageNames: readonly string[]

  readonly error: AppError | null
}

export const initialLogcatPickerState: LogcatPickerState = {
  status: 'loading',
  devices: [],
  selectedSerial: null,
  packagesStatus: 'idle',
  packageNames: [],
  error: null,
}

// ─── Intent ─────────────────────────────────────────────────────────────────

export type LogcatPickerIntent =
  | { type: 'DevicesRefreshRequested' }
  | { type: 'DeviceSelected'; serial: string }
  | { type: 'PackagesRefreshRequested' }
  /**
   * Bấm vào một app trong danh sách.
   *
   * `packageName` có thể là `null`: danh sách còn chứa những app trong danh bạ
   * chưa ai điền applicationId. Chúng vẫn hiện ra — ẩn đi thì người đi tìm app
   * của mình sẽ kết luận là công cụ hỏng — nhưng bấm vào thì được nói rõ phải
   * đi điền ở đâu, chứ không mở ra một màn hình trống.
   */
  | { type: 'AppOpened'; packageName: string | null; label: string }

// ─── Effect ─────────────────────────────────────────────────────────────────

export type LogcatPickerEffect =
  | { type: 'ShowMessage'; severity: 'success' | 'error' | 'info'; message: string }
  /** Điều hướng là Effect, không phải lời gọi router từ trong ViewModel. */
  | { type: 'OpenLogcat'; serial: string; packageName: string }

// ─── Dẫn xuất từ state ──────────────────────────────────────────────────────

export const selectedDevice = (state: LogcatPickerState): AdbDevice | null =>
  state.devices.find((device) => device.serial === state.selectedSerial) ?? null

/** Máy đang sẵn sàng nhận lệnh. Máy `unauthorized`/`offline` vẫn hiện, nhưng không chọn được. */
export const usableDevices = (state: LogcatPickerState): AdbDevice[] =>
  state.devices.filter(isUsable)

export const canListPackages = (state: LogcatPickerState): boolean => {
  const device = selectedDevice(state)
  return device !== null && isUsable(device)
}
