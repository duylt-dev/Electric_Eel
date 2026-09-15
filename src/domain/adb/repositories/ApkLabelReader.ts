import type { Result } from '../../../core/result'
import type { InstalledPackage } from '../entities/AndroidPackage'

/**
 * Cổng đọc nhãn hiển thị của MỘT app đang cài trên máy.
 *
 * Nằm riêng khỏi `AdbShell` vì việc này không chỉ là chạy adb: phải kéo một
 * phần APK về máy chủ rồi đưa cho `aapt2` — tức là có tệp tạm, có tiến trình
 * thứ hai, có cache. Use case `readPackageLabels` chỉ cần biết "đưa app vào,
 * nhận nhãn ra", và test được bằng một reader giả trả nhãn tức thì.
 *
 * `ok(null)` là "APK này không có nhãn đọc được" — hợp lệ, không phải sự cố.
 * `Err` là hạ tầng hỏng (không có aapt2, adb chết) và use case sẽ dừng cả lượt
 * thay vì báo lỗi bảy mươi lần.
 */
export interface ApkLabelReader {
  readLabel(
    serial: string,
    pkg: InstalledPackage,
    signal?: AbortSignal,
  ): Promise<Result<string | null>>
}
