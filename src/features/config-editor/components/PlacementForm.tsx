'use client'

import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { AD_TYPE_LABEL, isAdType } from '@/domain/ads/entities/AdType'
import type { AdUnit } from '@/domain/ads/entities/AdmobIdDocument'
import type { AdPlacement } from '@/domain/ads/entities/ShowAdsDocument'
import type { Finding } from '@/domain/ads/validation/Finding'
import { MONO_FONT_STACK, m3, m3Shape } from '@/ui/theme/m3Tokens'
import { FIELD_GROUPS, FIELD_GROUP_HELP, FIELD_GROUP_LABEL, fieldsInGroup } from '../placementFields'
import { FieldInput } from './FieldInput'
import { FindingList } from './FindingList'

export interface PlacementFormProps {
  placement: AdPlacement
  /** Ad unit đang phục vụ vị trí này, để người dùng thấy hai bên có khớp không. */
  adUnits: readonly AdUnit[]
  findings: readonly Finding[]
  readOnly: boolean
  onChange: (patch: Partial<AdPlacement>) => void
  onClearField: (field: string) => void
  onRemove: () => void
}

/**
 * Biểu mẫu cho một vị trí quảng cáo.
 *
 * Toàn bộ danh sách ô được sinh từ `PLACEMENT_FIELDS`; file này chỉ lo bố cục
 * và ghép kết quả kiểm tra vào đúng nhóm. Thêm một trường mới của SDK không
 * cần mở file này ra.
 *
 * Nhóm trường nào không có tác dụng với cấu hình hiện tại thì biến mất hẳn —
 * ví dụ nhóm "Interstitial" khi vị trí là native. Hiện ra rồi làm mờ đi
 * vẫn buộc người mới phải đọc và tự hỏi có nên điền không.
 */
export function PlacementForm({
  placement,
  adUnits,
  findings,
  readOnly,
  onChange,
  onClearField,
  onRemove,
}: PlacementFormProps) {
  const fieldFindings = (field: string) =>
    findings.filter((finding) => 'field' in finding.path && finding.path.field === field)

  const generalFindings = findings.filter(
    (finding) => !('field' in finding.path) || finding.path.field === undefined,
  )

  return (
    <Stack spacing={6}>
      <Box>
        <Stack direction="row" spacing={3} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h4" sx={{ fontFamily: MONO_FONT_STACK }}>
            {placement.configName}
          </Typography>
          <Chip
            size="small"
            label={placement.isOn === true ? 'Đang bật' : 'Đang tắt'}
            sx={
              placement.isOn === true
                ? { bgcolor: m3('secondaryContainer'), color: m3('onSecondaryContainer') }
                : undefined
            }
            variant={placement.isOn === true ? 'filled' : 'outlined'}
          />
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            disabled={readOnly}
            onClick={onRemove}
          >
            Xoá vị trí
          </Button>
        </Stack>

        <Typography variant="body2" sx={{ color: m3('onSurfaceVariant'), mt: 1 }}>
          Ad unit khớp với vị trí này theo quy ước tên: configName + &quot;_&quot; + hậu tố.
        </Typography>
      </Box>

      <AdUnitSummary placement={placement} adUnits={adUnits} />

      {generalFindings.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>
            Vấn đề của vị trí này
          </Typography>
          <FindingList findings={generalFindings} />
        </Box>
      )}

      {FIELD_GROUPS.map((group) => {
        const fields = fieldsInGroup(group, placement)
        if (fields.length === 0) return null

        return (
          <Box key={group}>
            <Typography variant="subtitle1">{FIELD_GROUP_LABEL[group]}</Typography>
            <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
              {FIELD_GROUP_HELP[group]}
            </Typography>
            <Divider sx={{ my: 3 }} />

            <Box
              sx={{
                display: 'grid',
                gap: 5,
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                alignItems: 'start',
              }}
            >
              {fields.map((descriptor) => {
                const problems = fieldFindings(descriptor.field)
                return (
                  <Box key={descriptor.field}>
                    <FieldInput
                      descriptor={descriptor}
                      value={(placement as unknown as Record<string, unknown>)[descriptor.field]}
                      disabled={readOnly}
                      onChange={(value) => onChange({ [descriptor.field]: value } as Partial<AdPlacement>)}
                      onClear={() => onClearField(descriptor.field)}
                    />
                    {problems.length > 0 && (
                      <Box sx={{ mt: 2 }}>
                        <FindingList findings={problems} />
                      </Box>
                    )}
                  </Box>
                )
              })}
            </Box>
          </Box>
        )
      })}
    </Stack>
  )
}

/** Bảng nhỏ nối vị trí với ad unit của nó — chỗ lệch kiểu lộ ra rõ nhất. */
function AdUnitSummary({
  placement,
  adUnits,
}: {
  placement: AdPlacement
  adUnits: readonly AdUnit[]
}) {
  if (adUnits.length === 0) {
    return (
      <Box
        sx={{
          p: 4,
          borderRadius: `${m3Shape.small}px`,
          bgcolor: m3('surfaceContainerHigh'),
        }}
      >
        <Typography variant="body2">
          Chưa có ad unit nào cho vị trí này. Thêm một ad unit có spaceName bắt đầu bằng{' '}
          <Box component="code" sx={{ fontFamily: MONO_FONT_STACK }}>
            {placement.configName}_
          </Box>{' '}
          ở tab Ad unit.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 4, borderRadius: `${m3Shape.small}px`, bgcolor: m3('surfaceContainerHigh') }}>
      <Typography variant="subtitle2" sx={{ mb: 2 }}>
        {adUnits.length} ad unit đang phục vụ vị trí này
      </Typography>

      <Stack spacing={2}>
        {adUnits.map((unit) => {
          const mismatched = unit.adsType !== placement.type
          return (
            <Stack
              key={unit.spaceName}
              direction="row"
              spacing={3}
              sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 2 }}
            >
              <Typography variant="body2" sx={{ fontFamily: MONO_FONT_STACK, minWidth: 200 }}>
                {unit.spaceName}
              </Typography>
              <Chip
                size="small"
                variant={mismatched ? 'filled' : 'outlined'}
                label={isAdType(unit.adsType) ? AD_TYPE_LABEL[unit.adsType] : unit.adsType}
                sx={
                  mismatched
                    ? { bgcolor: m3('tertiaryContainer'), color: m3('onTertiaryContainer') }
                    : undefined
                }
              />
              <Typography
                variant="caption"
                sx={{ fontFamily: MONO_FONT_STACK, color: m3('onSurfaceVariant') }}
              >
                {unit.id}
              </Typography>
            </Stack>
          )
        })}
      </Stack>
    </Box>
  )
}
