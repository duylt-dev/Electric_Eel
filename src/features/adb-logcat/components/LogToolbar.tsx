'use client'

import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import LayersClearIcon from '@mui/icons-material/LayersClear'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import Badge from '@mui/material/Badge'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'

import { m3 } from '@/ui/theme/m3Tokens'

export interface LogToolbarProps {
  live: boolean
  paused: boolean
  /** Số dòng đang chờ hiện ra trong lúc tạm dừng — hiện thành số nhỏ trên nút "Tiếp tục". */
  holding: number
  /** Đệm có dòng nào không — "Xoá màn hình" vô nghĩa khi đệm rỗng. */
  hasLines: boolean
  onStart: () => void
  onStop: () => void
  onPauseToggle: () => void
  onScreenClear: () => void
  onDeviceBufferClear: () => void
}

/**
 * Bốn nút điều khiển luồng log, dạng icon có tooltip.
 *
 * Icon thay vì chữ là cố ý: dãy này đứng CÙNG HÀNG với bộ lọc (mức, tag, tìm)
 * để khung log lấy được gần hết chiều cao trang. Chữ "Xoá đệm trên máy" dài
 * gấp bốn lần icon của nó, và bốn cái nút ấy ai cũng chỉ học một lần.
 *
 * Chỉ vẽ và gọi callback — không biết ViewModel.
 */
export function LogToolbar({
  live,
  paused,
  holding,
  hasLines,
  onStart,
  onStop,
  onPauseToggle,
  onScreenClear,
  onDeviceBufferClear,
}: LogToolbarProps) {
  return (
    <Stack direction="row" sx={{ gap: 0.5, alignItems: 'center' }}>
      {live ? (
        <Tooltip title="Dừng đọc log">
          <IconButton size="small" aria-label="Dừng" onClick={onStop}>
            <StopIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : (
        <Tooltip title="Đọc tiếp">
          <IconButton
            size="small"
            aria-label="Đọc tiếp"
            onClick={onStart}
            sx={{ color: m3('onPrimary'), backgroundColor: m3('primary'), '&:hover': { backgroundColor: m3('primary') } }}
          >
            <PlayArrowIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      <Tooltip title={paused ? 'Tiếp tục — hiện những dòng đang chờ' : 'Tạm dừng màn hình. Log vẫn được nhận và giữ lại.'}>
        <span>
          <IconButton
            size="small"
            aria-label={paused ? 'Tiếp tục' : 'Tạm dừng'}
            aria-pressed={paused}
            onClick={onPauseToggle}
            disabled={!live}
            sx={paused ? { color: m3('primary'), backgroundColor: m3('primaryContainer') } : undefined}
          >
            <Badge badgeContent={paused ? holding : 0} max={999} color="primary">
              {paused ? <PlayArrowIcon fontSize="small" /> : <PauseIcon fontSize="small" />}
            </Badge>
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title="Xoá những dòng đang xem. Log trên máy vẫn còn nguyên.">
        <span>
          <IconButton size="small" aria-label="Xoá màn hình" onClick={onScreenClear} disabled={!hasLines}>
            <LayersClearIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title="adb logcat -c — xoá đệm log trên chính thiết bị, rồi đọc lại từ đầu.">
        <IconButton size="small" aria-label="Xoá đệm trên máy" onClick={onDeviceBufferClear}>
          <DeleteSweepIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  )
}
