import type { Result } from '../../../core/result'
import type { AdbAccess } from '../entities/AdbAccess'
import type { AdbDevice } from '../entities/AdbDevice'
import type { DeviceWatchEvent } from '../entities/DeviceWatchEvent'
import type { LogcatEvent, LogcatRequest } from '../entities/LogcatSession'
import type { PackageLabelEvent } from '../entities/PackageLabelEvent'

/**
 * Cổng mà ViewModel dùng. Có hai hiện thực (xem `AdbAccess`): gọi Route Handler
 * để `adb` ở máy chủ làm, hoặc nói chuyện thẳng với máy qua WebUSB.
 *
 * Đây là ranh giới quan trọng nhất của công cụ này: mọi thứ ở phía trên cổng
 * chỉ biết "danh sách thiết bị", "danh sách app", "luồng log" — không biết
 * dòng lệnh nào đang được chạy, nên không có đường nào để một màn hình gửi
 * xuống một tham số adb do nó tự đặt.
 */
export interface AdbRepository {
  readonly access: AdbAccess

  /**
   * Xin quyền dùng MỘT thiết bị: mở hộp chọn của trình duyệt.
   *
   * Chỉ có nghĩa với `webusb` — WebUSB không cho trang tự thấy máy, người dùng
   * phải chọn trong hộp thoại của trình duyệt, và hộp đó chỉ mở được từ một
   * cú bấm. Máy chọn xong sẽ về qua `watchDevices` như mọi máy khác. Trả
   * `null` khi người dùng đóng hộp mà không chọn — đó không phải lỗi.
   * Với `server` thì adb tự thấy máy, hàm này trả lỗi `validation`.
   */
  requestDevice(): Promise<Result<AdbDevice | null>>

  listDevices(signal?: AbortSignal): Promise<Result<AdbDevice[]>>

  /**
   * Theo dõi máy cắm vào máy chủ: danh sách mới về mỗi khi nó đổi.
   *
   * Thay cho việc gọi `listDevices` rồi bắt người dùng bấm quét lại — cắm cáp
   * là màn hình phải tự thấy. Chỉ trả về khi luồng kết thúc hoặc bị huỷ;
   * huỷ bằng `signal` là cách dừng duy nhất.
   */
  watchDevices(onEvent: (event: DeviceWatchEvent) => void, signal: AbortSignal): Promise<Result<void>>

  /** applicationId của các app CÀI THÊM trên máy. App hệ thống không bao giờ có mặt. */
  listPackages(serial: string, signal?: AbortSignal): Promise<Result<string[]>>

  /**
   * Nhãn hiển thị của các app trên máy, về dần từng cái.
   *
   * Tách khỏi `listPackages` vì hai thứ tốn khác nhau: danh sách về trong một
   * lệnh adb, còn nhãn phải đọc từng APK. Gộp lại thì màn hình trống cho tới
   * khi app cuối cùng có tên. Chỉ trả về khi luồng kết thúc hoặc bị huỷ.
   */
  streamPackageLabels(
    serial: string,
    onEvent: (event: PackageLabelEvent) => void,
    signal: AbortSignal,
  ): Promise<Result<void>>

  /** `adb logcat -c` — xoá đệm log NẰM TRÊN MÁY, không phải xoá màn hình. */
  clearBuffer(serial: string, signal?: AbortSignal): Promise<Result<void>>

  /**
   * Mở luồng log của một app và giữ tới khi bị huỷ.
   *
   * Chỉ trả về khi luồng kết thúc. Huỷ bằng `signal` là cách dừng duy nhất —
   * không có `stop()`, vì một luồng dừng được bằng hai đường là một luồng có
   * hai chỗ để quên dọn.
   */
  streamLogcat(
    request: LogcatRequest,
    onEvent: (event: LogcatEvent) => void,
    signal: AbortSignal,
  ): Promise<Result<void>>
}
