'use client'

import ErrorIcon from '@mui/icons-material/ErrorOutlineRounded'
import HelpIcon from '@mui/icons-material/HelpOutlineRounded'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import type { Finding, Severity } from '@/domain/ads/validation/Finding'
import { findingKey } from '@/domain/ads/validation/Finding'
import type { StatusTone } from '@/ui/components/StatusChip'
import { StatusChip } from '@/ui/components/StatusChip'
import { MONO_FONT_STACK, m3, m3Mono, m3Shape } from '@/ui/theme/m3Tokens'

/**
 * Ba mức phân biệt bằng MÀU VAI TRÒ, không phải bằng đỏ/vàng/xanh tuỳ hứng:
 * lỗi dùng cặp error, cảnh báo dùng cặp warning, cần-xác-nhận dùng surface.
 * Nhờ vậy chúng vẫn đọc được ở cả chế độ sáng lẫn tối mà không phải chỉnh tay.
 *
 * Cảnh báo từng mượn tạm cặp `tertiary` — mà tertiary trong bảng màu này là màu
 * xanh lá của trạng thái tốt. Một cảnh báo tô xanh lá thì người đọc lướt qua sẽ
 * hiểu ngược hẳn ý, nên bảng màu có thêm một họ `warning` riêng.
 */
const STYLE: Record<Severity, { icon: typeof ErrorIcon; edge: string; tone: StatusTone; label: string }> = {
  error: { icon: ErrorIcon, edge: m3('error'), tone: 'bad', label: 'Lỗi' },
  warning: { icon: WarningAmberIcon, edge: m3('warning'), tone: 'warn', label: 'Cảnh báo' },
  check: { icon: HelpIcon, edge: m3('outline'), tone: 'neutral', label: 'Cần xác nhận' },
}

/**
 * Một phát hiện vẽ như một khối ghi chú: nền trung tính, một vạch màu ở cạnh
 * trái. Tô nguyên khối theo màu mức độ thì mười phát hiện xếp liền nhau thành
 * một mảng màu, và cái thứ mười nhìn khẩn cấp y như cái thứ nhất.
 */
export function FindingRow({ finding }: { finding: Finding }) {
  const style = STYLE[finding.severity]
  const Icon = style.icon

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 3,
        alignItems: 'flex-start',
        p: 3,
        border: `1px solid ${m3('outlineVariant')}`,
        borderLeft: `3px solid ${style.edge}`,
        borderRadius: `0 ${m3Shape.small}px ${m3Shape.small}px 0`,
        bgcolor: m3('surfaceContainerLow'),
      }}
    >
      <Icon fontSize="small" sx={{ mt: '2px', flexShrink: 0, color: style.edge }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ color: m3('onSurface') }}>
          {finding.message}
        </Typography>
        {finding.fix !== undefined && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: m3('onSurfaceVariant') }}>
            Cách sửa: {finding.fix}
          </Typography>
        )}
        <Typography
          sx={{ ...m3Mono.columnHeader, display: 'block', mt: 2, color: m3('outline'), fontFamily: MONO_FONT_STACK }}
        >
          {finding.code}
        </Typography>
      </Box>
      <Box sx={{ flexShrink: 0 }}>
        <StatusChip tone={style.tone}>{style.label}</StatusChip>
      </Box>
    </Box>
  )
}

export function FindingList({
  findings,
  emptyMessage = 'Không có vấn đề nào.',
  max,
}: {
  findings: readonly Finding[]
  emptyMessage?: string
  max?: number
}) {
  if (findings.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
        {emptyMessage}
      </Typography>
    )
  }

  const shown = max === undefined ? findings : findings.slice(0, max)

  // Dữ liệu thật có thể chứa hai mục giống hệt nhau trong cùng một danh sách
  // (một tên bố cục lạ lặp lại chẳng hạn), và khi đó hai phát hiện trùng nhau
  // tới từng ký tự. Đếm lần xuất hiện để khoá vẫn phân biệt được chúng.
  const seen = new Map<string, number>()
  const keyed = shown.map((finding) => {
    const base = findingKey(finding)
    const seq = (seen.get(base) ?? 0) + 1
    seen.set(base, seq)
    return { finding, key: seq === 1 ? base : `${base}#${seq}` }
  })

  return (
    <Stack spacing={2}>
      {keyed.map(({ finding, key }) => (
        <FindingRow key={key} finding={finding} />
      ))}
      {shown.length < findings.length && (
        <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
          … và {findings.length - shown.length} mục nữa
        </Typography>
      )}
    </Stack>
  )
}

/** Ba con số tóm tắt, dùng ở thanh trên cùng và cạnh mỗi biến thể. */
export function FindingSummaryChips({
  summary,
}: {
  summary: { error: number; warning: number; check: number }
}) {
  const entries: { severity: Severity; count: number }[] = [
    { severity: 'error', count: summary.error },
    { severity: 'warning', count: summary.warning },
    { severity: 'check', count: summary.check },
  ]

  const shown = entries.filter((entry) => entry.count > 0)

  if (shown.length === 0) {
    return (
      <StatusChip tone="ok" dot>
        không có vấn đề
      </StatusChip>
    )
  }

  return (
    <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
      {shown.map((entry) => (
        <StatusChip key={entry.severity} tone={STYLE[entry.severity].tone} dot>
          {entry.count} {STYLE[entry.severity].label.toLowerCase()}
        </StatusChip>
      ))}
    </Stack>
  )
}
