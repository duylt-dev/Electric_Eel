import { AppErrors, type Result, err, ok } from '../../../core/result'
import type { InstalledPackage } from '../entities/AndroidPackage'
import type { ApkLabelReader } from '../repositories/ApkLabelReader'

/**
 * Đọc nhãn của một danh sách app, vài cái một lúc, báo từng nhãn khi có.
 *
 * ─── Vì sao song song, và vì sao chỉ 4 ───
 *
 * Mỗi nhãn tốn nửa giây, phần lớn là chờ adb đi qua USB. Chạy tuần tự bảy
 * mươi app là hơn nửa phút; bốn luồng đưa nó về dưới mười giây. Nhiều hơn thì
 * adb server bắt đầu xếp hàng các kết nối tới cùng một máy và tổng thời gian
 * không giảm thêm, trong khi thư mục tạm trên máy chủ và trên máy phình lên.
 *
 * ─── Lỗi ───
 *
 * `null` (app không có nhãn) bị bỏ qua lặng lẽ — thẻ sẽ in package name như
 * trước. `Err` từ reader dừng CẢ lượt: nếu thiếu `aapt2` thì app thứ hai cũng
 * thiếu y như app thứ nhất, và báo một lần là đủ.
 */
export const LABEL_CONCURRENCY = 4

export async function readPackageLabels(
  reader: ApkLabelReader,
  serial: string,
  packages: readonly InstalledPackage[],
  onLabel: (packageName: string, label: string) => void,
  signal?: AbortSignal,
): Promise<Result<void>> {
  let next = 0
  let failure: Result<void> | null = null

  const worker = async (): Promise<void> => {
    while (failure === null && !(signal?.aborted === true)) {
      const pkg = packages[next]
      next += 1
      if (pkg === undefined) return

      const outcome = await reader.readLabel(serial, pkg, signal)
      if (!outcome.ok) {
        failure = outcome
        return
      }
      if (outcome.value !== null) onLabel(pkg.packageName, outcome.value)
    }
  }

  await Promise.all(Array.from({ length: LABEL_CONCURRENCY }, worker))

  if (signal?.aborted === true) return err(AppErrors.cancelled('Đã huỷ đọc nhãn app.'))
  return failure ?? ok(undefined)
}
