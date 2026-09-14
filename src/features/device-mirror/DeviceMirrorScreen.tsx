'use client'

import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import { useCallback, useState } from 'react'

import { MetaChip } from '@/ui/components/MetaChip'
import { PageHeader } from '@/ui/components/PageHeader'
import { StatusChip } from '@/ui/components/StatusChip'
import type { StatusTone } from '@/ui/components/StatusChip'
import { isLive, qualityLabel } from './DeviceMirrorContract'
import type { DeviceMirrorEffect, MirrorStatus } from './DeviceMirrorContract'
import { DeviceMirrorViewModel } from './DeviceMirrorViewModel'
import { MirrorSurface } from './components/MirrorSurface'
import { QualityBar } from './components/QualityBar'

export interface DeviceMirrorScreenProps {
  /** Ref callback của ô hiển thị — Root nối nó vào `sink.attach()`, canvas không đi qua State hay prop. */
  attachSurface: (container: HTMLDivElement | null) => void
}

const STATUS_TONE: Record<MirrorStatus, StatusTone> = {
  streaming: 'ok',
  connecting: 'info',
  failed: 'bad',
  stopped: 'neutral',
  unsupported: 'bad',
}

const STATUS_LABEL: Record<MirrorStatus, string> = {
  streaming: 'đang chảy',
  connecting: 'đang nối',
  failed: 'hỏng',
  stopped: 'đã dừng',
  unsupported: 'không hỗ trợ',
}

/**
 * Màn mirror một thiết bị.
 *
 * Không chứa logic nghiệp vụ: đọc state qua hook, bắn intent, xử lý Effect.
 * Canvas là tài sản của sink — màn này chỉ đưa ô chứa cho sink qua `attachSurface`.
 */
export function DeviceMirrorScreen({ attachSurface }: DeviceMirrorScreenProps) {
  const state = DeviceMirrorViewModel.useState()
  const onIntent = DeviceMirrorViewModel.useIntent()

  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(
    null,
  )

  DeviceMirrorViewModel.useEffects(
    useCallback((effect: DeviceMirrorEffect) => {
      switch (effect.type) {
        case 'ShowMessage':
          setToast({ message: effect.message, severity: effect.severity })
          return

        case 'DownloadFile': {
          // Sao vào một `Uint8Array<ArrayBuffer>` MỚI: `effect.bytes` khai kiểu
          // rộng `Uint8Array<ArrayBufferLike>` (có thể là `SharedArrayBuffer`
          // theo lib mới của TS), còn `Blob` chỉ nhận `ArrayBufferView<ArrayBuffer>`.
          const url = URL.createObjectURL(
            new Blob([new Uint8Array(effect.bytes)], { type: effect.mimeType }),
          )
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = effect.fileName
          document.body.append(anchor)
          anchor.click()
          anchor.remove()
          // Thu hồi ở lượt sau: thu hồi ngay thì có trình duyệt huỷ luôn lượt
          // tải vừa bắt đầu.
          setTimeout(() => URL.revokeObjectURL(url), 0)
          return
        }
      }
    }, []),
  )

  const live = isLive(state)
  const canRetry = state.status === 'stopped' || state.status === 'failed'
  // Đang nối thì đợi; không hỗ trợ thì đổi gì cũng vô nghĩa — đổi tham số lúc
  // đã dừng vẫn được (chỉ ghi nhớ, "Chạy lại" sẽ dùng).
  const controlsLocked = state.status === 'connecting' || state.status === 'unsupported'

  return (
    <>
      <PageHeader
        eyebrow="Màn hình máy"
        title={state.deviceName ?? state.serial}
        subtitle={state.deviceName === null ? undefined : state.serial}
        meta={
          <>
            <StatusChip tone={STATUS_TONE[state.status]} dot>
              {STATUS_LABEL[state.status]}
            </StatusChip>
            {state.frameSize !== null && (
              <MetaChip label="kích cỡ">
                {state.frameSize.width}×{state.frameSize.height}
              </MetaChip>
            )}
            <MetaChip label="chất lượng">{qualityLabel(state.quality)}</MetaChip>
          </>
        }
        actions={
          live ? (
            <Button
              variant="outlined"
              startIcon={<StopIcon />}
              onClick={() => onIntent({ type: 'StreamStopped' })}
            >
              Dừng
            </Button>
          ) : canRetry ? (
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={() => onIntent({ type: 'StreamRequested' })}
            >
              Chạy lại
            </Button>
          ) : undefined
        }
      />

      <Stack spacing={5}>
        {state.status === 'failed' && state.error !== null && (
          <Alert severity="error">{state.error.message}</Alert>
        )}

        {state.status === 'unsupported' && (
          <Alert severity="warning">
            Trình duyệt này không giải mã được luồng H.264 qua WebCodecs. Mở lại trang bằng Chrome
            hoặc Edge bản 94 trở lên.
          </Alert>
        )}

        <FormControl disabled={controlsLocked}>
          <FormControlLabel
            control={
              <Switch
                checked={state.controlEnabled}
                onChange={(event) => onIntent({ type: 'ControlToggled', enabled: event.target.checked })}
              />
            }
            label="Cho phép điều khiển"
          />
          <FormHelperText>
            {live ? 'Đổi sẽ nối lại luồng — mất vài giây.' : 'Áp dụng ở lần chạy tới.'}
          </FormHelperText>
        </FormControl>

        <QualityBar
          quality={state.quality}
          disabled={controlsLocked}
          onChange={(quality) => onIntent({ type: 'QualityChanged', quality })}
        />

        <MirrorSurface attach={attachSurface} live={live} status={state.status} />
      </Stack>

      <Snackbar
        open={toast !== null}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast?.severity ?? 'info'}
          onClose={() => setToast(null)}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {toast?.message}
        </Alert>
      </Snackbar>
    </>
  )
}
