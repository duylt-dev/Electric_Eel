'use client'

import Stack from '@mui/material/Stack'
import { useCallback } from 'react'

import type { MirrorKey, MirrorTouchAction } from '@/domain/device-mirror/entities/MirrorControlMessage'
import { canControl } from '../DeviceMirrorContract'
import { DeviceMirrorViewModel } from '../DeviceMirrorViewModel'
import { MirrorControls } from './MirrorControls'
import { MirrorSurface } from './MirrorSurface'
import { TextInjector } from './TextInjector'

export interface MirrorStageProps {
  /** Ref callback của ô hiển thị — Root nối nó vào `sink.attach()`. */
  attachSurface: (container: HTMLDivElement | null) => void
}

/**
 * Phần "sân khấu" của ô mirror: hình máy + hàng nút + ô gõ chữ, nối thẳng vào
 * intent điều khiển. Tách khỏi `DeviceMirrorPanel` để vỏ (dãy nút trên cùng,
 * cảnh báo) và sân khấu (tám callback điều khiển) không trộn vào một file.
 *
 * Callback chạm giữ danh tính ổn định (`useCallback` trên `onIntent`) để
 * `useMirrorPointer` không gắn lại listener native mỗi lần State đổi — mà
 * State đổi ở mỗi khung `size`/`meta`.
 */
export function MirrorStage({ attachSurface }: MirrorStageProps) {
  const state = DeviceMirrorViewModel.useState()
  const onIntent = DeviceMirrorViewModel.useIntent()

  const controllable = canControl(state)

  const onTouch = useCallback(
    (action: MirrorTouchAction, pointer: number, nx: number, ny: number) =>
      onIntent({ type: 'TouchInput', action, pointer, nx, ny, pressure: 1 }),
    [onIntent],
  )
  const onScroll = useCallback(
    (nx: number, ny: number, dx: number, dy: number) => onIntent({ type: 'ScrollInput', nx, ny, dx, dy }),
    [onIntent],
  )
  const onKey = useCallback((key: MirrorKey) => onIntent({ type: 'KeyTapped', key }), [onIntent])

  return (
    <Stack spacing={2}>
      <MirrorControls
        controllable={controllable}
        streaming={state.status === 'streaming'}
        displayOn={state.displayOn}
        onKey={onKey}
        onRotate={() => onIntent({ type: 'RotateRequested' })}
        onDisplayPowerToggle={() => onIntent({ type: 'DisplayPowerToggled' })}
        onNotifications={() => onIntent({ type: 'NotificationsRequested' })}
        onSnapshot={() => onIntent({ type: 'SnapshotRequested' })}
      />

      <MirrorSurface
        attach={attachSurface}
        status={state.status}
        controllable={controllable}
        onTouch={onTouch}
        onScroll={onScroll}
        onKey={onKey}
      />

      <TextInjector
        disabled={!controllable}
        onSubmit={(text) => onIntent({ type: 'TextSubmitted', text })}
        onKey={onKey}
      />
    </Stack>
  )
}
