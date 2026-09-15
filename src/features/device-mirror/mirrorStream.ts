import type { IntentContext } from '@/core/mvi'
import type { MirrorStreamEvent } from '@/domain/device-mirror/entities/MirrorStreamEvent'
import type { MirrorRepository } from '@/domain/device-mirror/repositories/MirrorRepository'
import type { MirrorVideoSink } from '@/domain/device-mirror/repositories/MirrorVideoSink'
import { knownFrameSize } from './DeviceMirrorContract'
import type { DeviceMirrorEffect, DeviceMirrorState } from './DeviceMirrorContract'

/**
 * Một lượt mở luồng mirror — phần dài nhất của ViewModel, tách ra để
 * `DeviceMirrorViewModel.ts` chỉ còn bảng intent. Không có React ở đây, và
 * cũng không có `@yume-chan`: mọi thứ đi qua hai cổng `MirrorRepository` và
 * `MirrorVideoSink` trong `deps`.
 */
export interface DeviceMirrorDeps {
  mirror: MirrorRepository
  videoSink: MirrorVideoSink
  serial: string
}

type Context = IntentContext<DeviceMirrorState, DeviceMirrorEffect>

export async function stream(ctx: Context, deps: DeviceMirrorDeps): Promise<void> {
  const { controlEnabled } = ctx.getState()
  // `sessionId`/`frameSize` là của phiên cũ — xoá để MetaChip không hiện kích
  // cỡ lượt trước trong lúc "đang nối", và `canControl` không gửi lệnh vào
  // một phiên đã chết.
  ctx.setState((state) => ({ ...state, status: 'connecting', error: null, sessionId: null, frameSize: null }))

  // Decoder hỏng giữa phiên (M3, code review) là lý do DUY NHẤT luồng tự dừng
  // từ phía trình duyệt mà không qua intent: `push` một chiều, nên sink báo
  // qua `onError`, và ở đây huỷ luồng bằng một controller con của `ctx.signal`
  // — `outcome` sẽ là `cancelled`, không đè lên `failed` vừa đặt.
  const local = new AbortController()
  const signal = AbortSignal.any([ctx.signal, local.signal])
  const stopListening = deps.videoSink.onError((error) => {
    if (signal.aborted) return
    local.abort()
    ctx.setState((state) => ({ ...state, status: 'failed', error }))
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: error.message })
  })

  let outcome
  try {
    outcome = await deps.mirror.stream(
      // Chất lượng không đi qua đây: máy chủ cố định ở `MIRROR_QUALITY`.
      { serial: deps.serial, control: controlEnabled },
      (event) => handleEvent(event, ctx, deps, signal),
      signal,
    )
  } finally {
    stopListening()
  }

  if (ctx.signal.aborted) return

  if (!outcome.ok) {
    if (outcome.error.kind === 'cancelled') return
    ctx.setState((state) => ({ ...state, status: 'failed', error: outcome.error }))
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: outcome.error.message })
    return
  }

  // Luồng chỉ kết thúc bình thường khi máy chủ đóng nó (đóng tab, dọn phiên).
  ctx.setState((state) => ({ ...state, status: 'stopped' }))
}

function handleEvent(event: MirrorStreamEvent, ctx: Context, deps: DeviceMirrorDeps, signal: AbortSignal): void {
  // Luồng đã bị thay bằng luồng mới (hoặc decoder vừa hỏng): đừng vẽ tiếp.
  if (signal.aborted) return

  switch (event.type) {
    case 'meta':
      ctx.setState((state) => ({
        ...state,
        status: 'streaming',
        sessionId: event.sessionId,
        deviceName: event.deviceName,
        // `meta` luôn mang 0×0 (Tango chưa đọc SPS) — giữ `null` tới khi `size` tới.
        frameSize: knownFrameSize(event.width, event.height),
      }))
      return

    case 'video':
      // 60 lần/giây — KHÔNG setState ở đây, chỉ đẩy thẳng vào sink để vẽ.
      deps.videoSink.push(event.packet)
      return

    case 'size':
      // Máy xoay màn hình. Không đụng canvas — WebGL renderer tự resize
      // theo khung hình mới, ở đây chỉ cập nhật con số để UI đọc theo.
      ctx.setState((state) => ({ ...state, frameSize: knownFrameSize(event.width, event.height) }))
      return

    case 'failed':
      // Lỗi đã được adapter quy thành `Err` và sẽ tới trong `outcome` cuối
      // của `stream()`; ở đây không phải làm gì thêm.
      return
  }
}

