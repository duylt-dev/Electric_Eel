/**
 * Một app đang cài trên thiết bị, đã ghép nhãn.
 *
 * `label` đến từ HAI nguồn, theo thứ tự ưu tiên: danh bạ app của chính tool
 * (bảng FirebaseApp — tên đội tự đặt, luôn đúng ý người tìm), rồi tới nhãn đọc
 * từ APK trên máy (`application-label` của `aapt2 dump badging`). `pm list
 * packages` không trả về nhãn, nên nhãn máy về SAU danh sách và điền dần —
 * xem `readPackageLabels`. Không nguồn nào có thì `null`, thẻ in package name.
 */
export interface AndroidPackage {
  readonly packageName: string
  readonly label: string | null
  /** Có mặt trong danh bạ app của tool. Dùng để gắn nhãn, không đổi thứ tự. */
  readonly known: boolean
}

/** Một dòng của `pm list packages -f`: app cùng đường dẫn APK gốc trên máy. */
export interface InstalledPackage {
  readonly packageName: string
  /** Đường dẫn `base.apk`. Chứa hash ngẫu nhiên đổi mỗi lần cài, nên làm khoá cache được. */
  readonly apkPath: string
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
 * Đường dẫn APK do `pm path` / `pm list packages -f` trả về, đủ sạch để đưa
 * vào `adb shell unzip …`.
 *
 * Khác với các tham số khác, thứ này đi qua SHELL CỦA THIẾT BỊ (`adb shell`
 * nối tham số lại rồi đưa cho `sh -c` bên kia), nên `spawn` không qua shell ở
 * máy chủ không bảo vệ được gì. Vì vậy chỉ nhận tập ký tự thật sự xuất hiện
 * trong `/data/app/~~<hash>==/<pkg>-<hash>==/base.apk`: không khoảng trắng,
 * không dấu nháy, không `$`, không `;`. Phải là đường dẫn tuyệt đối tới `.apk`.
 */
const APK_PATH = /^\/[A-Za-z0-9_.~=+/-]+\.apk$/

export const isSafeApkPath = (value: string): boolean =>
  value.length <= 1024 && APK_PATH.test(value) && !value.includes('..')

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
 * Đọc `pm list packages -f`, giữ lại cả đường dẫn APK.
 *
 *     package:/data/app/~~ab==/com.pion.lovetest-cd==/base.apk=com.pion.lovetest
 *
 * Dòng thiếu đường dẫn, hoặc đường dẫn không đủ sạch cho `adb shell`, bị bỏ
 * qua chứ không làm hỏng cả danh sách — app đó chỉ mất nhãn, không mất log.
 */
export function parseInstalledPackages(stdout: string): InstalledPackage[] {
  const items: InstalledPackage[] = []
  const seen = new Set<string>()

  for (const raw of stdout.split('\n')) {
    const line = raw.trim()
    if (!line.startsWith('package:')) continue

    const rest = line.slice('package:'.length)
    const separator = rest.lastIndexOf('=')
    if (separator <= 0) continue

    const apkPath = rest.slice(0, separator).trim()
    const packageName = rest.slice(separator + 1).trim()
    if (seen.has(packageName)) continue
    if (!isSafePackageName(packageName) || !isSafeApkPath(apkPath)) continue

    seen.add(packageName)
    items.push({ packageName, apkPath })
  }

  return items
}

/**
 * Lấy nhãn mặc định từ stdout của `aapt2 dump badging`.
 *
 *     application-label:'RBX Clothes Maker'
 *     application-label-vi:'RBX Clothes Maker'
 *
 * Lấy dòng KHÔNG có hậu tố ngôn ngữ — đó là nhãn máy sẽ hiện khi không có bản
 * dịch, và là cái đội thấy trong Play Console. Dấu nháy đơn trong nhãn được
 * aapt2 ghi thành `\\'`.
 */
export function parseBadgingLabel(stdout: string): string | null {
  const match = /^application-label:'((?:[^'\\]|\\.)*)'/m.exec(stdout)
  if (match?.[1] === undefined) return null
  const label = match[1].replace(/\\(.)/g, '$1').trim()
  return label.length > 0 ? label : null
}

/**
 * Gắn nhãn vào danh sách package đọc được từ máy, rồi xếp thứ tự.
 *
 * Nhãn danh bạ thắng nhãn máy: tên đội đặt là tên người ta gõ vào ô tìm kiếm.
 *
 * Xếp theo applicationId từ a đến z, không nhóm app của đội lên đầu. Danh sách
 * được chia trang nên thứ tự phải đoán trước được: biết package name thì biết
 * nó nằm quãng nào, và trang 2 hôm nay vẫn là trang 2 ngày mai. Muốn đi thẳng
 * tới app của mình thì gõ vào ô tìm kiếm — nhanh hơn mọi cách xếp thứ tự.
 *
 * Xếp theo applicationId chứ không theo nhãn: nhãn máy về DẦN sau danh sách,
 * lấy nó làm khoá thì thẻ nhảy chỗ mỗi khi thêm một nhãn, và app chưa có nhãn
 * xếp theo một loại khoá khác với app đã có.
 */
export function buildPackageList(
  names: readonly string[],
  labels: ReadonlyMap<string, string>,
  deviceLabels: Readonly<Record<string, string>> = {},
): AndroidPackage[] {
  return names
    .map((packageName) => {
      const label = labels.get(packageName)
      return {
        packageName,
        label: label ?? deviceLabels[packageName] ?? null,
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
