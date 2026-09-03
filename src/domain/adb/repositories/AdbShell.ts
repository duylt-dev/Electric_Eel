import type { Result } from '../../../core/result'

/**
 * Cổng chạy lệnh `adb`. Tầng dưới cùng, và cố ý hẹp đúng bằng hai việc.
 *
 * Cổng này KHÔNG biết logcat là gì, cũng không biết package là gì — nó chỉ
 * biết chạy một danh sách tham số. Nhờ vậy phần khó của công cụ này (bám theo
 * pid qua các lần app khởi động lại) nằm trong một use case thuần, kiểm thử
 * được bằng một `AdbShell` giả mà không cần cắm máy nào.
 *
 * `args` là MẢNG chứ không phải chuỗi, và không có tham số nào tên là `command`.
 * Hiện thực bên `data/` gọi `spawn` không qua shell, nên không có chỗ nào để
 * một chuỗi biến thành hai lệnh.
 */
export interface AdbCommand {
  /** Tham số sau `adb`, ví dụ `['shell', 'pm', 'list', 'packages', '-3']`. */
  readonly args: readonly string[]
  /** Thiết bị đích. Bỏ trống khi lệnh không gắn với thiết bị nào (`devices`). */
  readonly serial?: string | null
  /** Trần thời gian chờ, mili giây. Chỉ áp cho `run`. */
  readonly timeoutMs?: number
}

export interface AdbRunOutput {
  readonly stdout: string
  readonly stderr: string
  /** `null` khi tiến trình bị tín hiệu giết. */
  readonly code: number | null
}

export interface AdbExit {
  readonly code: number | null
  readonly stderr: string
}

export interface AdbShell {
  /**
   * Chạy một lệnh ngắn và chờ nó xong.
   *
   * Mã thoát khác 0 KHÔNG phải lỗi ở đây — nó là dữ liệu, và người gọi mới
   * biết nó có nghĩa gì. `adb shell pidof <pkg>` thoát 1 khi app chưa chạy, và
   * "app chưa chạy" là một câu trả lời hợp lệ chứ không phải một sự cố. Chỉ
   * những thứ khiến lệnh không chạy được mới thành `Err`: không tìm thấy adb,
   * quá hạn chờ, bị huỷ.
   */
  run(command: AdbCommand, signal?: AbortSignal): Promise<Result<AdbRunOutput>>

  /**
   * Chạy một lệnh chảy dài, gọi `onLine` cho từng dòng stdout.
   *
   * Chỉ trả về khi tiến trình kết thúc — kể cả khi kết thúc là do bị huỷ. Việc
   * gộp dòng dở dang giữa các mẩu dữ liệu thuộc về hiện thực, người gọi luôn
   * nhận được dòng trọn vẹn.
   */
  stream(
    command: AdbCommand,
    onLine: (line: string) => void,
    signal?: AbortSignal,
  ): Promise<Result<AdbExit>>
}
