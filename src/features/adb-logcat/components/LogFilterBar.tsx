'use client'

import ClearIcon from '@mui/icons-material/Clear'
import SearchIcon from '@mui/icons-material/Search'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'

import type { LogcatFilter } from '@/domain/adb/entities/LogcatFilter'
import { LEVEL_LABEL } from '@/domain/adb/entities/LogcatLine'
import type { LogLevel } from '@/domain/adb/entities/LogcatLine'
import { m3, m3Mono, m3Shape } from '@/ui/theme/m3Tokens'
import type { M3ColorRole } from '@/ui/theme/m3Tokens'

/**
 * Bộ lọc: mức, tag, ô tìm chuỗi.
 *
 * Trả về một Fragment chứ không tự bọc hàng — chủ của nó (màn logcat) xếp
 * nó CÙNG HÀNG với dãy nút luồng và nút cỡ chữ; một hàng duy nhất trên đầu
 * khung log là cách khung log lấy được gần hết chiều cao trang.
 *
 * Chip KHÔNG hiện số dòng theo mức. Đếm là một vòng qua toàn bộ đệm (tới 5000
 * dòng) mỗi lô log tới, chỉ để ra một con số ít ai đọc; bỏ đi thì mỗi lô chỉ
 * tốn đúng một lần lọc.
 *
 * Chỉ có chip cho D/I/W/E. Verbose và Fatal vẫn hiện trong khung log, nhưng
 * không ai tắt riêng chúng: V gần như không app nào in ra, F thì xuất hiện là
 * phải nhìn thấy. Hai chip ấy chỉ chiếm chỗ trên hàng nút.
 *
 * Không có nút "Bỏ lọc": bộ lọc chỉ có hai ô chữ và bốn chip, tự xoá còn nhanh
 * hơn đi tìm cái nút.
 */
const CHIP_LEVELS: readonly LogLevel[] = ['D', 'I', 'W', 'E']

export interface LogFilterBarProps {
  filter: LogcatFilter
  onToggleLevel: (level: LogLevel) => void
  onTagChange: (value: string) => void
  onQueryChange: (value: string) => void
}

export function LogFilterBar({ filter, onToggleLevel, onTagChange, onQueryChange }: LogFilterBarProps) {
  return (
    <>
      <Stack direction="row" sx={{ gap: 0.75, alignItems: 'center' }}>
        {CHIP_LEVELS.map((level) => (
          <LevelChip
            key={level}
            level={level}
            active={filter.levels.includes(level)}
            onClick={() => onToggleLevel(level)}
          />
        ))}
      </Stack>

      <TextField
        size="small"
        value={filter.tag}
        onChange={(event) => onTagChange(event.target.value)}
        placeholder="Tag"
        sx={{ width: 120 }}
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
        placeholder="Tìm trong log"
        sx={{
          flex: 1,
          minWidth: 160,
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
    </>
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

function LevelChip({ level, active, onClick }: { level: LogLevel; active: boolean; onClick: () => void }) {
  const tone = m3(LEVEL_TONE[level])

  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={LEVEL_LABEL[level]}
      sx={{
        ...m3Mono.chip,
        display: 'inline-flex',
        alignItems: 'center',
        cursor: 'pointer',
        borderRadius: `${m3Shape.full}px`,
        paddingInline: '7px',
        paddingBlock: '3px',
        border: `1px solid ${active ? tone : m3('outlineVariant')}`,
        backgroundColor: active ? m3('surfaceContainerHigh') : 'transparent',
        color: active ? tone : m3('outline'),
        opacity: active ? 1 : 0.65,
        transition: 'opacity 120ms ease, border-color 120ms ease',
      }}
    >
      {level}
    </Box>
  )
}
