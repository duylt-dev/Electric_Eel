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

/**
 * `failed` = luồng theo dõi máy đứt hoặc adb không trả lời. Danh sách đang có
 * vẫn hiện — nó đúng cho tới khi có tin mới — kèm một nút mở lại luồng.
 */
export type DeviceListStatus = 'loading' | 'ready' | 'failed'

/** `idle` = chưa chọn máy nào, nên chưa có gì để hỏi. */
export type PackageListStatus = 'idle' | 'loading' | 'ready' | 'failed'

/**
 * `unavailable` = máy chủ không đọc được nhãn (thiếu aapt2). Không phải lỗi:
 * danh sách vẫn dùng được, chỉ không có tên, và `labelsMessage` nói vì sao.
 */
export type LabelsStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

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
   * Nhãn danh bạ và thứ tự hiển thị KHÔNG nằm ở đây: danh bạ là dữ liệu của
   * trang chứ không của thiết bị. Màn hình ghép lại bằng `buildPackageList` —
   * một hàm thuần, chạy lại khi ô tìm kiếm đổi mà không cần ViewModel biết.
   */
  readonly packageNames: readonly string[]

  /**
   * applicationId → tên đọc từ APK trên máy. Về DẦN sau `packageNames` qua
   * một luồng riêng, nên là một trường riêng chứ không nhét vào từng phần tử:
   * mỗi nhãn tới chỉ thêm một khoá, không dựng lại cả mảng.
   */
  readonly deviceLabels: Readonly<Record<string, string>>
  readonly labelsStatus: LabelsStatus
  readonly labelsMessage: string | null

  readonly error: AppError | null
}

export const initialLogcatPickerState: LogcatPickerState = {
  status: 'loading',
  devices: [],
  selectedSerial: null,
  packagesStatus: 'idle',
  packageNames: [],
  deviceLabels: {},
  labelsStatus: 'idle',
  labelsMessage: null,
  error: null,
}

// ─── Intent ─────────────────────────────────────────────────────────────────

export type LogcatPickerIntent =
  /**
   * Mở lại luồng theo dõi thiết bị sau khi nó đứt. Bình thường không cần: máy
   * cắm vào là luồng tự báo, không có nút "quét lại" nào để bấm.
   */
  | { type: 'DevicesRefreshRequested' }
  /**
   * `serial` là `null` khi máy đang chọn không còn dùng được (rút cáp, rớt
   * mạng): danh sách app của nó phải bỏ, và lượt nạp đang bay phải huỷ. Màn
   * hình chỉ bắn chuỗi; `null` là do luồng theo dõi máy tự bắn.
   */
  | { type: 'DeviceSelected'; serial: string | null }
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
