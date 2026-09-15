'use client'

import TextDecreaseIcon from '@mui/icons-material/TextDecrease'
import TextIncreaseIcon from '@mui/icons-material/TextIncrease'
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import { useSyncExternalStore } from 'react'

import { m3 } from '@/ui/theme/m3Tokens'

/**
 * Các cỡ chữ của khung log, đơn vị rem. Mặc định 0.875rem (14px) — cỡ đọc
 * được hàng giờ mà không nheo mắt; 0.78rem cũ là cỡ cho "nhìn thấy nhiều
 * dòng", không phải cho đọc. Tối đa 1.1rem: xa hơn thì một dòng logcat bình
 * thường không còn vừa bề ngang khung.
 */
export const LOG_FONT_SIZES_REM = [0.78, 0.875, 0.95, 1.05, 1.1] as const
export const DEFAULT_LOG_FONT_INDEX = 1

const STORAGE_KEY = 'logcat.fontSizeIndex'

const isValidIndex = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value < LOG_FONT_SIZES_REM.length

function readStoredIndex(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    // `Number(null)` là 0 — một nấc hợp lệ — nên phải loại `null` TRƯỚC khi ép kiểu.
    if (raw === null) return DEFAULT_LOG_FONT_INDEX
    const stored = Number(raw)
    return isValidIndex(stored) ? stored : DEFAULT_LOG_FONT_INDEX
  } catch {
    return DEFAULT_LOG_FONT_INDEX
  }
}

/** Người nghe trong cùng tab — sự kiện `storage` của trình duyệt chỉ bắn sang tab KHÁC. */
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

/**
 * Cỡ chữ là sở thích thuần giao diện, không phải dữ liệu nghiệp vụ — không đi
 * qua ViewModel (`docs/architecture.md` §2), nhớ qua `localStorage` để lần mở
 * sau không phải chỉnh lại.
 *
 * `useSyncExternalStore` chứ không phải `useState(() => localStorage…)`: HTML
 * từ server không biết localStorage, nên cách sau vẽ nấc mặc định ở server và
 * nấc đã lưu ở máy khách → React báo lệch hydration ở nút A−/A+ (đã gặp).
 * `getServerSnapshot` trả mặc định cho cả server lẫn lượt hydrate, rồi React
 * tự vẽ lại theo nấc đã lưu. Đọc/ghi bọc `try` vì `localStorage` có thể ném ở
 * chế độ riêng tư — mất bộ nhớ thì về mặc định, không được làm hỏng màn hình.
 */
export function useLogFontSize(): [number, (index: number) => void] {
  const index = useSyncExternalStore(subscribe, readStoredIndex, () => DEFAULT_LOG_FONT_INDEX)

  const update = (next: number): void => {
    if (!isValidIndex(next)) return
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // Không nhớ được thì thôi — vẫn báo cho người nghe để cỡ chữ đổi trong phiên này.
    }
    listeners.forEach((listener) => listener())
  }

  return [index, update]
}

export interface LogViewControlsProps {
  fontIndex: number
  onFontIndexChange: (index: number) => void
  autoScroll: boolean
  onAutoScrollToggle: () => void
}

/** Ba nút chỉnh cách XEM khung log: nhỏ chữ, to chữ, bám đáy. */
export function LogViewControls({ fontIndex, onFontIndexChange, autoScroll, onAutoScrollToggle }: LogViewControlsProps) {
  return (
    <Stack direction="row" sx={{ gap: 0.5, alignItems: 'center' }}>
      <Tooltip title="Chữ nhỏ hơn">
        <span>
          <IconButton
            size="small"
            aria-label="Chữ nhỏ hơn"
            onClick={() => onFontIndexChange(fontIndex - 1)}
            disabled={fontIndex === 0}
          >
            <TextDecreaseIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Chữ to hơn">
        <span>
          <IconButton
            size="small"
            aria-label="Chữ to hơn"
            onClick={() => onFontIndexChange(fontIndex + 1)}
            disabled={fontIndex === LOG_FONT_SIZES_REM.length - 1}
          >
            <TextIncreaseIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={autoScroll ? 'Đang bám đáy — tắt để giữ vị trí cuộn' : 'Cuộn xuống đáy và bám theo'}>
        <IconButton
          size="small"
          aria-label="Bám đáy"
          aria-pressed={autoScroll}
          onClick={onAutoScrollToggle}
          sx={autoScroll ? { color: m3('primary'), backgroundColor: m3('primaryContainer') } : undefined}
        >
          <VerticalAlignBottomIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  )
}
