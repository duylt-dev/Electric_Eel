'use client'

import CloseIcon from '@mui/icons-material/Close'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import TouchAppIcon from '@mui/icons-material/TouchApp'
import StopIcon from '@mui/icons-material/Stop'
import Alert from '@mui/material/Alert'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import { m3 } from '@/ui/theme/m3Tokens'
import { isLive } from './DeviceMirrorContract'
import { DeviceMirrorViewModel } from './DeviceMirrorViewModel'
import { MirrorStatusChip } from './components/MirrorStatusChip'
import { MirrorStage } from './components/MirrorStage'
import { MirrorToast } from './components/MirrorToast'

export interface DeviceMirrorPanelProps {
  /** Ref callback của ô hiển thị — Root nối nó vào `sink.attach()`, canvas không đi qua State hay prop. */
  attachSurface: (container: HTMLDivElement | null) => void
  /**
   * Người dùng bấm đóng ô. Chủ ô (màn logcat) đáp lại bằng cách GỠ Root —
   * Provider dispose, luồng đứt, scrcpy-server trên máy dừng theo. Ô này không
   * tự ẩn mình: ẩn mà vẫn giữ luồng là một `app_process` chạy trên máy mà
   * không ai nhìn.
   */
  onClose: () => void
}

/**
 * Ô "Phản chiếu" nhúng cạnh màn logcat — lớp vỏ DUY NHẤT của mirror.
 *
 * Không `PageHeader` (trang đã có một cái, của logcat), không ô chọn chất
 * lượng (cố định mức cao nhất ở `MIRROR_QUALITY`), chỉ còn trạng thái,
 * Dừng/Chạy lại và nút đóng.
 *
 * Điều khiển (chạm/cuộn trên hình, hàng nút, ô gõ chữ) nằm trong
 * `<MirrorStage>`; ở đây chỉ thêm nút bật/tắt điều khiển vào dãy nút trên
 * cùng — mặc định bật, tắt khi chỉ muốn xem.
 */
export function DeviceMirrorPanel({ attachSurface, onClose }: DeviceMirrorPanelProps) {
  const state = DeviceMirrorViewModel.useState()
  const onIntent = DeviceMirrorViewModel.useIntent()

  const live = isLive(state)
  const canRetry = state.status === 'stopped' || state.status === 'failed'

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
        <Typography variant="subtitle2" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {state.deviceName ?? state.serial}
        </Typography>

        <MirrorStatusChip status={state.status} />

        <Tooltip
          title={
            state.controlEnabled
              ? 'Đang cho phép điều khiển. Tắt để chỉ xem — nối lại luồng, mất vài giây.'
              : 'Đang chỉ xem. Bật để chạm/gõ vào máy — nối lại luồng, mất vài giây.'
          }
        >
          <span>
            <IconButton
              size="small"
              aria-label="Cho phép điều khiển"
              aria-pressed={state.controlEnabled}
              disabled={state.status === 'connecting' || state.status === 'unsupported'}
              onClick={() => onIntent({ type: 'ControlToggled', enabled: !state.controlEnabled })}
              sx={state.controlEnabled ? { color: m3('primary'), backgroundColor: m3('primaryContainer') } : undefined}
            >
              <TouchAppIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        {live ? (
          <Tooltip title="Dừng luồng. scrcpy-server trên máy dừng theo; ô vẫn mở để chạy lại.">
            <IconButton size="small" aria-label="Dừng" onClick={() => onIntent({ type: 'StreamStopped' })}>
              <StopIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : canRetry ? (
          <Tooltip title="Chạy lại">
            <IconButton size="small" aria-label="Chạy lại" onClick={() => onIntent({ type: 'StreamRequested' })}>
              <PlayArrowIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}

        <Tooltip title="Đóng ô. Luồng dừng theo.">
          <IconButton size="small" aria-label="Đóng" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {state.status === 'failed' && state.error !== null && (
        <Alert severity="error">{state.error.message}</Alert>
      )}

      {state.status === 'unsupported' && (
        <Alert severity="warning">
          Trình duyệt này không giải mã được H.264 qua WebCodecs. Dùng Chrome hoặc Edge bản 94 trở lên.
        </Alert>
      )}

      <MirrorStage attachSurface={attachSurface} />

      <MirrorToast />
    </Stack>
  )
}
