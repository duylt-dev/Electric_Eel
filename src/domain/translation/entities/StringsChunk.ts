/**
 * Cắt `strings.xml` thành từng mẻ vừa với một lượt gọi mô hình, rồi ghép kết
 * quả lại thành một tệp hoàn chỉnh.
 *
 * ─── Vì sao phải cắt ───
 *
 * Gửi cả tệp 300 chuỗi trong một lượt thì hai thứ hỏng cùng lúc: bản dịch chạm
 * trần token đầu ra và bị cắt cụt GIỮA một thẻ, và mô hình bắt đầu bỏ sót mục ở
 * quãng giữa. Cả hai đều không ném lỗi — chúng trả về XML trông vẫn hợp lệ,
 * thiếu vài chục chuỗi.
 *
 * Cắt theo ranh giới thẻ (không bao giờ cắt giữa một `<string>`) nghĩa là mỗi
 * mẻ tự nó là một mẩu XML đọc được, và một mẻ hỏng chỉ làm mất phần của nó.
 */
import { collapseBlankLines, escapeApostrophesOutsideTags, resourcesOpenTag } from './XmlText'

/**
 * Một mục tài nguyên trọn vẹn. Nhánh cuối bắt cả dạng thẻ tự đóng —
 * `<string name="x"/>` hiếm nhưng có thật, và bỏ sót nó nghĩa là mục đó biến
 * mất khỏi tệp dịch mà không có gì báo.
 */
const RESOURCE_BLOCK =
  /<plurals\b[^>]*?>[\s\S]*?<\/plurals>|<string-array\b[^>]*?>[\s\S]*?<\/string-array>|<string\b[^>]*?>[\s\S]*?<\/string>|<(?:string|string-array|plurals)\b[^>]*?\/>/gi

/** Trần token của một mẻ. Đúng mặc định `CHUNK_TOKEN_LIMIT` của tool Python. */
export const DEFAULT_CHUNK_TOKEN_LIMIT = 4000

/**
 * Ước lượng số token.
 *
 * Không kéo về một bộ tách token thật: nó nặng hơn cả phần còn lại của tính
 * năng này, chỉ để phục vụ một con số vốn đã là ước lượng. 3.6 ký tự một token
 * là mức thận trọng cho XML tiếng Anh — đoán dư thì mẻ nhỏ hơn cần thiết, tốn
 * thêm một lượt gọi; đoán thiếu thì bản dịch bị cắt cụt. Hai vế đó không ngang
 * giá nhau, nên chọn lệch về phía đoán dư.
 */
export const estimateTokens = (text: string): number => Math.max(1, Math.ceil(text.length / 3.6))

/** Tách các mục tài nguyên, giữ nguyên thứ tự xuất hiện. */
export function extractResourceBlocks(xml: string): string[] {
  RESOURCE_BLOCK.lastIndex = 0
  return xml.match(RESOURCE_BLOCK) ?? []
}

/**
 * Gom các mục thành mẻ, mỗi mẻ không vượt trần token.
 *
 * Một mục lớn hơn cả trần vẫn đi riêng một mẻ chứ không bị cắt đôi: một
 * `<string-array>` bị cắt giữa chừng thì cả hai nửa đều là XML hỏng.
 */
export function chunkResources(
  xml: string,
  tokenLimit: number = DEFAULT_CHUNK_TOKEN_LIMIT,
): string[] {
  const blocks = extractResourceBlocks(xml)
  if (blocks.length === 0) return []

  const chunks: string[] = []
  let current: string[] = []
  let currentTokens = 0

  for (const block of blocks) {
    const tokens = estimateTokens(block)
    if (currentTokens > 0 && currentTokens + tokens > tokenLimit) {
      chunks.push(current.join('\n'))
      current = []
      currentTokens = 0
    }
    current.push(block)
    currentTokens += tokens
  }

  if (current.length > 0) chunks.push(current.join('\n'))
  return chunks
}

export interface AssembleOptions {
  /** Thoát `'` thành `\'` trong phần văn bản. Android bắt buộc, nên mặc định bật. */
  readonly escapeApostrophes: boolean
}

/**
 * Dựng lại tệp hoàn chỉnh từ các mẻ đã dịch.
 *
 * Thẻ mở lấy từ tệp GỐC chứ không lấy từ bản dịch: mô hình có thể bỏ mất
 * `xmlns:tools` hay các thuộc tính khác trên `<resources>`, mà những thứ đó
 * không phải nội dung để dịch.
 */
export function assembleTranslatedXml(
  originalXml: string,
  translatedChunks: readonly string[],
  options: AssembleOptions,
): string {
  const body = translatedChunks
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .join('\n')

  const assembled = `${resourcesOpenTag(originalXml)}\n${body}\n</resources>\n`
  const tidied = collapseBlankLines(assembled)
  return options.escapeApostrophes ? escapeApostrophesOutsideTags(tidied) : tidied
}
