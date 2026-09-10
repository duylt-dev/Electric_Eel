'use client'

import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import DownloadIcon from '@mui/icons-material/Download'
import LayersClearIcon from '@mui/icons-material/LayersClear'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useCallback, useMemo, useState } from 'react'

import { countByLevel } from '@/domain/adb/entities/LogcatFilter'
import { LinkButton } from '@/ui/components/NavLink'
import { MetaChip } from '@/ui/components/MetaChip'
import { PageHeader } from '@/ui/components/PageHeader'
import { StatusChip } from '@/ui/components/StatusChip'
import { MONO_FONT_STACK, m3 } from '@/ui/theme/m3Tokens'
import { AdbLogcatViewModel } from './AdbLogcatViewModel'
import { isLive, visibleLines } from './AdbLogcatContract'
import type { AdbLogcatEffect, AdbLogcatState } from './AdbLogcatContract'
import { LogFilterBar } from './components/LogFilterBar'
import { LogView } from './components/LogView'

export interface AdbLogcatScreenProps {
  /** Tên hiển thị lấy từ danh bạ app, nếu package này là app của đội. */
  appName: string | null
}

/**
 * Màn xem log của một app.
 *
 * Không chứa logic nghiệp vụ: đọc state qua hook, bắn intent, xử lý Effect.
 * Nhìn file này chỉ trả lời được câu "trông nó thế nào" — đúng như mong đợi.
 */
export function AdbLogcatScreen({ appName }: AdbLogcatScreenProps) {
  const state = AdbLogcatViewModel.useState()
  const onIntent = AdbLogcatViewModel.useIntent()

  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(
    null,
  )

  AdbLogcatViewModel.useEffects(
    useCallback((effect: AdbLogcatEffect) => {
      switch (effect.type) {
        case 'ShowMessage':
          setToast({ message: effect.message, severity: effect.severity })
          return

        case 'DownloadLog': {
          const url = URL.createObjectURL(
            new Blob([effect.content], { type: 'text/plain;charset=utf-8' }),
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

  const shown = useMemo(() => visibleLines(state), [state])
  const counts = useMemo(() => countByLevel(state.lines), [state.lines])

  const live = isLive(state)

  return (
    <>
      <PageHeader
        eyebrow="Logcat"
        title={appName ?? state.packageName}
        subtitle={
          <Box component="span" sx={{ fontFamily: MONO_FONT_STACK, fontSize: '0.85rem' }}>
            {state.packageName} · {state.serial}
          </Box>
        }
        meta={
          <>
            <StatusBadge state={state} />
            {state.pid !== null && <MetaChip label="pid">{state.pid}</MetaChip>}
            {state.restarts > 0 && <MetaChip label="lần chạy lại">{state.restarts}</MetaChip>}
            {state.dropped > 0 && (
              <MetaChip label="dòng cũ đã bỏ">{state.dropped.toLocaleString('vi-VN')}</MetaChip>
            )}
          </>
        }
        actions={
          <LinkButton href="/logcat" variant="text" startIcon={<ArrowBackIcon />}>
            Đổi app
          </LinkButton>
        }
      />

      <Stack spacing={5}>
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

        <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          {live ? (
            <Button
              variant="outlined"
              startIcon={<StopIcon />}
              onClick={() => onIntent({ type: 'StreamStopped' })}
            >
              Dừng
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={() => onIntent({ type: 'StreamRequested', clearFirst: false })}
            >
              Đọc tiếp
            </Button>
          )}

          <Button
            variant="outlined"
            startIcon={state.paused ? <PlayArrowIcon /> : <PauseIcon />}
            onClick={() => onIntent({ type: 'PauseToggled' })}
            disabled={!live}
          >
            {state.paused
              ? `Tiếp tục${state.holding.length > 0 ? ` (${state.holding.length})` : ''}`
              : 'Tạm dừng'}
          </Button>

          <Tooltip title="Xoá những dòng đang xem. Log trên máy vẫn còn nguyên.">
            <span>
              <Button
                variant="text"
                startIcon={<LayersClearIcon />}
                onClick={() => onIntent({ type: 'ScreenCleared' })}
                disabled={state.lines.length === 0}
              >
                Xoá màn hình
              </Button>
            </span>
          </Tooltip>

          <Tooltip title="adb logcat -c — xoá đệm log trên chính thiết bị, rồi đọc lại từ đầu.">
            <span>
              <Button
                variant="text"
                startIcon={<DeleteSweepIcon />}
                onClick={() => onIntent({ type: 'DeviceBufferCleared' })}
              >
                Xoá đệm trên máy
              </Button>
            </span>
          </Tooltip>

          <Box sx={{ flex: 1 }} />

          <Tooltip title={state.autoScroll ? 'Đang bám đáy' : 'Cuộn xuống đáy và bám theo'}>
            <span>
              <Button
                variant={state.autoScroll ? 'outlined' : 'text'}
                startIcon={<VerticalAlignBottomIcon />}
                onClick={() => onIntent({ type: 'AutoScrollChanged', value: !state.autoScroll })}
              >
                Bám đáy
              </Button>
            </span>
          </Tooltip>

          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => onIntent({ type: 'DownloadRequested' })}
            disabled={shown.length === 0}
          >
            Tải .txt
          </Button>
        </Stack>

        <LogFilterBar
          filter={state.filter}
          counts={counts}
          shown={shown.length}
          total={state.lines.length}
          onToggleLevel={(level) => onIntent({ type: 'LevelToggled', level })}
          onTagChange={(value) => onIntent({ type: 'TagFilterChanged', value })}
          onQueryChange={(value) => onIntent({ type: 'QueryChanged', value })}
          onClear={() => onIntent({ type: 'FilterCleared' })}
        />

        <LogView
          lines={shown}
          autoScroll={state.autoScroll}
          frozen={state.paused}
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

function StatusBadge({ state }: { state: AdbLogcatState }) {
  switch (state.status) {
    case 'streaming':
      return (
        <StatusChip tone={state.paused ? 'warn' : 'ok'} dot>
          {state.paused ? 'đang tạm dừng' : 'đang chảy'}
        </StatusChip>
      )
    case 'connecting':
      return <StatusChip tone="info" dot>đang nối</StatusChip>
    case 'waiting':
      return <StatusChip tone="warn" dot>chờ app chạy</StatusChip>
    case 'failed':
      return <StatusChip tone="bad" dot>hỏng</StatusChip>
    default:
      return <StatusChip dot>đã dừng</StatusChip>
  }
}
