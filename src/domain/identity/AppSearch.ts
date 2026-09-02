/**
 * Tìm app trong danh bạ theo tên hiển thị, Firebase Project ID, package name
 * hoặc định danh trên URL.
 *
 * ─── Vì sao có một chỉ mục thay vì so thẳng từng trường ───
 *
 * Cách hiển nhiên là mỗi phím gõ thì duyệt danh sách và gọi `.toLowerCase()`
 * trên bốn trường của từng app. Với N app, đó là 4N chuỗi mới được cấp phát
 * cho MỖI ký tự — chuỗi trong JavaScript là bất biến, nên `toLowerCase` không
 * sửa tại chỗ mà sinh chuỗi mới, và bộ gom rác phải dọn toàn bộ sau đó.
 *
 * Ở đây bốn trường của một app được gộp và chuẩn hoá đúng MỘT lần thành một
 * chuỗi duy nhất, giữ trong `AppSearchIndex` cùng thứ tự với mảng gốc. Gõ phím
 * chỉ còn là quét chuỗi có sẵn: N phép `String.includes` — hàm gốc của máy ảo,
 * không cấp phát gì và không phải dựng biểu thức chính quy nào.
 *
 * Bộ nhớ tăng thêm đúng một chuỗi cho mỗi app, và nó thay thế cho bốn chuỗi
 * tạm mà cách kia sinh ra ở mỗi lần gõ.
 *
 * ─── Vì sao bỏ dấu tiếng Việt ───
 *
 * Người dùng gõ "tinh yeu" để tìm "Tình Yêu". Không bỏ dấu thì ô tìm kiếm im
 * lặng trả về rỗng, và người dùng kết luận là app không có ở đây.
 */

/** Bốn trường định danh một app. Chỉ cần chừng này, không cần cả thực thể. */
export interface SearchableApp {
  readonly displayName: string
  readonly projectId: string
  readonly slug: string
  readonly packageName: string | null
}

/** Chuỗi tra cứu của từng app, cùng thứ tự và cùng độ dài với mảng app gốc. */
export type AppSearchIndex = readonly string[]

/** Dấu thanh và dấu phụ mà `NFD` tách ra khỏi chữ cái gốc. */
const COMBINING_MARKS = /[\u0300-\u036f]/g
const WHITESPACE = /\s+/

const NO_TOKENS: readonly string[] = []

/**
 * Hạ chữ thường và bỏ dấu. `NFD` tách "ế" thành "e" + dấu, xoá dấu là còn "e".
 *
 * Chữ "đ" phải xử lý riêng: nó là một CHỮ CÁI trong Unicode (U+0111), không
 * phải "d" kèm dấu, nên `NFD` không đụng tới nó. Thiếu dòng này thì gõ "dong"
 * không tìm ra "Đóng".
 */
export const normalizeSearchText = (text: string): string =>
  text.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '').replaceAll('đ', 'd')

/**
 * Dựng chỉ mục. Gọi một lần cho mỗi danh sách, không gọi lại khi gõ phím.
 *
 * Các trường ngăn nhau bằng xuống dòng — một ký tự không bao giờ có trong từ
 * khoá — để một từ khoá không thể khớp bằng cách vắt qua ranh giới hai trường.
 */
export const buildAppSearchIndex = (apps: readonly SearchableApp[]): AppSearchIndex =>
  apps.map((app) =>
    normalizeSearchText(`${app.displayName}\n${app.projectId}\n${app.slug}\n${app.packageName ?? ''}`),
  )

/**
 * Tách từ khoá. Nhiều từ thì phải khớp ĐỦ, không cần đúng thứ tự: gõ
 * "love pion" tìm ra app tên "Love Test" có package "com.pion.lovetest".
 */
export const tokenizeQuery = (query: string): readonly string[] => {
  const normalized = normalizeSearchText(query).trim()
  return normalized.length === 0 ? NO_TOKENS : normalized.split(WHITESPACE)
}

/**
 * Vòng lặp chỉ số chứ không phải `tokens.every(...)`: `every` cấp phát một
 * closure cho mỗi app, mà hàm này chạy lại trên toàn danh sách sau mỗi phím gõ.
 */
const containsAll = (haystack: string, tokens: readonly string[]): boolean => {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token !== undefined && !haystack.includes(token)) return false
  }
  return true
}

/**
 * Lọc danh sách theo từ khoá. `index` phải là chỉ mục dựng từ chính `apps`.
 *
 * Ô tìm kiếm rỗng thì trả về CHÍNH mảng đầu vào, không phải một bản sao: không
 * cấp phát gì, và vì tham chiếu không đổi nên React bỏ qua luôn việc vẽ lại
 * danh sách — trường hợp hay gặp nhất cũng là trường hợp rẻ nhất.
 */
export function filterApps<T extends SearchableApp>(
  apps: readonly T[],
  index: AppSearchIndex,
  query: string,
): readonly T[] {
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) return apps

  const matched: T[] = []
  for (let i = 0; i < apps.length; i += 1) {
    const app = apps[i]
    const haystack = index[i]
    if (app === undefined || haystack === undefined) continue
    if (containsAll(haystack, tokens)) matched.push(app)
  }
  return matched
}
