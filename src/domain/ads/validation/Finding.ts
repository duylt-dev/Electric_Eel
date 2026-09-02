/**
 * Ba mức nghiêm trọng, phân biệt bằng HẬU QUẢ chứ không bằng cảm giác.
 *
 * Đây là quyết định thiết kế đắt giá nhất của bộ kiểm tra: một tool hay báo
 * động giả sẽ bị phớt lờ cả những lúc nó báo đúng. Nên chỉ thứ gì thật sự làm
 * mất tiền hoặc làm hỏng app mới được xếp `error`.
 */
export type Severity =
  /** Chắc chắn gây hậu quả: mất doanh thu, quảng cáo không hiện, SDK đọc sai. */
  | 'error'
  /** Nhiều khả năng sai, nhưng có trường hợp cố ý. Không chặn publish. */
  | 'warning'
  /** Chỉ để người xem xác nhận. Không phải lỗi. */
  | 'check'

export const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, check: 2 }

export const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'Lỗi',
  warning: 'Cảnh báo',
  check: 'Cần xác nhận',
}

/**
 * Vị trí của phát hiện, đủ chi tiết để giao diện cuộn tới đúng ô và tô sáng nó.
 * Đây là thứ khiến cùng một bộ luật chạy được cả ở CLI lẫn trong form.
 */
export type FindingPath =
  | { scope: 'showAdsRoot'; field?: string }
  | { scope: 'placement'; configName: string; field?: string }
  | { scope: 'admobRoot'; field?: string }
  | { scope: 'adUnit'; spaceName: string; field?: string }

export interface Finding {
  /** Mã ổn định, dùng để lọc, để tắt luật, và để tra cứu. */
  code: string
  severity: Severity
  /** Mô tả hậu quả, không chỉ mô tả triệu chứng. */
  message: string
  path: FindingPath
  /** Cách sửa, nếu có cách sửa rõ ràng. */
  fix?: string
}

/**
 * Khoá nhận dạng một phát hiện. Phải tính cả `message`: một luật duyệt danh
 * sách có thể sinh nhiều phát hiện cùng mã và cùng vị trí — ví dụ hai tên bố
 * cục lạ trong cùng `listTemplateMedium` đều trỏ về `showAdsRoot/field`, chỉ
 * khác nhau ở nội dung. Bỏ `message` ra thì hai phát hiện khác nhau nhận cùng
 * một khoá, và React coi chúng là một hàng nên bỏ bớt mất một cái.
 */
export const findingKey = (finding: Finding): string => {
  const { path } = finding
  const location =
    path.scope === 'placement'
      ? `placement:${path.configName}`
      : path.scope === 'adUnit'
        ? `adUnit:${path.spaceName}`
        : path.scope
  const field = 'field' in path ? (path.field ?? '') : ''
  return `${finding.code}|${location}|${field}|${finding.message}`
}

export const compareFindings = (a: Finding, b: Finding): number =>
  SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.code.localeCompare(b.code)

export interface FindingSummary {
  error: number
  warning: number
  check: number
  total: number
}

export const summarize = (findings: readonly Finding[]): FindingSummary => {
  const summary: FindingSummary = { error: 0, warning: 0, check: 0, total: findings.length }
  for (const finding of findings) summary[finding.severity] += 1
  return summary
}
