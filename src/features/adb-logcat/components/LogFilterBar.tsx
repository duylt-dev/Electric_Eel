'use client'

import ClearIcon from '@mui/icons-material/Clear'
import SearchIcon from '@mui/icons-material/Search'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { isDefaultFilter } from '@/domain/adb/entities/LogcatFilter'
import type { LogcatFilter } from '@/domain/adb/entities/LogcatFilter'
import { LEVEL_LABEL, LOG_LEVELS } from '@/domain/adb/entities/LogcatLine'
import type { LogLevel } from '@/domain/adb/entities/LogcatLine'
import { m3, m3Mono, m3Shape } from '@/ui/theme/m3Tokens'
import type { M3ColorRole } from '@/ui/theme/m3Tokens'

/**
 * Hàng lọc: mức, tag, và ô tìm chuỗi.
 *
 * Số bên cạnh mỗi mức là số dòng ĐANG CÓ trong đệm ở mức đó — không phải số
 * dòng đang hiện. Nhờ vậy tắt một mức rồi vẫn thấy mình đang giấu đi bao nhiêu,
 * và không ai đi tìm một lỗi đã bị chính bộ lọc của mình che mất.
 */
export interface LogFilterBarProps {
  filter: LogcatFilter
  counts: Record<LogLevel, number>
  onToggleLevel: (level: LogLevel) => void
  onTagChange: (value: string) => void
  onQueryChange: (value: string) => void
  onClear: () => void
  /** Số dòng còn lại sau khi lọc, và tổng số dòng trong đệm. */
  shown: number
  total: number
}

export function LogFilterBar({
  filter,
  counts,
  onToggleLevel,
  onTagChange,
  onQueryChange,
  onClear,
  shown,
  total,
}: LogFilterBarProps) {
  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        {LOG_LEVELS.map((level) => (
          <LevelChip
            key={level}
            level={level}
            active={filter.levels.includes(level)}
            count={counts[level]}
            onClick={() => onToggleLevel(level)}
          />
        ))}

        <Box sx={{ flex: 1 }} />

        <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
          {shown === total
            ? `${total.toLocaleString('vi-VN')} dòng`
            : `${shown.toLocaleString('vi-VN')} / ${total.toLocaleString('vi-VN')} dòng`}
        </Typography>

        {!isDefaultFilter(filter) && (
          <Button size="small" variant="text" onClick={onClear}>
            Bỏ lọc
          </Button>
        )}
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 3 }}>
        <TextField
          size="small"
          value={filter.tag}
          onChange={(event) => onTagChange(event.target.value)}
          placeholder="Lọc theo tag"
          sx={{ maxWidth: { sm: 220 }, width: '100%' }}
          slotProps={{
            htmlInput: { 'aria-label': 'Lọc theo tag' },
            input: {
              endAdornment:
                filter.tag.length === 0 ? null : (
                  <InputAdornment position="end">
                    <IconButton size="small" aria-label="Xoá bộ lọc tag" onClick={() => onTagChange('')}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
            },
          }}
        />

        <TextField
          size="small"
          type="search"
          value={filter.query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Tìm trong nội dung log"
          sx={{
            flex: 1,
            'input[type="search"]::-webkit-search-cancel-button': { display: 'none' },
          }}
          slotProps={{
            htmlInput: { 'aria-label': 'Tìm trong nội dung log' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment:
                filter.query.length === 0 ? null : (
                  <InputAdornment position="end">
                    <IconButton size="small" aria-label="Xoá ô tìm" onClick={() => onQueryChange('')}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
            },
          }}
        />
      </Stack>
    </Stack>
  )
}

const LEVEL_TONE: Record<LogLevel, M3ColorRole> = {
  V: 'outline',
  D: 'onSurfaceVariant',
  I: 'tertiary',
  W: 'warning',
  E: 'error',
  F: 'error',
}

function LevelChip({
  level,
  active,
  count,
  onClick,
}: {
  level: LogLevel
  active: boolean
  count: number
  onClick: () => void
}) {
  const tone = m3(LEVEL_TONE[level])

  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`${LEVEL_LABEL[level]} — ${count.toLocaleString('vi-VN')} dòng`}
      sx={{
        ...m3Mono.chip,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1.5,
        cursor: 'pointer',
        borderRadius: `${m3Shape.full}px`,
        paddingInline: '10px',
        paddingBlock: '4px',
        border: `1px solid ${active ? tone : m3('outlineVariant')}`,
        backgroundColor: active ? m3('surfaceContainerHigh') : 'transparent',
        color: active ? tone : m3('outline'),
        opacity: active ? 1 : 0.65,
        transition: 'opacity 120ms ease, border-color 120ms ease',
      }}
    >
      {level}
      <Box component="span" sx={{ color: 'inherit', opacity: 0.75 }}>
        {count > 999 ? '999+' : count}
      </Box>
    </Box>
  )
}
