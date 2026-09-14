'use client'

import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import RefreshIcon from '@mui/icons-material/Refresh'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

import { DeviceList } from '@/features/adb-common/components/DeviceList'
import { MetaChip } from '@/ui/components/MetaChip'
import { PageHeader } from '@/ui/components/PageHeader'
import { m3 } from '@/ui/theme/m3Tokens'
import { MirrorPickerViewModel } from './MirrorPickerViewModel'
import { usableDevices } from './MirrorPickerContract'
import type { MirrorPickerEffect } from './MirrorPickerContract'

/**
 * Màn chọn thiết bị để mở Màn hình máy.
 *
 * Không chứa logic nghiệp vụ: đọc state qua hook, bắn intent. Điều hướng sang
 * `/mirror/<serial>` đi qua Effect `OpenMirror`, đúng mẫu `OpenLogcat` của
 * `LogcatPickerScreen` — quy tắc "phải chọn máy trước" nằm trong ViewModel và
 * kiểm thử được mà không cần vẽ gì.
 */
export function MirrorPickerScreen() {
  const state = MirrorPickerViewModel.useState()
  const onIntent = MirrorPickerViewModel.useIntent()
  const router = useRouter()

  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(
    null,
  )

  MirrorPickerViewModel.useEffects(
    useCallback(
      (effect: MirrorPickerEffect) => {
        switch (effect.type) {
          case 'ShowMessage':
            setToast({ message: effect.message, severity: effect.severity })
            return

          case 'OpenMirror':
            router.push(`/mirror/${encodeURIComponent(effect.serial)}`)
            return
        }
      },
      [router],
    ),
  )

  const usable = usableDevices(state)

  return (
    <>
      <PageHeader
        eyebrow="Màn hình máy"
        title="Chọn máy"
        subtitle="Chọn thiết bị đang cắm để xem và điều khiển màn hình của nó ngay trong trình duyệt."
        meta={<MetaChip label="thiết bị">{usable.length}</MetaChip>}
        actions={
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => onIntent({ type: 'DevicesRefreshRequested' })}
            disabled={state.status === 'loading'}
          >
            Làm mới
          </Button>
        }
      />

      <Stack spacing={7}>
        {state.error !== null && state.status === 'failed' && (
          <Alert severity="error">{state.error.message}</Alert>
        )}

        {state.status === 'loading' && state.devices.length === 0 ? (
          <Stack direction="row" sx={{ gap: 3, alignItems: 'center', py: 4 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
              Đang hỏi adb…
            </Typography>
          </Stack>
        ) : state.devices.length === 0 ? (
          <Alert severity="info">
            adb không thấy máy nào. Cắm cáp và bật <b>Gỡ lỗi USB</b>. adb chạy trên máy chủ đang phục
            vụ trang này — máy cắm vào bàn bạn sẽ không hiện ra nếu trang không chạy trên máy của bạn.
          </Alert>
        ) : (
          <DeviceList
            devices={state.devices}
            selectedSerial={state.selectedSerial}
            onSelect={(serial) => onIntent({ type: 'DeviceSelected', serial })}
          />
        )}

        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={() => onIntent({ type: 'MirrorOpened' })}
          disabled={state.selectedSerial === null}
          sx={{ alignSelf: 'flex-start' }}
        >
          Mở màn hình
        </Button>
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
