import type { Result } from '../../../core/result'
import type { AdbDevice } from '../entities/AdbDevice'
import type { LogcatEvent, LogcatRequest } from '../entities/LogcatSession'

/**
 * Cổng mà ViewModel dùng. Bên trình duyệt nó là các lệnh gọi Route Handler;
 * `adb` thật thì chạy ở máy chủ và không bao giờ lộ ra đây.
 *
 * Đây là ranh giới quan trọng nhất của công cụ này: mọi thứ ở phía trên cổng
 * chỉ biết "danh sách thiết bị", "danh sách app", "luồng log" — không biết
 * dòng lệnh nào đang được chạy, nên không có đường nào để một màn hình gửi
 * xuống một tham số adb do nó tự đặt.
 */
export interface AdbRepository {
  listDevices(signal?: AbortSignal): Promise<Result<AdbDevice[]>>

  /** applicationId của các app CÀI THÊM trên máy. App hệ thống không bao giờ có mặt. */
  listPackages(serial: string, signal?: AbortSignal): Promise<Result<string[]>>

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
