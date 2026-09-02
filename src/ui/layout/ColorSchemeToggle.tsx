'use client'

import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { useColorScheme } from '@mui/material/styles'

const ORDER = ['system', 'light', 'dark'] as const
const LABEL = { system: 'Theo hệ thống', light: 'Sáng', dark: 'Tối' } as const

export function ColorSchemeToggle() {
  const { mode, setMode } = useColorScheme()

  // `mode` là undefined cho tới khi component gắn xong ở phía trình duyệt —
  // chế độ màu chỉ đọc được ở đó. Dùng chính điều này thay vì tự nuôi một cờ
  // "đã gắn xong": vẽ biểu tượng khác nhau giữa hai lần vẽ sẽ làm React báo
  // lệch hydration.
  const current = mode ?? 'system'
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? 'system'

  const Icon = current === 'light' ? LightModeIcon : current === 'dark' ? DarkModeIcon : SettingsBrightnessIcon

  return (
    <Tooltip title={`Giao diện: ${LABEL[current]}`}>
      <IconButton
        onClick={() => setMode(next)}
        size="small"
        aria-label={`Đổi giao diện, đang là ${LABEL[current]}`}
      >
        <Icon fontSize="small" />
      </IconButton>
    </Tooltip>
  )
}
