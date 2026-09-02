'use client'

import SearchIcon from '@mui/icons-material/Search'
import Box from '@mui/material/Box'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

import { AD_TYPE_LABEL, isAdType } from '@/domain/ads/entities/AdType'
import type { AdPlacement } from '@/domain/ads/entities/ShowAdsDocument'
import type { Finding } from '@/domain/ads/validation/Finding'
import { m3, m3Shape } from '@/ui/theme/m3Tokens'
import { PLACEMENT_FILTER_LABEL } from '../ConfigEditorContract'
import type { PlacementFilter } from '../ConfigEditorContract'

/**
 * Danh sách vị trí quảng cáo.
 *
 * Mỗi dòng mang một chấm màu theo mức nghiêm trọng cao nhất của vị trí đó, nên
 * quét mắt một lượt là thấy chỗ nào cần xem. Với 66 vị trí, đây là khác biệt
 * giữa "tìm thấy trong hai giây" và "cuộn tìm trong hai phút".
 */
const worstOf = (findings: readonly Finding[]): 'error' | 'warning' | 'check' | null => {
  if (findings.some((finding) => finding.severity === 'error')) return 'error'
  if (findings.some((finding) => finding.severity === 'warning')) return 'warning'
  if (findings.length > 0) return 'check'
  return null
}

const DOT_COLOR = {
  error: m3('error'),
  warning: m3('tertiary'),
  check: m3('outline'),
} as const

export interface PlacementListProps {
  placements: readonly AdPlacement[]
  totalCount: number
  findingsByPlacement: ReadonlyMap<string, Finding[]>
  selected: string | null
  search: string
  filter: PlacementFilter
  readOnly: boolean
  onSearch: (value: string) => void
  onFilter: (filter: PlacementFilter) => void
  onSelect: (configName: string) => void
  onToggle: (configName: string, isOn: boolean) => void
}

export function PlacementList({
  placements,
  totalCount,
  findingsByPlacement,
  selected,
  search,
  filter,
  readOnly,
  onSearch,
  onFilter,
  onSelect,
  onToggle,
}: PlacementListProps) {
  return (
    <Stack spacing={3} sx={{ height: '100%', minHeight: 0 }}>
      <TextField
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Tìm theo tên vị trí"
        fullWidth
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
      />

      <ToggleButtonGroup
        value={filter}
        exclusive
        size="small"
        onChange={(_event, next: PlacementFilter | null) => next !== null && onFilter(next)}
        sx={{ flexWrap: 'wrap' }}
      >
        {(Object.keys(PLACEMENT_FILTER_LABEL) as PlacementFilter[]).map((key) => (
          <ToggleButton key={key} value={key} sx={{ textTransform: 'none', px: 3 }}>
            {PLACEMENT_FILTER_LABEL[key]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
        {placements.length === totalCount
          ? `${totalCount} vị trí`
          : `${placements.length} / ${totalCount} vị trí`}
      </Typography>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', mx: -1, px: 1 }}>
        <Stack spacing={1}>
          {placements.map((placement) => {
            const findings = findingsByPlacement.get(placement.configName) ?? []
            const worst = worstOf(findings)
            const active = selected === placement.configName

            return (
              <Stack
                key={placement.configName}
                direction="row"
                spacing={2}
                onClick={() => onSelect(placement.configName)}
                sx={{
                  alignItems: 'center',
                  px: 3,
                  py: 2,
                  cursor: 'pointer',
                  borderRadius: `${m3Shape.small}px`,
                  bgcolor: active ? m3('secondaryContainer') : 'transparent',
                  color: active ? m3('onSecondaryContainer') : 'inherit',
                  '&:hover': { bgcolor: active ? m3('secondaryContainer') : m3('surfaceContainerHigh') },
                }}
              >
                <Box
                  aria-hidden
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    flexShrink: 0,
                    bgcolor: worst === null ? 'transparent' : DOT_COLOR[worst],
                    border: worst === null ? `1px solid ${m3('outlineVariant')}` : 'none',
                  }}
                />

                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: active ? 600 : 400 }}>
                    {placement.configName}
                  </Typography>
                  <Typography variant="caption" noWrap sx={{ color: m3('onSurfaceVariant') }}>
                    {isAdType(placement.type) ? AD_TYPE_LABEL[placement.type] : placement.type}
                    {findings.length > 0 && ` · ${findings.length} mục cần xem`}
                  </Typography>
                </Box>

                <Switch
                  size="small"
                  checked={placement.isOn === true}
                  disabled={readOnly}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => onToggle(placement.configName, event.target.checked)}
                  slotProps={{ input: { 'aria-label': `Bật tắt ${placement.configName}` } }}
                />
              </Stack>
            )
          })}

          {placements.length === 0 && (
            <Typography variant="body2" sx={{ color: m3('onSurfaceVariant'), p: 3 }}>
              Không có vị trí nào khớp bộ lọc.
            </Typography>
          )}
        </Stack>
      </Box>
    </Stack>
  )
}
