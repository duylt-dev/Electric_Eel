'use client'

import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import SmartphoneIcon from '@mui/icons-material/Smartphone'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useCallback, useMemo, useState } from 'react'

import { countByLevel } from '@/domain/adb/entities/LogcatFilter'
import { DeviceMirrorRoot } from '@/features/device-mirror/DeviceMirrorRoot'
import { LinkIconButton } from '@/ui/components/NavLink'
import { PageHeader } from '@/ui/components/PageHeader'
import { m3 } from '@/ui/theme/m3Tokens'
import { AdbLogcatViewModel } from './AdbLogcatViewModel'
import { isLive, visibleLines } from './AdbLogcatContract'
import type { AdbLogcatEffect } from './AdbLogcatContract'
import { LogFilterBar } from './components/LogFilterBar'
import { LogToolbar } from './components/LogToolbar'
import { LogView } from './components/LogView'
import { LOG_FONT_SIZES_REM, LogViewControls, useLogFontSize } from './components/LogViewControls'

export interface AdbLogcatScreenProps {
  /**
   * Máy chủ mở được luồng mirror (ADB bật + có scrcpy-server). Trang tính sẵn
   * ở phía server để không hiện một nút chắc chắn hỏng; thiếu gì thì
   * `readMirrorSettings` nói rõ trong log máy chủ.
   */
  mirrorAvailable: boolean
}

/**
 * Bề ngang ô mirror khi đứng cạnh log. Một màn điện thoại dọc thu về cỡ này
 * vẫn đọc được chữ trên máy; rộng hơn thì khung log không còn đủ chỗ cho một
 * dòng logcat bình thường (~90 ký tự mono) ở màn 1440.
 */
const MIRROR_PANEL_WIDTH = 340

/**
 * Màn xem log của một app.
 *
 * Không chứa logic nghiệp vụ: đọc state qua hook, bắn intent, thu Effect
 * (chỉ còn `ShowMessage` — nút tải .txt đã bỏ vì nó làm hàng nút nhảy chỗ
 * mỗi khi ô mirror mở, và không ai dùng).
 * Nhìn file này chỉ trả lời được câu "trông nó thế nào" — đúng như mong đợi.
 *
 * Ô "Phản chiếu" là `DeviceMirrorRoot` của chính máy đang xem log, gắn vào
 * cột phải — một ViewModel thứ hai, độc lập, sống cùng vòng đời với ô. Việc
 * "ô đang mở hay đóng" là trạng thái thuần giao diện (như hộp thoại đang mở)
 * nên nằm ở `useState` cục bộ, không đi qua `AdbLogcatState`: ViewModel log
 * không cần biết gì về mirror. Mặc định ĐÓNG — mở là một `app_process` chạy
 * trên máy, không phải thứ tự động bật mỗi lần ai đó xem log.
 */
export function AdbLogcatScreen({ mirrorAvailable }: AdbLogcatScreenProps) {
  const state = AdbLogcatViewModel.useState()
  const onIntent = AdbLogcatViewModel.useIntent()

  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(
    null,
  )
  const [mirrorOpen, setMirrorOpen] = useState(false)
  const closeMirror = useCallback(() => setMirrorOpen(false), [])

  AdbLogcatViewModel.useEffects(
    useCallback((effect: AdbLogcatEffect) => {
      setToast({ message: effect.message, severity: effect.severity })
    }, []),
  )

  const [fontIndex, setFontIndex] = useLogFontSize()

  // Phụ thuộc vào đúng hai thứ bộ lọc đọc, không phải cả `state`: mỗi lô log
  // thay `state` một lần, nhưng bấm tạm dừng hay đổi bám đáy thì không được
  // lọc lại 5000 dòng.
  const shown = useMemo(() => visibleLines(state.lines, state.filter), [state.lines, state.filter])
  const counts = useMemo(() => countByLevel(state.lines), [state.lines])

  const live = isLive(state)

  return (
    <>
      <PageHeader>
        {mirrorAvailable && (
          <Tooltip
            title={
              mirrorOpen
                ? 'Đóng ô phản chiếu. Luồng scrcpy dừng theo.'
                : 'Phản chiếu màn hình của chính máy này ngay cạnh log, ở độ nét cao nhất. Tab khác đang phản chiếu cùng máy sẽ bị ngắt — một máy chỉ chảy về một nơi.'
            }
          >
            <IconButton
              size="small"
              color={mirrorOpen ? 'primary' : 'default'}
              aria-label={mirrorOpen ? 'Đóng phản chiếu' : 'Phản chiếu màn hình'}
              onClick={() => setMirrorOpen((open) => !open)}
            >
              <SmartphoneIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Đổi máy hoặc app">
          <LinkIconButton size="small" href="/logcat" aria-label="Đổi máy hoặc app">
            <ArrowBackIcon fontSize="small" />
          </LinkIconButton>
        </Tooltip>
      </PageHeader>

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={4} sx={{ alignItems: 'flex-start' }}>
        {/* `minWidth: 0` — không có nó, một dòng log dài kéo cột này rộng ra
            và đẩy ô mirror rơi xuống dưới thay vì để `LogView` tự cuộn ngang. */}
        <Stack spacing={3} sx={{ flex: 1, minWidth: 0, width: '100%' }}>
          {state.error !== null && state.status === 'failed' && (
            <Alert severity="error" action={<Button onClick={() => onIntent({ type: 'StreamRequested', clearFirst: false })}>Thử lại</Button>}>
              {state.error.message}
            </Alert>
          )}

          {state.status === 'waiting' && (
            <Alert severity="info">
              {state.pid === null && state.restarts === 0
                ? `Chưa thấy tiến trình nào của ${state.packageName}. Mở app trên máy — log sẽ tự chảy về ngay từ dòng đầu tiên.`
                : 'App vừa thoát. Đang chờ nó khởi động lại để bám tiếp — không cần bấm gì.'}
            </Alert>
          )}

          {/* MỘT hàng cho mọi nút và bộ lọc: nút luồng · mức · tag · tìm ·
              cỡ chữ · bám đáy. Gói `flexWrap` để màn hẹp vẫn dùng
              được, còn trên màn thường thì khung log bắt đầu ngay dưới. */}
          <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <LogToolbar
              live={live}
              paused={state.paused}
              holding={state.holding.length}
              hasLines={state.lines.length > 0}
              onStart={() => onIntent({ type: 'StreamRequested', clearFirst: false })}
              onStop={() => onIntent({ type: 'StreamStopped' })}
              onPauseToggle={() => onIntent({ type: 'PauseToggled' })}
              onScreenClear={() => onIntent({ type: 'ScreenCleared' })}
              onDeviceBufferClear={() => onIntent({ type: 'DeviceBufferCleared' })}
            />

            <LogFilterBar
              filter={state.filter}
              counts={counts}
              onToggleLevel={(level) => onIntent({ type: 'LevelToggled', level })}
              onTagChange={(value) => onIntent({ type: 'TagFilterChanged', value })}
              onQueryChange={(value) => onIntent({ type: 'QueryChanged', value })}
            />

            <LogViewControls
              fontIndex={fontIndex}
              onFontIndexChange={setFontIndex}
              autoScroll={state.autoScroll}
              onAutoScrollToggle={() => onIntent({ type: 'AutoScrollChanged', value: !state.autoScroll })}
            />
          </Stack>

          <LogView
            lines={shown}
            searchQuery={state.filter.query}
            autoScroll={state.autoScroll}
            frozen={state.paused}
            fontSizeRem={LOG_FONT_SIZES_REM[fontIndex] ?? LOG_FONT_SIZES_REM[1]}
            onAutoScrollChange={(value) => onIntent({ type: 'AutoScrollChanged', value })}
            emptyHint={
              state.lines.length === 0
                ? 'Chưa có dòng log nào.'
                : 'Không dòng nào khớp bộ lọc hiện tại.'
            }
          />

          {state.paused && (
            <Typography variant="caption" sx={{ color: m3('onSurfaceVariant') }}>
              Đang tạm dừng. Log vẫn được nhận và giữ lại — {state.holding.length.toLocaleString('vi-VN')}{' '}
              dòng đang chờ hiện ra.
            </Typography>
          )}
        </Stack>

        {mirrorOpen && (
          <Box sx={{ width: { xs: '100%', lg: MIRROR_PANEL_WIDTH }, flexShrink: 0 }}>
            {/* `key` theo serial: trang đã `key` Root của log theo `serial:package`
                nên đổi máy là dựng lại cả màn, nhưng ghi rõ ở đây để không ai
                tưởng ô mirror tự đổi máy được khi `serial` đổi. */}
            <DeviceMirrorRoot key={state.serial} serial={state.serial} onClose={closeMirror} />
          </Box>
        )}
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

