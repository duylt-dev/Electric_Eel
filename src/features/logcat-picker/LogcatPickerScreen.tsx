'use client'

import RefreshIcon from '@mui/icons-material/Refresh'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import LinearProgress from '@mui/material/LinearProgress'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

import { MetaChip } from '@/ui/components/MetaChip'
import { PageHeader } from '@/ui/components/PageHeader'
import { SectionHeading } from '@/ui/components/SectionHeading'
import { m3 } from '@/ui/theme/m3Tokens'
import { LogcatPickerViewModel } from './LogcatPickerViewModel'
import { selectedDevice, usableDevices } from './LogcatPickerContract'
import type { LogcatPickerEffect } from './LogcatPickerContract'
import { AppList } from './components/AppList'
import { DeviceList } from './components/DeviceList'

/** Một app trong danh bạ của tool. Chỉ ba trường màn này cần. */
export interface DirectoryApp {
  slug: string
  displayName: string
  packageName: string | null
}

export interface LogcatPickerScreenProps {
  /**
   * Danh bạ app của tool.
   *
   * Dùng vào hai việc: đặt tên cho package đọc được từ máy, và liệt kê những
   * app của đội chưa ai điền applicationId — thứ mà máy không bao giờ nói cho
   * biết, vì với máy chúng đơn giản là không tồn tại.
   */
  directory: readonly DirectoryApp[]
}

/**
 * Màn chọn thiết bị và app.
 *
 * Không chứa logic nghiệp vụ: đọc state qua hook, bắn intent, xử lý Effect.
 * Điều hướng sang màn log đi qua Effect chứ không gọi thẳng router từ chỗ xử
 * lý cú bấm — nhờ vậy quy tắc "phải chọn máy trước, phải có package name" nằm
 * trong ViewModel và kiểm thử được mà không cần vẽ gì.
 */
export function LogcatPickerScreen({ directory }: LogcatPickerScreenProps) {
  const state = LogcatPickerViewModel.useState()
  const onIntent = LogcatPickerViewModel.useIntent()
  const router = useRouter()

  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(
    null,
  )

  LogcatPickerViewModel.useEffects(
    useCallback(
      (effect: LogcatPickerEffect) => {
        switch (effect.type) {
          case 'ShowMessage':
            setToast({ message: effect.message, severity: effect.severity })
            return

          case 'OpenLogcat': {
            const query = new URLSearchParams({ serial: effect.serial })
            router.push(`/logcat/${encodeURIComponent(effect.packageName)}?${query.toString()}`)
            return
          }
        }
      },
      [router],
    ),
  )

  const labels = useMemo(() => {
    const map = new Map<string, string>()
    for (const app of directory) {
      if (app.packageName !== null) map.set(app.packageName, app.displayName)
    }
    return map
  }, [directory])

  const unlinked = useMemo(
    () => directory.filter((app) => app.packageName === null).map(({ slug, displayName }) => ({ slug, displayName })),
    [directory],
  )

  const device = selectedDevice(state)
  const usable = usableDevices(state)

  return (
    <>
      <PageHeader
        eyebrow="Logcat"
        title="Chọn máy và app"
        subtitle="Chọn thiết bị đang cắm, rồi chọn app cần xem log. Màn tiếp theo chỉ hiện log của đúng tiến trình app đó."
        meta={
          <>
            <MetaChip label="thiết bị">{usable.length}</MetaChip>
            {state.packagesStatus === 'ready' && (
              <MetaChip label="app trên máy">{state.packageNames.length}</MetaChip>
            )}
          </>
        }
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

        <Box>
          <SectionHeading
            title="Thiết bị"
            hint="adb chạy trên máy chủ đang phục vụ trang này. Máy nào cắm vào đó thì hiện ở đây."
          />

          {state.status === 'loading' && state.devices.length === 0 ? (
            <Stack direction="row" sx={{ gap: 3, alignItems: 'center', py: 4 }}>
              <CircularProgress size={18} />
              <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
                Đang hỏi adb…
              </Typography>
            </Stack>
          ) : state.devices.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              adb không thấy máy nào. Cắm cáp và bật <b>Gỡ lỗi USB</b>, hoặc nối qua mạng bằng ô bên
              dưới. Nhớ rằng adb chạy trên máy chủ đang phục vụ trang này — nếu trang không chạy trên
              máy của bạn thì máy cắm vào bàn bạn sẽ không hiện ra ở đây.
            </Alert>
          ) : (
            <DeviceList
              devices={state.devices}
              selectedSerial={state.selectedSerial}
              onSelect={(serial) => onIntent({ type: 'DeviceSelected', serial })}
              onDisconnect={(serial) => onIntent({ type: 'DisconnectRequested', serial })}
            />
          )}

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            component="form"
            onSubmit={(event) => {
              event.preventDefault()
              onIntent({ type: 'ConnectRequested' })
            }}
            sx={{ gap: 3, alignItems: { sm: 'center' }, mt: 4 }}
          >
            <TextField
              size="small"
              value={state.connectAddress}
              onChange={(event) => onIntent({ type: 'ConnectAddressChanged', value: event.target.value })}
              placeholder="192.168.1.20:5555"
              sx={{ maxWidth: 280, width: '100%' }}
              slotProps={{ htmlInput: { 'aria-label': 'Địa chỉ thiết bị nối qua mạng' } }}
            />
            <Button type="submit" variant="text" disabled={state.connecting}>
              {state.connecting ? 'Đang nối…' : 'Nối qua mạng'}
            </Button>
            <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
              Máy phải bật sẵn <code>adb tcpip 5555</code> và cùng mạng với máy chủ.
            </Typography>
          </Stack>
        </Box>

        <Box>
          <SectionHeading
            title="App trên máy"
            hint="Bấm vào một app để mở màn log của riêng nó. App của đội hiện tên; app khác hiện package name."
            actions={
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={state.includeSystem}
                      onChange={(event) =>
                        onIntent({ type: 'SystemAppsToggled', value: event.target.checked })
                      }
                    />
                  }
                  label={
                    <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
                      kể cả app hệ thống
                    </Typography>
                  }
                />
                <Button
                  size="small"
                  variant="text"
                  startIcon={<RefreshIcon fontSize="small" />}
                  onClick={() => onIntent({ type: 'PackagesRefreshRequested' })}
                  disabled={device === null || state.packagesStatus === 'loading'}
                >
                  Làm mới
                </Button>
              </Stack>
            }
          />

          {state.packagesStatus === 'loading' && <LinearProgress sx={{ mb: 3 }} />}

          {device === null ? (
            <Typography variant="body2" sx={{ color: m3('onSurfaceVariant'), py: 4 }}>
              {usable.length > 1
                ? 'Có nhiều máy đang nối. Chọn một máy ở trên để xem app của nó.'
                : 'Chọn một thiết bị ở trên trước đã.'}
            </Typography>
          ) : (
            <AppList
              packageNames={state.packageNames}
              labels={labels}
              unlinked={unlinked}
              onOpen={(packageName, label) => onIntent({ type: 'AppOpened', packageName, label })}
            />
          )}
        </Box>
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
