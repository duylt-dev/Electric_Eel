/**
 * Soi tệp `strings.xml` NGAY LÚC NHẬN, trước khi tiêu một đồng token nào.
 *
 * ─── Vì sao kiểm ở đây thay vì để mô hình tự xoay xở ───
 *
 * Một lượt dịch là 28 ngôn ngữ nhân số mẻ. Nếu tệp vào đã hỏng thì cái hỏng
 * được nhân lên 28 lần, mất vài phút chờ và một khoản token, để cuối cùng nhận
 * về một tệp zip không dùng được. Mọi thứ trong danh sách dưới đây đều phát
 * hiện được trong vài mili giây bằng cách đọc chính tệp đó.
 *
 * Chỉ những gì CHẮC CHẮN gây hậu quả mới xếp `error` — chúng chặn nút dịch.
 * Phần còn lại vẫn cho đi tiếp, vì người gửi mới là người biết chuỗi của họ.
 */
import { estimateTokens, chunkResources, extractResourceBlocks } from '../entities/StringsChunk'
import { prepareForTranslation } from '../entities/XmlText'
import type { StringsFinding, StringsReport } from './StringsReport'

/** Trần kích thước tệp nhận vào. Trên mức này thì gần như chắc chắn nhầm tệp. */
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024

const RESOURCES_OPEN = /<\s*resources\b[^>]*>/i
const RESOURCES_CLOSE = /<\/\s*resources\s*>/i

/** Thẻ mở của một mục, kèm cụm thuộc tính để đọc `name` và `translatable`. */
const ENTRY_OPEN = /<(string|string-array|plurals)\b([^>]*?)(\/?)>/gi

const NAME_ATTRIBUTE = /\bname\s*=\s*("([^"]*)"|'([^']*)')/i
const TRANSLATABLE_FALSE = /\btranslatable\s*=\s*["']false["']/i
const FORMATTED_FALSE = /\bformatted\s*=\s*["']false["']/i

/** `&` không mở đầu một thực thể nào — XML hỏng, `aapt` từ chối biên dịch. */
const RAW_AMPERSAND = /&(?!(?:[a-zA-Z][a-zA-Z0-9._-]*|#[0-9]+|#[xX][0-9a-fA-F]+);)/g

/** Đặc tả `%` KHÔNG đánh số thứ tự. `%%` là dấu phần trăm thật, bỏ qua. */
const NON_POSITIONAL_FORMAT = /%(?!%)(?![0-9]+\$)[-+ 0#,(]*[0-9]*(?:\.[0-9]+)?[a-zA-Z]/g

const BARE_APOSTROPHE = /(?<!\\)'/

/**
 * Xoá nội dung chú thích và CDATA nhưng GIỮ NGUYÊN độ dài và các dấu xuống dòng.
 *
 * Cần giữ độ dài vì mọi số dòng báo cho người dùng đều tính từ vị trí ký tự
 * trong chuỗi này. Xoá hẳn thì mọi phát hiện phía sau lệch dòng — mà một số
 * dòng sai còn tệ hơn không có số dòng.
 */
function blankOutCommentsAndCdata(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, (match) =>
    match.replace(/[^\n]/g, ' '),
  )
}

/** Dòng chứa vị trí ký tự `offset`, đếm từ 1. */
const lineAt = (xml: string, offset: number): number => {
  let line = 1
  for (let index = 0; index < offset && index < xml.length; index += 1) {
    if (xml[index] === '\n') line += 1
  }
  return line
}

interface ScannedEntry {
  readonly tag: string
  readonly name: string | null
  readonly attributes: string
  readonly selfClosing: boolean
  readonly offset: number
}

function scanEntries(scannable: string): ScannedEntry[] {
  const entries: ScannedEntry[] = []
  ENTRY_OPEN.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = ENTRY_OPEN.exec(scannable)) !== null) {
    const attributes = match[2] ?? ''
    const nameMatch = NAME_ATTRIBUTE.exec(attributes)
    entries.push({
      tag: (match[1] ?? '').toLowerCase(),
      name: nameMatch?.[2] ?? nameMatch?.[3] ?? null,
      attributes,
      selfClosing: match[3] === '/',
      offset: match.index,
    })
  }
  return entries
}

/** Đếm thẻ mở và thẻ đóng của một loại mục, để phát hiện thẻ quên đóng. */
function tagBalance(scannable: string, tag: string): { open: number; close: number } {
  const open = scannable.match(new RegExp(`<${tag}\\b[^>]*?(?<!/)>`, 'gi'))?.length ?? 0
  const close = scannable.match(new RegExp(`</\\s*${tag}\\s*>`, 'gi'))?.length ?? 0
  return { open, close }
}

/**
 * @param chunkTokenLimit Trần token mỗi mẻ, để báo trước số lượt gọi mô hình.
 */
export function validateStringsXml(xml: string, chunkTokenLimit?: number): StringsReport {
  const findings: StringsFinding[] = []
  const add = (finding: StringsFinding): void => {
    findings.push(finding)
  }

  const trimmed = xml.trim()

  if (trimmed.length === 0) {
    add({
      code: 'EMPTY_FILE',
      severity: 'error',
      message: 'Tệp rỗng.',
      fix: 'Chọn lại tệp strings.xml của module gốc (thường là app/src/main/res/values/strings.xml).',
    })
    return emptyReport(findings)
  }

  if (new TextEncoder().encode(xml).length > MAX_SOURCE_BYTES) {
    add({
      code: 'FILE_TOO_LARGE',
      severity: 'error',
      message: `Tệp lớn hơn ${Math.round(MAX_SOURCE_BYTES / 1024 / 1024)} MB.`,
      fix: 'Tách bớt chuỗi hoặc dịch theo từng phần.',
    })
    return emptyReport(findings)
  }

  const scannable = blankOutCommentsAndCdata(xml)

  if (!RESOURCES_OPEN.test(scannable)) {
    add({
      code: 'NO_RESOURCES_ROOT',
      severity: 'error',
      message: 'Không tìm thấy thẻ gốc <resources>.',
      fix: 'Đây có thể không phải tệp strings.xml. Kiểm tra lại tệp đã chọn.',
    })
  } else if (!RESOURCES_CLOSE.test(scannable)) {
    add({
      code: 'UNCLOSED_RESOURCES',
      severity: 'error',
      message: 'Thiếu thẻ đóng </resources>.',
      fix: 'Tệp có thể bị cắt cụt lúc sao chép. Lấy lại bản đầy đủ.',
    })
  }

  for (const tag of ['string', 'string-array', 'plurals'] as const) {
    const { open, close } = tagBalance(scannable, tag)
    if (open !== close) {
      add({
        code: 'UNBALANCED_TAG',
        severity: 'error',
        message: `Có ${open} thẻ mở <${tag}> nhưng ${close} thẻ đóng </${tag}>.`,
        fix: 'Sửa cho khớp rồi tải lên lại. Thẻ lệch nhau thì mọi bản dịch đều lệch theo.',
      })
    }
  }

  const entries = scanEntries(scannable)
  const translatable = entries.filter((entry) => !TRANSLATABLE_FALSE.test(entry.attributes))
  const nonTranslatable = entries.length - translatable.length

  if (entries.length === 0) {
    add({
      code: 'NO_ENTRIES',
      severity: 'error',
      message: 'Không có mục <string>, <string-array> hay <plurals> nào.',
      fix: 'Kiểm tra lại tệp đã chọn.',
    })
  } else if (translatable.length === 0) {
    add({
      code: 'NOTHING_TO_TRANSLATE',
      severity: 'error',
      message: `Cả ${entries.length} mục đều là translatable="false", không còn gì để dịch.`,
      fix: 'Bỏ thuộc tính đó ở những chuỗi thật sự cần dịch.',
    })
  }

  // ─── Trùng tên ───
  // Android biên dịch hỏng khi hai mục cùng `name`, và lỗi đó nhân lên ở cả 28
  // thư mục ra chứ không chỉ ở tệp gốc.
  const seen = new Map<string, number>()
  for (const entry of entries) {
    if (entry.name === null) {
      add({
        code: 'MISSING_NAME',
        severity: 'error',
        message: `Mục <${entry.tag}> ở dòng ${lineAt(xml, entry.offset)} không có thuộc tính name.`,
        line: lineAt(xml, entry.offset),
        fix: 'Đặt tên cho mục đó — không có name thì Android không tham chiếu tới được.',
      })
      continue
    }
    const previous = seen.get(entry.name)
    if (previous !== undefined) {
      add({
        code: 'DUPLICATE_NAME',
        severity: 'error',
        message: `Tên "${entry.name}" xuất hiện lần nữa ở dòng ${lineAt(xml, entry.offset)} (đã có ở dòng ${previous}).`,
        line: lineAt(xml, entry.offset),
        name: entry.name,
        fix: 'Đổi tên hoặc xoá bớt một mục.',
      })
    } else {
      seen.set(entry.name, lineAt(xml, entry.offset))
    }
  }

  // ─── Dấu & thô ───
  RAW_AMPERSAND.lastIndex = 0
  let ampersand: RegExpExecArray | null
  let ampersandCount = 0
  let firstAmpersandLine: number | undefined
  while ((ampersand = RAW_AMPERSAND.exec(scannable)) !== null) {
    ampersandCount += 1
    firstAmpersandLine ??= lineAt(xml, ampersand.index)
  }
  if (ampersandCount > 0) {
    add({
      code: 'RAW_AMPERSAND',
      severity: 'error',
      message: `Có ${ampersandCount} dấu & không thuộc một thực thể nào (dòng đầu tiên: ${firstAmpersandLine}).`,
      ...(firstAmpersandLine !== undefined ? { line: firstAmpersandLine } : {}),
      fix: 'Viết thành &amp; — dấu & thô làm cả tệp không đọc được như XML.',
    })
  }

  // ─── Những thứ chỉ cần biết trước ───
  for (const entry of translatable) {
    if (entry.tag !== 'string' || entry.selfClosing) continue

    const closing = scannable.indexOf('>', entry.offset)
    const end = scannable.indexOf('</', closing)
    if (closing < 0 || end < 0) continue
    const value = xml.slice(closing + 1, end)

    if (value.trim().length === 0) {
      add({
        code: 'EMPTY_VALUE',
        severity: 'warning',
        message: `Chuỗi "${entry.name ?? '?'}" không có nội dung.`,
        line: lineAt(xml, entry.offset),
        ...(entry.name !== null ? { name: entry.name } : {}),
        fix: 'Mô hình không có gì để dịch nên mục này sẽ ra rỗng ở mọi ngôn ngữ.',
      })
      continue
    }

    NON_POSITIONAL_FORMAT.lastIndex = 0
    const placeholders = value.match(NON_POSITIONAL_FORMAT)?.length ?? 0
    if (placeholders > 1 && !FORMATTED_FALSE.test(entry.attributes)) {
      add({
        code: 'AMBIGUOUS_PLACEHOLDER',
        severity: 'warning',
        message: `Chuỗi "${entry.name ?? '?'}" có ${placeholders} tham số dạng %s/%d không đánh số.`,
        line: lineAt(xml, entry.offset),
        ...(entry.name !== null ? { name: entry.name } : {}),
        fix: 'Đánh số thành %1$s, %2$s — thứ tự từ trong câu đổi theo từng ngôn ngữ, không đánh số thì bản dịch ghép sai tham số.',
      })
    }
  }

  const apostrophes = translatable.filter((entry) => BARE_APOSTROPHE.test(entry.attributes)).length
  if (BARE_APOSTROPHE.test(xml.replace(/<[^>]*>/g, '')) || apostrophes > 0) {
    add({
      code: 'BARE_APOSTROPHE',
      severity: 'check',
      message: 'Trong nội dung có dấu nháy đơn chưa thoát.',
      fix: 'Công cụ tự thoát thành \\\' khi ghi tệp ra, không cần sửa trước.',
    })
  }

  if (nonTranslatable > 0) {
    add({
      code: 'NON_TRANSLATABLE_SKIPPED',
      severity: 'check',
      message: `${nonTranslatable} mục translatable="false" sẽ được giữ nguyên, không gửi cho mô hình.`,
    })
  }

  // ─── Quy mô công việc ───
  const filtered = prepareForTranslation(xml)
  const chunks = chunkResources(filtered.xml, chunkTokenLimit)
  const estimatedTokens = estimateTokens(filtered.xml)

  if (chunks.length > 1) {
    add({
      code: 'MULTIPLE_CHUNKS',
      severity: 'check',
      message: `Tệp được cắt thành ${chunks.length} mẻ, mỗi ngôn ngữ ${chunks.length} lượt gọi mô hình.`,
    })
  }

  const hasError = findings.some((finding) => finding.severity === 'error')

  return {
    findings,
    translatableCount: extractResourceBlocks(filtered.xml).length,
    nonTranslatableCount: nonTranslatable,
    chunkCount: chunks.length,
    estimatedTokens,
    acceptable: !hasError,
  }
}

const emptyReport = (findings: readonly StringsFinding[]): StringsReport => ({
  findings,
  translatableCount: 0,
  nonTranslatableCount: 0,
  chunkCount: 0,
  estimatedTokens: 0,
  acceptable: false,
})
