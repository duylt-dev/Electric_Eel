/**
 * Che biểu tượng và thực thể số trước khi gửi chuỗi cho mô hình, rồi trả lại
 * nguyên trạng sau khi dịch xong.
 *
 * ─── Vì sao cần ───
 *
 * Mô hình ngôn ngữ coi emoji là nội dung: nó đổi 🔥 thành ✨, bỏ hẳn, hoặc
 * thêm vào chỗ không có. Với chuỗi giao diện thì đó là lỗi im lặng — tệp vẫn
 * hợp lệ, app vẫn chạy, chỉ có biểu tượng sai. Ký tự vùng dùng riêng (PUA) còn
 * tệ hơn: chúng là icon của font riêng trong app, đổi một mã là mất hẳn hình.
 *
 * Cách xử lý là thay chúng bằng những mã hiệu không giống ngôn ngữ nào
 * (`__U1F525__`), dặn mô hình đừng động vào, rồi ghép lại sau. Mô hình không
 * dịch được thứ nó không nhận ra là chữ.
 *
 * Bản dịch trực tiếp của `protect_specials` / `restore_placeholders` trong tool
 * Python — cùng danh sách khoảng mã, cùng dạng mã hiệu.
 */

/** Thực thể hex, chấp nhận cả kiểu viết lỏng lẻo `& # x 1F525 ;`. */
const HEX_ENTITY = /&\s*#\s*x\s*([0-9A-Fa-f]{2,6})\s*;/g
const DEC_ENTITY = /&\s*#\s*([0-9]{2,7})\s*;/g

type CodePointRange = readonly [number, number]

/** Vùng dùng riêng — icon của font riêng trong app nằm ở đây. */
const PRIVATE_USE: readonly CodePointRange[] = [
  [0xe000, 0xf8ff],
  [0xf0000, 0xffffd],
  [0x100000, 0x10fffd],
]

const EMOJI_PICTOGRAPH: readonly CodePointRange[] = [
  [0x1f000, 0x1ffff], // emoji và pictograph nói chung
  [0x2600, 0x26ff], // ký hiệu linh tinh: ☀ ☎ ♻
  [0x2700, 0x27bf], // dingbats: ✨ ✓ ✗
  [0x2b00, 0x2bff], // mũi tên và ký hiệu: ⬅ ⬆ ⬇ ⏺
]

const EMOJI_EXTRA: readonly CodePointRange[] = [
  [0x1f1e6, 0x1f1ff], // ký hiệu vùng — ghép đôi thành cờ
  [0x1f3fb, 0x1f3ff], // tông màu da
]

/** Bộ chọn biến thể: quyết định emoji hiện dạng chữ hay dạng hình. */
const VARIATION_SELECTOR: readonly CodePointRange[] = [
  [0xfe00, 0xfe0f],
  [0xe0100, 0xe01ef],
]

const TAG_CHARACTERS: readonly CodePointRange[] = [[0xe0000, 0xe007f]]

/** Zero-width joiner — thứ dán các emoji rời thành một hình. */
const EMOJI_HELPERS: ReadonlySet<number> = new Set([0x200d])

/** Emoji nằm lẻ ngoài các khối lớn. */
const EMOJI_SINGLETONS: ReadonlySet<number> = new Set([
  0x00a9, 0x00ae, 0x203c, 0x2049, 0x2122, 0x2139, 0x3030, 0x303d, 0x3297, 0x3299, 0x24c2, 0x231a,
  0x231b, 0x2328, 0x23cf, 0x23e9, 0x23ea, 0x23eb, 0x23ec, 0x23ed, 0x23ee, 0x23ef, 0x23f0, 0x23f1,
  0x23f2, 0x23f3, 0x23f8, 0x23f9, 0x23fa, 0x2b50, 0x2b55, 0x20e3,
])

const inRanges = (codePoint: number, ranges: readonly CodePointRange[]): boolean =>
  ranges.some(([low, high]) => codePoint >= low && codePoint <= high)

/** Ký tự cần che: biểu tượng, hoặc phần điều khiển cách hiển thị biểu tượng. */
export const isProtectedCodePoint = (codePoint: number): boolean =>
  inRanges(codePoint, PRIVATE_USE) ||
  inRanges(codePoint, EMOJI_PICTOGRAPH) ||
  inRanges(codePoint, EMOJI_EXTRA) ||
  inRanges(codePoint, VARIATION_SELECTOR) ||
  inRanges(codePoint, TAG_CHARACTERS) ||
  EMOJI_HELPERS.has(codePoint) ||
  EMOJI_SINGLETONS.has(codePoint)

/** Mã hiệu → nội dung gốc. Chỉ có nghĩa trong phạm vi một lần dịch. */
export type GlyphMasking = ReadonlyMap<string, string>

export interface MaskedText {
  readonly masked: string
  readonly masking: GlyphMasking
}

/**
 * @param preferNumericEntities Trả biểu tượng về dạng `&#x1F525;` thay vì ký tự
 *   thật. Cần khi công cụ dựng của dự án đích không chịu được UTF-8 thô trong
 *   `strings.xml`; mặc định tắt vì ký tự thật dễ đọc hơn khi xem diff.
 */
export function protectSpecials(text: string, preferNumericEntities = false): MaskedText {
  const masking = new Map<string, string>()

  // Thứ tự quan trọng: che thực thể có sẵn TRƯỚC, nếu không bước quét ký tự bên
  // dưới sẽ đụng vào phần chữ số bên trong chúng.
  let working = text.replace(HEX_ENTITY, (_match, hex: string) => {
    const codePoint = Number.parseInt(hex, 16)
    const key = `__HEXU${codePoint.toString(16).toUpperCase()}__`
    masking.set(key, `&#x${codePoint.toString(16).toUpperCase()};`)
    return key
  })

  working = working.replace(DEC_ENTITY, (_match, digits: string) => {
    const codePoint = Number.parseInt(digits, 10)
    const key = `__DECU${codePoint.toString(16).toUpperCase()}__`
    masking.set(key, `&#${codePoint};`)
    return key
  })

  // `for...of` trên chuỗi duyệt theo ĐIỂM MÃ, không theo đơn vị UTF-16. Duyệt
  // theo `charAt` sẽ cắt đôi emoji thành hai nửa surrogate và ghép lại thành
  // rác.
  let out = ''
  for (const character of working) {
    const codePoint = character.codePointAt(0)
    if (codePoint !== undefined && isProtectedCodePoint(codePoint)) {
      const hex = codePoint.toString(16).toUpperCase()
      const key = `__U${hex}__`
      if (!masking.has(key)) {
        masking.set(key, preferNumericEntities ? `&#x${hex};` : character)
      }
      out += key
    } else {
      out += character
    }
  }

  return { masked: out, masking }
}

/**
 * Ghép biểu tượng trở lại vào bản dịch.
 *
 * Chuẩn hoá thực thể trước khi ghép: mô hình hay trả về `& #x1F525 ;` với
 * khoảng trắng thừa, và dạng đó Android đọc thành chữ chứ không thành biểu tượng.
 */
export function restorePlaceholders(text: string, masking: GlyphMasking): string {
  let restored = text
    .replace(HEX_ENTITY, (_match, hex: string) => `&#x${hex};`)
    .replace(DEC_ENTITY, (_match, digits: string) => `&#${digits};`)

  for (const [key, value] of masking) {
    // Thay theo chuỗi thật, không qua regex: mã hiệu là chuỗi cố định và
    // `replaceAll` với chuỗi không diễn giải `$&` trong phần thay thế.
    restored = restored.split(key).join(value)
  }
  return restored
}

/** Mã hiệu còn sót lại — dấu hiệu mô hình đã cắt hoặc bịa thêm. */
const LEFTOVER_PLACEHOLDER = /__(?:HEX|DEC)?U[0-9A-F]+__/g

export const hasLeftoverPlaceholder = (text: string): boolean => {
  LEFTOVER_PLACEHOLDER.lastIndex = 0
  return LEFTOVER_PLACEHOLDER.test(text)
}
