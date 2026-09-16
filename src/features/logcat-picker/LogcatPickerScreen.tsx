'use client'

import RefreshIcon from '@mui/icons-material/Refresh'
import UsbIcon from '@mui/icons-material/Usb'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import LinearProgress from '@mui/material/LinearProgress'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

import type { AdbAccess } from '@/domain/adb/entities/AdbAccess'
import { SectionHeading } from '@/ui/components/SectionHeading'
import { m3 } from '@/ui/theme/m3Tokens'
import { LogcatPickerViewModel } from './LogcatPickerViewModel'
import { selectedDevice, usableDevices } from './LogcatPickerContract'
import type { LogcatPickerEffect } from './LogcatPickerContract'
import { DeviceList } from '@/features/adb-common/components/DeviceList'
import { AppList } from './components/AppList'

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
  /**
   * Đường tới thiết bị. `webusb` thì khối thiết bị có thêm nút "Kết nối thiết
   * bị": WebUSB chỉ cho trang thấy máy mà người dùng đã chọn trong hộp thoại
   * của trình duyệt — không có cách nào tự hiện như khi adb ở máy chủ.
   */
  access: AdbAccess
}

/**
 * Màn chọn thiết bị và app.
 *
 * Khối thiết bị không có tiêu đề lẫn nút quét: máy cắm vào là tự hiện, rút ra
 * là tự biến — luồng theo dõi mở từ lúc vào màn. Thứ duy nhất phải bấm ở khối
 * đó là chọn máy khi có từ hai máy trở lên.
 *
 * Không chứa logic nghiệp vụ: đọc state qua hook, bắn intent, xử lý Effect.
 * Điều hướng sang màn log đi qua Effect chứ không gọi thẳng router từ chỗ xử
 * lý cú bấm — nhờ vậy quy tắc "phải chọn máy trước, phải có package name" nằm
 * trong ViewModel và kiểm thử được mà không cần vẽ gì.
 */
export function LogcatPickerScreen({ directory, access }: LogcatPickerScreenProps) {
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
      <Stack spacing={7}>
        <Box>
          {access === 'webusb' && (
            <Stack direction="row" sx={{ gap: 3, alignItems: 'center', mb: 3, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<UsbIcon fontSize="small" />}
                onClick={() => onIntent({ type: 'DeviceConnectRequested' })}
              >
                Kết nối thiết bị
              </Button>
              <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
                Chrome/Edge nói chuyện thẳng với máy qua USB. Nếu Android Studio đang mở, chạy{' '}
                <code>adb kill-server</code> trước — cổng USB chỉ một chương trình giữ được.
              </Typography>
            </Stack>
          )}

          {state.status === 'failed' && state.error !== null && (
            <Alert
              severity="error"
              sx={{ mb: 3 }}
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => onIntent({ type: 'DevicesRefreshRequested' })}
                >
                  Thử lại
                </Button>
              }
            >
              {state.error.message}
            </Alert>
          )}

          {state.status === 'loading' && state.devices.length === 0 ? (
            <Stack direction="row" sx={{ gap: 3, alignItems: 'center', py: 4 }}>
              <CircularProgress size={18} />
              <Typography variant="body2" sx={{ color: m3('onSurfaceVariant') }}>
                {access === 'webusb' ? 'Đang dò thiết bị đã cho phép…' : 'Đang hỏi adb…'}
              </Typography>
            </Stack>
          ) : state.devices.length === 0 ? (
            <Alert severity="info">
              {access === 'webusb' ? (
                <>
                  Chưa có máy nào. Cắm cáp, bật <b>Gỡ lỗi USB</b>, rồi bấm <b>Kết nối thiết bị</b> và
                  chọn máy trong hộp thoại của trình duyệt. Lần đầu điện thoại sẽ hỏi cho phép thêm
                  một lần — khoá của trình duyệt khác khoá của Android Studio.
                </>
              ) : (
                <>
                  Chưa thấy máy nào. Cắm cáp và bật <b>Gỡ lỗi USB</b> — máy sẽ tự hiện ở đây, không
                  cần tải lại trang. adb chạy trên máy chủ đang phục vụ trang này: nếu trang không
                  chạy trên máy của bạn thì máy cắm vào bàn bạn sẽ không hiện ra.
                </>
              )}
            </Alert>
          ) : (
            <DeviceList
              devices={state.devices}
              selectedSerial={state.selectedSerial}
              onSelect={(serial) => onIntent({ type: 'DeviceSelected', serial })}
            />
          )}
        </Box>

        <Box>
          <SectionHeading
            title="App trên máy"
            hint="Chỉ app cài thêm. Bấm vào một app để mở màn log của riêng nó — app của đội hiện tên, app khác hiện package name."
            actions={
              <Button
                size="small"
                variant="text"
                startIcon={<RefreshIcon fontSize="small" />}
                onClick={() => onIntent({ type: 'PackagesRefreshRequested' })}
                disabled={device === null || state.packagesStatus === 'loading'}
              >
                Làm mới
              </Button>
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
              deviceLabels={state.deviceLabels}
              labelsStatus={state.labelsStatus}
              labelsMessage={state.labelsMessage}
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
