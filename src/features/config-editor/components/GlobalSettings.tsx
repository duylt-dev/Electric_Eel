'use client'

import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { RENAMED_ROOT_FIELDS } from '@/domain/ads/entities/ShowAdsDocument'
import type { ShowAdsDocument } from '@/domain/ads/entities/ShowAdsDocument'
import type { Finding } from '@/domain/ads/validation/Finding'
import { m3, m3Shape } from '@/ui/theme/m3Tokens'
import { ROOT_SWITCHES, ROOT_TIMINGS } from '../placementFields'
import { FieldInput } from './FieldInput'
import { FindingList } from './FindingList'

/**
 * Công tắc tổng cấp app.
 *
 * `disableAllConfig` được tách hẳn ra một khối riêng có viền đỏ. Nó nằm chung
 * hàng với mười một công tắc khác trong JSON, nhưng hậu quả thì khác hẳn: bật
 * lên là toàn bộ quảng cáo trong app dừng, bất kể mọi cấu hình bên dưới. Xếp
 * nó ngang hàng các công tắc kia là mời người ta bấm nhầm.
 */
export function GlobalSettings({
  document,
  findings,
  readOnly,
  onChange,
  onRenameField,
}: {
  document: ShowAdsDocument
  findings: readonly Finding[]
  readOnly: boolean
  onChange: (field: string, value: unknown) => void
  onRenameField: (from: string, to: string) => void
}) {
  const killSwitch = ROOT_SWITCHES[0]
  const switches = ROOT_SWITCHES.slice(1)

  const rootFindings = findings.filter((finding) => finding.path.scope === 'showAdsRoot')

  // Khoá sai tên không có ô nào trên form để sửa hay xoá, nên cách duy nhất
  // là một nút ngay trên phát hiện: đổi tên khoá, giữ nguyên giá trị.
  const actionFor = (finding: Finding) => {
    if (readOnly || finding.code !== 'ROOT_FIELD_RENAMED') return undefined
    const from = 'field' in finding.path ? finding.path.field : undefined
    const to = from === undefined ? undefined : RENAMED_ROOT_FIELDS[from]
    if (from === undefined || to === undefined) return undefined
    return { label: `Đổi tên thành ${to}`, onClick: () => onRenameField(from, to) }
  }

  return (
    <Stack spacing={6}>
      {killSwitch !== undefined && (
        <Box
          sx={{
            p: 4,
            borderRadius: `${m3Shape.medium}px`,
            bgcolor: document.disableAllConfig === true ? m3('errorContainer') : m3('surfaceContainerLow'),
            color: document.disableAllConfig === true ? m3('onErrorContainer') : 'inherit',
            border: `1px solid ${document.disableAllConfig === true ? m3('error') : m3('outlineVariant')}`,
          }}
        >
          <FieldInput
            descriptor={killSwitch}
            value={document.disableAllConfig}
            disabled={readOnly}
            onChange={(value) => onChange('disableAllConfig', value)}
          />
          {document.disableAllConfig === true && (
            <Typography variant="body2" sx={{ mt: 2, fontWeight: 600 }}>
              Đang bật. Mọi vị trí quảng cáo trong app đều ngừng, kể cả những vị trí hiện là &quot;đang bật&quot;.
            </Typography>
          )}
        </Box>
      )}

      {rootFindings.length > 0 && <FindingList findings={rootFindings} actionFor={actionFor} />}

      <Box>
        <Typography variant="subtitle1">Công tắc theo loại quảng cáo</Typography>
        <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
          Tắt một loại ở đây là tắt loại đó ở mọi vị trí, không cần sửa từng vị trí.
        </Typography>

        <Box
          sx={{
            mt: 3,
            display: 'grid',
            gap: 3,
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          }}
        >
          {switches.map((descriptor) => (
            <FieldInput
              key={descriptor.field}
              descriptor={descriptor}
              value={(document as Record<string, unknown>)[descriptor.field]}
              disabled={readOnly}
              onChange={(value) => onChange(descriptor.field, value)}
            />
          ))}
        </Box>
      </Box>

      <Box>
        <Typography variant="subtitle1">Thời gian và vị trí</Typography>

        <Box
          sx={{
            mt: 3,
            display: 'grid',
            gap: 4,
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}
        >
          {ROOT_TIMINGS.map((descriptor) => (
            <FieldInput
              key={descriptor.field}
              descriptor={descriptor}
              value={(document as Record<string, unknown>)[descriptor.field]}
              disabled={readOnly}
              onChange={(value) => onChange(descriptor.field, value)}
            />
          ))}
        </Box>
      </Box>
    </Stack>
  )
}
