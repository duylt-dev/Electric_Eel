/**
 * Kết quả soi một tệp `strings.xml` trước khi đem đi dịch.
 *
 * Ba mức nghiêm trọng, phân biệt bằng HẬU QUẢ — cùng cách phân loại với bộ
 * kiểm tra cấu hình quảng cáo, và cùng lý do: một tool hay báo động giả sẽ bị
 * phớt lờ cả những lúc nó báo đúng.
 */
export type StringsSeverity =
  /** Đem đi dịch là chắc chắn hỏng: tệp ra không biên dịch được, hoặc mất nội dung. */
  | 'error'
  /** Dịch được, nhưng có chỗ người gửi nên nhìn lại. */
  | 'warning'
  /** Chỉ để biết trước điều gì sẽ xảy ra. Không phải lỗi. */
  | 'check'

export const STRINGS_SEVERITY_LABEL: Record<StringsSeverity, string> = {
  error: 'Lỗi',
  warning: 'Cảnh báo',
  check: 'Cần biết',
}

export interface StringsFinding {
  /** Mã ổn định, để tra cứu và để lọc. */
  readonly code: string
  readonly severity: StringsSeverity
  /** Mô tả hậu quả, không chỉ mô tả triệu chứng. */
  readonly message: string
  /** Số dòng trong tệp, đếm từ 1. Không phải phát hiện nào cũng gắn được dòng. */
  readonly line?: number
  /** Tên mục liên quan, nếu xác định được. */
  readonly name?: string
  /** Cách xử lý, khi có cách rõ ràng. */
  readonly fix?: string
}

export interface StringsReport {
  readonly findings: readonly StringsFinding[]
  /** Số mục sẽ được gửi đi dịch. */
  readonly translatableCount: number
  /** Số mục `translatable="false"` sẽ bị loại trước khi gửi. */
  readonly nonTranslatableCount: number
  /** Số mẻ mỗi ngôn ngữ — bằng số lượt gọi mô hình cho mỗi ngôn ngữ. */
  readonly chunkCount: number
  readonly estimatedTokens: number
  /** Không còn `error` nào. Chỉ khi đó nút dịch mới bấm được. */
  readonly acceptable: boolean
}

export const countBySeverity = (
  findings: readonly StringsFinding[],
): Record<StringsSeverity, number> => {
  const counts: Record<StringsSeverity, number> = { error: 0, warning: 0, check: 0 }
  for (const finding of findings) counts[finding.severity] += 1
  return counts
}

/** Khoá dựng danh sách trong React. Gộp cả `message` vì một mã có thể ra nhiều dòng. */
export const findingKey = (finding: StringsFinding, index: number): string =>
  `${finding.code}|${finding.line ?? ''}|${finding.name ?? ''}|${index}`
