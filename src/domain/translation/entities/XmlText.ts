/**
 * Các phép biến đổi văn bản trên `strings.xml`, tách khỏi mọi thứ khác.
 *
 * Đây là bản dịch trực tiếp của những hàm cùng tên trong tool Python
 * (`main.py` / `chunk.py`). Giữ nguyên hành vi là có chủ ý: hai bên phải cho ra
 * cùng một tệp với cùng một đầu vào, nếu không thì bản web chỉ là một tool khác
 * trông giống tool cũ.
 *
 * Toàn bộ là hàm thuần trên chuỗi — không đọc tệp, không gọi mạng — nên kiểm
 * thử được từng hàm một mà không cần dựng gì.
 */

/** Thẻ mở `<resources ...>` của tệp gốc, kể cả khi nó mang thêm thuộc tính. */
const RESOURCES_OPEN = /<\s*resources\b[^>]*>/i

/** Hai dòng trống liên tiếp trở lên. */
const BLANK_LINE_RUN = /(?:^[ \t]*\r?\n){2,}/gm

/**
 * Mục `translatable="false"` viết dạng thẻ tự đóng.
 *
 * Nuốt luôn phần thụt đầu dòng và dấu xuống dòng phía sau, để bỏ một mục đi
 * không để lại một dòng chỉ có khoảng trắng.
 *
 * KHÔNG neo vào đầu dòng (`^`), khác với bản `main.py`. Bản đó chỉ khớp khi
 * mỗi mục nằm riêng một dòng, nên một tệp viết liền
 * `<resources><string translatable="false">…</string></resources>` lọt qua
 * nguyên vẹn và `app_name` bị đem đi dịch. Bản `chunk.py` bỏ neo vì đúng lý do
 * đó; ở đây giữ cả hai vế — khớp được cả tệp viết liền, mà tệp trình bày đẹp
 * vẫn không để lại dòng trống.
 */
const NON_TRANSLATABLE_SELF =
  /[ \t]*<(?:string|plurals|string-array)\b[^>]*?\btranslatable\s*=\s*(["'])false\1[^>]*\/\s*>[ \t]*\r?\n?/gi

/** Mục `translatable="false"` viết dạng có thẻ đóng. */
const NON_TRANSLATABLE_BLOCK =
  /[ \t]*<(string|plurals|string-array)\b[^>]*?\btranslatable\s*=\s*(["'])false\2[^>]*>[\s\S]*?<\/\1\s*>[ \t]*\r?\n?/gi

/**
 * Thẻ, chú thích hoặc CDATA. Dùng để CẮT chuỗi, nên nhóm bắt là bắt buộc:
 * `String.split` chỉ giữ lại phần phân cách khi phần đó nằm trong nhóm bắt.
 */
const TAG_OR_CDATA_OR_COMMENT = /(<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<[^>]+>)/

/** Dấu nháy đơn chưa được thoát. */
const BARE_APOSTROPHE = /(?<!\\)'/g

export const hasTranslatableEntry = (xml: string): boolean =>
  /<\s*(string|string-array|plurals)\b/i.test(xml)

/** Thẻ mở của tệp gốc, để tệp dịch ra giữ nguyên thuộc tính (ví dụ `xmlns:tools`). */
export const resourcesOpenTag = (xml: string): string => RESOURCES_OPEN.exec(xml)?.[0] ?? '<resources>'

/**
 * Khung rỗng dùng khi không còn gì để dịch.
 *
 * Ghi ra một tệp rỗng hợp lệ chứ không bỏ trống thư mục: thiếu hẳn
 * `values-xx/strings.xml` và có nó nhưng rỗng là hai tình huống khác nhau, và
 * người nhận cần phân biệt được.
 */
export const emptyResourcesSkeleton = (xml: string): string =>
  `${resourcesOpenTag(xml)}\n</resources>\n`

export const collapseBlankLines = (xml: string): string => xml.replace(BLANK_LINE_RUN, '\n')

export interface FilterResult {
  readonly xml: string
  /** Số mục đã loại. Hiện lên giao diện để người dùng đối chiếu. */
  readonly removed: number
}

/**
 * Loại các mục `translatable="false"` trước khi gửi cho mô hình.
 *
 * Hai cái lợi độc lập nhau: khỏi tốn token cho thứ không được phép dịch, và
 * quan trọng hơn — mô hình không có cơ hội dịch nhầm chúng. `app_name` bị dịch
 * là một lỗi lọt tới tận cửa hàng ứng dụng.
 */
export function removeNonTranslatables(xml: string): FilterResult {
  let removed = 0
  const count = (): string => {
    removed += 1
    return ''
  }

  let filtered = xml.replace(NON_TRANSLATABLE_SELF, count)
  filtered = filtered.replace(NON_TRANSLATABLE_BLOCK, count)
  filtered = collapseBlankLines(filtered)

  // Dọn hai đầu bên trong <resources>, để tệp ra không mở đầu bằng một vùng trống.
  filtered = filtered.replace(/(<\s*resources\b[^>]*>\s*)(?:\r?\n)+/gi, '$1')
  filtered = filtered.replace(/(?:\r?\n)+(\s*<\/\s*resources\s*>)/gi, '\n$1')

  return { xml: filtered, removed }
}

/**
 * Bóc rào ```xml mà mô hình hay thêm vào dù prompt đã cấm.
 *
 * Cắt tới dấu `<` đầu tiên nữa: có mô hình vẫn chèn một câu dẫn nhập trước
 * XML, và một câu tiếng Anh lọt vào đầu tệp thì Android không biên dịch được.
 */
/**
 * Chú thích XML, hoặc CDATA. CDATA đứng TRƯỚC trong nhánh chọn là điều bắt
 * buộc: `<![CDATA[<!-- x -->]]>` là văn bản thật của một chuỗi, không phải chú
 * thích, và nhánh nào đứng trước thì nuốt trọn vùng đó.
 */
const COMMENT_OR_CDATA = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g

/**
 * Bỏ chú thích, giữ nguyên CDATA.
 *
 * ─── Vì sao cần, và vì sao nó không có trong bản Python ───
 *
 * Đường ống này chỉ bốc các khối `<string>` ra khỏi tệp rồi ghép lại, nên một
 * mục đã bị chú thích — `<!-- <string name="old">Old</string> -->` — vẫn khớp
 * mẫu và vẫn được gửi đi dịch. Tệp ra nhận lại nó KHÔNG CÒN dấu chú thích:
 * một chuỗi ai đó cố ý tắt đi sống lại ở cả hai mươi mấy ngôn ngữ.
 *
 * Bản `chunk.py` có đúng lỗi này. Ở đây chú thích bị bỏ hẳn trước khi bốc mục,
 * nên thứ đã tắt thì vẫn tắt.
 */
export const stripComments = (xml: string): string =>
  xml.replace(COMMENT_OR_CDATA, (match) => (match.startsWith('<!--') ? '' : match))

/**
 * Chuẩn bị tệp nguồn trước khi bốc mục: bỏ chú thích, rồi bỏ mục không dịch.
 *
 * Đúng thứ tự đó. Làm ngược lại thì một mục `translatable="false"` nằm trong
 * chú thích cũng bị đếm vào `removed`, và con số hiện lên giao diện nói sai.
 *
 * Cả bộ soi tệp lẫn use case dịch đều gọi hàm này, nên "phần sẽ gửi cho mô
 * hình" chỉ có một định nghĩa duy nhất — con số báo trước cho người dùng không
 * thể lệch với thứ thật sự được gửi đi.
 */
export const prepareForTranslation = (xml: string): FilterResult =>
  removeNonTranslatables(stripComments(xml))

export function stripCodeFences(text: string): string {
  if (text.length === 0) return text
  const unfenced = text
    .trim()
    .replace(/^```[a-zA-Z0-9_-]*\s*/, '')
    .replace(/\s*```$/, '')
    .trim()
  const start = unfenced.indexOf('<')
  return start > 0 ? unfenced.slice(start) : unfenced
}

/**
 * Thoát dấu nháy đơn, nhưng CHỈ trong phần văn bản.
 *
 * Android bắt buộc `\'` trong giá trị chuỗi, còn `<font color='#A005FF'>` thì
 * phải để nguyên. Vì vậy chuỗi được cắt theo thẻ / chú thích / CDATA rồi chỉ
 * xử lý những mảnh nằm ngoài — thay thế trên cả tệp sẽ phá hết thuộc tính viết
 * bằng nháy đơn.
 */
export function escapeApostrophesOutsideTags(xml: string): string {
  // `split` với đúng một nhóm bắt trả về xen kẽ [văn bản, thẻ, văn bản, thẻ, …],
  // nên vị trí LẺ luôn là thẻ. Dựa vào vị trí thay vì khớp lại từng mảnh: rẻ
  // hơn, và không có cửa cho một mảnh văn bản tình cờ trông giống thẻ.
  return xml
    .split(TAG_OR_CDATA_OR_COMMENT)
    .map((part, index) => {
      if (part === undefined || part.length === 0) return ''
      return index % 2 === 1 ? part : part.replace(BARE_APOSTROPHE, "\\'")
    })
    .join('')
}
