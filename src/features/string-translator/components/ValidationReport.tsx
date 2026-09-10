'use client'

import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { STRINGS_SEVERITY_LABEL, countBySeverity, findingKey } from '@/domain/translation/validation/StringsReport'
import type { StringsReport, StringsSeverity } from '@/domain/translation/validation/StringsReport'
import { MetaChip } from '@/ui/components/MetaChip'
import { StatusChip } from '@/ui/components/StatusChip'
import type { StatusTone } from '@/ui/components/StatusChip'
import { m3, m3Shape } from '@/ui/theme/m3Tokens'

/**
 * Kết quả soi tệp.
 *
 * Lỗi xếp trước, rồi cảnh báo, rồi những thứ chỉ cần biết — vì thứ tự đó cũng
 * là thứ tự người ta phải xử lý. Mỗi phát hiện nói kèm CÁCH SỬA khi có cách rõ
 * ràng: một danh sách lỗi không kèm cách sửa chỉ chuyển việc sang cho người đọc.
 */
const TONE: Record<StringsSeverity, StatusTone> = {
  error: 'bad',
  warning: 'warn',
  check: 'info',
}

const ORDER: Record<StringsSeverity, number> = { error: 0, warning: 1, check: 2 }

export interface ValidationReportProps {
  report: StringsReport
}

export function ValidationReport({ report }: ValidationReportProps) {
  const counts = countBySeverity(report.findings)
  const sorted = [...report.findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])

  return (
    <Stack spacing={4}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
        <MetaChip label="chuỗi sẽ dịch">{report.translatableCount}</MetaChip>
        <MetaChip label="giữ nguyên">{report.nonTranslatableCount}</MetaChip>
        <MetaChip label="mẻ mỗi ngôn ngữ">{report.chunkCount}</MetaChip>
        {counts.error > 0 ? <MetaChip label="lỗi">{counts.error}</MetaChip> : null}
        {counts.warning > 0 ? <MetaChip label="cảnh báo">{counts.warning}</MetaChip> : null}
      </Stack>

      {sorted.length === 0 ? (
        <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
          Không phát hiện vấn đề nào. Tệp sẵn sàng để dịch.
        </Typography>
      ) : (
        <Stack
          component="ul"
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            gap: 2,
            border: `1px solid ${m3('outlineVariant')}`,
            borderRadius: `${m3Shape.medium}px`,
            overflow: 'hidden',
          }}
        >
          {sorted.map((finding, index) => (
            <Box
              component="li"
              key={findingKey(finding, index)}
              sx={{
                display: 'flex',
                gap: 3,
                alignItems: 'flex-start',
                px: 4,
                py: 3,
                borderTop: index === 0 ? 'none' : `1px solid ${m3('outlineVariant')}`,
                backgroundColor: finding.severity === 'error' ? m3('errorContainer') : 'transparent',
              }}
            >
              <Box sx={{ pt: 0.5, flex: 'none' }}>
                <StatusChip tone={TONE[finding.severity]}>
                  {STRINGS_SEVERITY_LABEL[finding.severity]}
                </StatusChip>
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {finding.message}
                </Typography>
                {finding.fix === undefined ? null : (
                  <Typography variant="caption" sx={{ color: m3('onSurfaceVariant'), display: 'block', mt: 0.5 }}>
                    {finding.fix}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
