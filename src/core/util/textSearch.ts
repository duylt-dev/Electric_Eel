/**
 * Tìm kiếm theo từ khoá trên một danh sách đã nằm sẵn trong bộ nhớ.
 *
 * Đây là phần chung của mọi ô tìm kiếm trong dự án: hạ chữ thường, bỏ dấu
 * tiếng Việt, dựng chỉ mục MỘT lần rồi mỗi phím gõ chỉ quét chuỗi có sẵn.
 * Luật *trường nào tính là định danh* của từng loại đối tượng nằm ở domain
 * (`AppSearch`, `UserSearch`); ở đây chỉ có phép tính chuỗi.
 *
 * ─── Vì sao có một chỉ mục thay vì so thẳng từng trường ───
 *
 * Cách hiển nhiên là mỗi phím gõ thì duyệt danh sách và gọi `.toLowerCase()`
 * trên từng trường của từng mục. Chuỗi trong JavaScript là bất biến, nên mỗi
 * lần như vậy cấp phát chuỗi mới cho MỌI mục, và bộ gom rác phải dọn sau đó.
 * Chỉ mục gộp các trường của một mục thành đúng một chuỗi chuẩn hoá, dựng một
 * lần; gõ phím chỉ còn là N phép `String.includes` — hàm gốc của máy ảo,
 * không cấp phát gì.
 *
 * ─── Vì sao bỏ dấu tiếng Việt ───
 *
 * Người dùng gõ "tinh yeu" để tìm "Tình Yêu". Không bỏ dấu thì ô tìm kiếm im
 * lặng trả về rỗng, và người dùng kết luận là mục đó không có ở đây.
 */

/** Chuỗi tra cứu của từng mục, cùng thứ tự và cùng độ dài với mảng gốc. */
export type SearchIndex = readonly string[]

/** Dấu thanh và dấu phụ mà `NFD` tách ra khỏi chữ cái gốc. */
const COMBINING_MARKS = /[̀-ͯ]/g
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
 * `fields` trả về các trường tính là định danh của mục; chúng được ngăn nhau
 * bằng xuống dòng — một ký tự không bao giờ có trong từ khoá — để một từ khoá
 * không thể khớp bằng cách vắt qua ranh giới hai trường.
 */
export const buildSearchIndex = <T>(
  items: readonly T[],
  fields: (item: T) => readonly (string | null | undefined)[],
): SearchIndex => items.map((item) => normalizeSearchText(fields(item).map((f) => f ?? '').join('\n')))

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
 * closure cho mỗi mục, mà hàm này chạy lại trên toàn danh sách sau mỗi phím gõ.
 */
const containsAll = (haystack: string, tokens: readonly string[]): boolean => {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token !== undefined && !haystack.includes(token)) return false
  }
  return true
}

/**
 * Lọc danh sách theo từ khoá. `index` phải là chỉ mục dựng từ chính `items`.
 *
 * Ô tìm kiếm rỗng thì trả về CHÍNH mảng đầu vào, không phải một bản sao: không
 * cấp phát gì, và vì tham chiếu không đổi nên React bỏ qua luôn việc vẽ lại
 * danh sách — trường hợp hay gặp nhất cũng là trường hợp rẻ nhất.
 */
export function filterIndexed<T>(items: readonly T[], index: SearchIndex, query: string): readonly T[] {
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) return items

  const matched: T[] = []
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    const haystack = index[i]
    if (item === undefined || haystack === undefined) continue
    if (containsAll(haystack, tokens)) matched.push(item)
  }
  return matched
}
