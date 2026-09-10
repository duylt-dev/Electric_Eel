/**
 * Một app đang cài trên thiết bị.
 *
 * `label` là tên đọc được, và nó KHÔNG lấy từ máy: `pm list packages` chỉ trả
 * về applicationId, còn lấy nhãn thật thì phải `dumpsys package` từng app —
 * hàng trăm lượt gọi adb cho một danh sách. Thay vào đó nhãn lấy từ danh bạ
 * app của chính tool này (bảng FirebaseApp). App của đội có tên, app ngoài chỉ
 * có package name — đúng với thứ tự người ta cần tìm.
 */
export interface AndroidPackage {
  readonly packageName: string
  readonly label: string | null
  /** Có mặt trong danh bạ app của tool. Dùng để gắn nhãn, không đổi thứ tự. */
  readonly known: boolean
}

/**
 * applicationId hợp lệ để ghép vào dòng lệnh adb.
 *
 * Rộng hơn `isPackageName` bên `domain/identity` một chút và cố ý như vậy: bên
 * đó kiểm cái người quản trị GÕ VÀO (nên bắt buộc có dấu chấm, để chặn lỗi gõ
 * nhầm tên hiển thị), còn ở đây kiểm cái THIẾT BỊ TRẢ VỀ — và trên máy thật có
 * những package hệ thống không có dấu chấm, ví dụ `android`.
 *
 * Điều bắt buộc giữ lại là ký tự đầu không phải dấu gạch ngang: xem ghi chú ở
 * `isSafeSerial`.
 */
const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_][A-Za-z0-9_-]*)*$/

export const isSafePackageName = (value: string): boolean =>
  value.length <= 255 && PACKAGE.test(value)

/**
 * Đọc kết quả của `adb shell pm list packages`.
 *
 *     package:com.pion.lovetest
 *     package:com.android.settings
 *
 * Bỏ qua mọi dòng không mở đầu bằng `package:` — trên một số máy có nhà sản
 * xuất chèn thêm cảnh báo vào stdout của shell.
 */
export function parsePackagesOutput(stdout: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()

  for (const raw of stdout.split('\n')) {
    const line = raw.trim()
    if (!line.startsWith('package:')) continue

    // Với `pm list packages -f` phần sau `package:` là `<đường dẫn apk>=<tên>`.
    const rest = line.slice('package:'.length)
    const separator = rest.lastIndexOf('=')
    const name = (separator > 0 ? rest.slice(separator + 1) : rest).trim()

    if (name.length === 0 || seen.has(name)) continue
    if (!isSafePackageName(name)) continue
    seen.add(name)
    names.push(name)
  }

  return names
}

/**
 * Gắn nhãn từ danh bạ vào danh sách package đọc được từ máy, rồi xếp thứ tự.
 *
 * Xếp theo applicationId từ a đến z, không nhóm app của đội lên đầu. Danh sách
 * được chia trang nên thứ tự phải đoán trước được: biết package name thì biết
 * nó nằm quãng nào, và trang 2 hôm nay vẫn là trang 2 ngày mai. Muốn đi thẳng
 * tới app của mình thì gõ vào ô tìm kiếm — nhanh hơn mọi cách xếp thứ tự.
 *
 * Xếp theo applicationId chứ không theo nhãn: nhãn chỉ có ở app trong danh bạ,
 * lấy nó làm khoá thì hai app cạnh nhau xếp theo hai loại khoá khác nhau và
 * thứ tự nhìn như ngẫu nhiên.
 */
export function buildPackageList(
  names: readonly string[],
  labels: ReadonlyMap<string, string>,
): AndroidPackage[] {
  return names
    .map((packageName) => {
      const label = labels.get(packageName)
      return {
        packageName,
        label: label ?? null,
        known: label !== undefined,
      }
    })
    .sort((left, right) => left.packageName.localeCompare(right.packageName, 'en'))
}

/** Lọc danh sách theo ô tìm kiếm: khớp cả tên hiển thị lẫn applicationId. */
export function filterPackages(
  packages: readonly AndroidPackage[],
  query: string,
): AndroidPackage[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return [...packages]

  return packages.filter(
    (item) =>
      item.packageName.toLowerCase().includes(needle) ||
      (item.label !== null && item.label.toLowerCase().includes(needle)),
  )
}
