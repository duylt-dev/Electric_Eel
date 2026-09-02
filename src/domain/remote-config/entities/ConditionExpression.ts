/**
 * Mô hình có cấu trúc cho biểu thức điều kiện của Remote Config.
 *
 * ─── Nguyên tắc an toàn quan trọng nhất của file này ───
 *
 * Cú pháp biểu thức là của Firebase, không phải của chúng ta, và nó có những
 * dạng mà bộ phân tích dưới đây không nhận ra. Vì vậy:
 *
 *   1. Cái gì không phân tích được thì giữ NGUYÊN VĂN dưới dạng mệnh đề `raw`.
 *      Tool không bao giờ được phép làm hỏng một điều kiện người khác viết tay
 *      chỉ vì nó không hiểu.
 *   2. Chuỗi hoá một biểu thức đã phân tích rồi phải ra lại đúng chuỗi ban đầu.
 *      `parse` rồi `serialize` là phép đồng nhất — có test bảo vệ điều này.
 *   3. Tính hợp lệ cuối cùng do FIREBASE phán, qua `?validate_only=true`, chứ
 *      không do file này phán. Đó là lý do tồn tại của use case
 *      `ValidateConditionExpression`.
 *
 * Nếu thấy `||` hoặc dấu ngoặc lồng nhau, cả biểu thức trở thành một mệnh đề
 * `raw` duy nhất. Phân tích nửa vời nguy hiểm hơn là không phân tích.
 */

export type ConditionClause =
  | { kind: 'country'; countries: string[] }
  | { kind: 'language'; languages: string[] }
  | { kind: 'platform'; os: string }
  | { kind: 'appId'; appId: string }
  | { kind: 'raw'; expression: string }

export type ConditionClauseKind = ConditionClause['kind']

/** Các mệnh đề tool tự dựng được bằng ô chọn. Còn lại người dùng gõ tay. */
export const BUILDABLE_CLAUSE_KINDS: readonly ConditionClauseKind[] = [
  'country',
  'language',
  'platform',
  'appId',
]

export const CLAUSE_LABEL: Record<ConditionClauseKind, string> = {
  country: 'Quốc gia / vùng',
  language: 'Ngôn ngữ thiết bị',
  platform: 'Nền tảng',
  appId: 'App ID',
  raw: 'Biểu thức tự viết',
}

const quote = (value: string): string => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const quoteList = (values: readonly string[]): string => `[${values.map(quote).join(', ')}]`

export function serializeClause(clause: ConditionClause): string {
  switch (clause.kind) {
    case 'country':
      return `device.country in ${quoteList(clause.countries)}`
    case 'language':
      return `device.language in ${quoteList(clause.languages)}`
    case 'platform':
      return `device.os == ${quote(clause.os)}`
    case 'appId':
      return `app.id == ${quote(clause.appId)}`
    case 'raw':
      return clause.expression
  }
}

export const serializeExpression = (clauses: readonly ConditionClause[]): string =>
  clauses.map(serializeClause).join(' && ')

/** Tách theo `&&` ở cấp ngoài cùng, bỏ qua `&&` nằm trong chuỗi hoặc ngoặc. */
function splitTopLevelAnd(expression: string): string[] | null {
  const parts: string[] = []
  let depth = 0
  let quoteChar: string | null = null
  let start = 0

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index]
    if (char === undefined) break

    if (quoteChar !== null) {
      if (char === '\\') index += 1
      else if (char === quoteChar) quoteChar = null
      continue
    }
    if (char === "'" || char === '"') {
      quoteChar = char
      continue
    }
    if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth -= 1
    else if (char === '|' && depth === 0) {
      // Có `||` ở cấp ngoài cùng: không tách, trả nguyên cả biểu thức.
      return null
    } else if (char === '&' && depth === 0 && expression[index + 1] === '&') {
      parts.push(expression.slice(start, index))
      index += 1
      start = index + 1
    }
  }
  if (quoteChar !== null || depth !== 0) return null
  parts.push(expression.slice(start))
  return parts.map((part) => part.trim()).filter((part) => part.length > 0)
}

function parseStringList(literal: string): string[] | null {
  const trimmed = literal.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null
  const inner = trimmed.slice(1, -1).trim()
  if (inner.length === 0) return []

  const values: string[] = []
  const pattern = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g
  let consumed = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(inner)) !== null) {
    const raw = match[1] ?? match[2]
    if (raw === undefined) return null
    values.push(raw.replace(/\\(.)/g, '$1'))
    consumed = pattern.lastIndex
  }
  // Còn ký tự nào ngoài dấu phẩy và khoảng trắng nghĩa là có dạng ta chưa hiểu.
  const leftovers = inner.slice(consumed).replace(/[\s,]/g, '')
  if (leftovers.length > 0 || values.length === 0) return null
  return values
}

function parseQuoted(literal: string): string | null {
  const match = /^'((?:[^'\\]|\\.)*)'$|^"((?:[^"\\]|\\.)*)"$/.exec(literal.trim())
  const raw = match?.[1] ?? match?.[2]
  return raw === undefined ? null : raw.replace(/\\(.)/g, '$1')
}

function parseClause(part: string): ConditionClause {
  const raw: ConditionClause = { kind: 'raw', expression: part }

  const inMatch = /^(device\.country|device\.language)\s+in\s+(\[[\s\S]*\])$/.exec(part)
  if (inMatch?.[1] !== undefined && inMatch[2] !== undefined) {
    const values = parseStringList(inMatch[2])
    if (values !== null) {
      return inMatch[1] === 'device.country'
        ? { kind: 'country', countries: values }
        : { kind: 'language', languages: values }
    }
    return raw
  }

  const eqMatch = /^(device\.os|app\.id)\s*==\s*('[\s\S]*'|"[\s\S]*")$/.exec(part)
  if (eqMatch?.[1] !== undefined && eqMatch[2] !== undefined) {
    const value = parseQuoted(eqMatch[2])
    if (value !== null) {
      return eqMatch[1] === 'device.os' ? { kind: 'platform', os: value } : { kind: 'appId', appId: value }
    }
  }

  return raw
}

/**
 * Phân tích một biểu thức thành các mệnh đề. Không bao giờ ném lỗi và không
 * bao giờ mất thông tin: trường hợp xấu nhất trả về đúng một mệnh đề `raw`
 * chứa nguyên văn đầu vào.
 */
export function parseExpression(expression: string): ConditionClause[] {
  const trimmed = expression.trim()
  if (trimmed.length === 0) return []

  const parts = splitTopLevelAnd(trimmed)
  if (parts === null) return [{ kind: 'raw', expression: trimmed }]
  return parts.map(parseClause)
}

/** Biểu thức này tool có hiển thị được bằng ô chọn hay chỉ xem được dạng chữ? */
export const isFullyStructured = (clauses: readonly ConditionClause[]): boolean =>
  clauses.length > 0 && clauses.every((clause) => clause.kind !== 'raw')

/** Điều kiện mặc định "áp dụng cho tất cả" mà Firebase console cũng dùng. */
export const ALWAYS_TRUE_EXPRESSION = 'true'
