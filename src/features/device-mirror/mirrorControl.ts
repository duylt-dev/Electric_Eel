import type { IntentContext } from '@/core/mvi'
import type { MirrorControlMessage, MirrorKey } from '@/domain/device-mirror/entities/MirrorControlMessage'
import { canControl, snapshotFileName } from './DeviceMirrorContract'
import type { DeviceMirrorEffect, DeviceMirrorState } from './DeviceMirrorContract'
import type { DeviceMirrorDeps } from './mirrorStream'

/**
 * Nhánh ĐIỀU KHIỂN của ViewModel mirror — tách khỏi `DeviceMirrorViewModel.ts`
 * cùng lý do với `mirrorStream.ts`: để file ViewModel chỉ còn bảng intent.
 *
 * Mọi thông điệp đi qua một cửa `send()`: kiểm `canControl` (đang chảy, đã
 * bật điều khiển, có phiên) rồi gọi `deps.mirror.sendControl`. Gộp lô và giữ
 * thứ tự là việc của đường truyền (`MirrorControlPump`), ở đây chỉ gửi từng
 * thông điệp đúng lúc sự kiện xảy ra.
 *
 * Lỗi gửi KHÔNG đổi `status`: luồng video mới là thứ biết phiên còn sống hay
 * không, và nó tự báo. `cancelled` (màn hình đang gỡ) và `notFound` (phiên vừa
 * chết — luồng sắp báo `failed`) thì im lặng; còn lại nói ra một lần.
 */
type Context = IntentContext<DeviceMirrorState, DeviceMirrorEffect>

async function send(ctx: Context, deps: DeviceMirrorDeps, message: MirrorControlMessage): Promise<boolean> {
  const state = ctx.getState()
  if (!canControl(state) || state.sessionId === null) return false

  const sent = await deps.mirror.sendControl(state.sessionId, message, ctx.signal)
  if (sent.ok) return true
  if (sent.error.kind === 'cancelled' || sent.error.kind === 'notFound') return false
  ctx.emit({ type: 'ShowMessage', severity: 'error', message: sent.error.message })
  return false
}

export async function sendTouch(
  ctx: Context,
  deps: DeviceMirrorDeps,
  input: { action: 'down' | 'up' | 'move'; pointer: number; nx: number; ny: number; pressure: number },
): Promise<void> {
  await send(ctx, deps, {
    type: 'touch',
    action: input.action,
    pointer: input.pointer,
    nx: input.nx,
    ny: input.ny,
    // Nhả tay thì lực về 0 bất kể trình duyệt báo gì — Android không hiểu
    // "nhả với lực khác 0".
    pressure: input.action === 'up' ? 0 : input.pressure,
  })
}

export async function sendScroll(
  ctx: Context,
  deps: DeviceMirrorDeps,
  input: { nx: number; ny: number; dx: number; dy: number },
): Promise<void> {
  // Chép từng trường, không spread: `input` là cả Intent, mang `type: 'ScrollInput'`.
  await send(ctx, deps, { type: 'scroll', nx: input.nx, ny: input.ny, dx: input.dx, dy: input.dy })
}

/** Một cú bấm phím = `down` rồi `up`, tuần tự — outbox không gộp `key`, thứ tự được giữ. */
export async function tapKey(ctx: Context, deps: DeviceMirrorDeps, key: MirrorKey): Promise<void> {
  const pressed = await send(ctx, deps, { type: 'key', action: 'down', key })
  if (!pressed) return
  await send(ctx, deps, { type: 'key', action: 'up', key })
}

export async function submitText(ctx: Context, deps: DeviceMirrorDeps, text: string): Promise<void> {
  // Chuỗi rỗng không có gì để gõ; máy chủ tự chọn `injectText` (ASCII) hay
  // dán qua clipboard (có dấu) — ở đây không phân biệt.
  if (text.length === 0) return
  await send(ctx, deps, { type: 'text', text })
}

export async function rotate(ctx: Context, deps: DeviceMirrorDeps): Promise<void> {
  await send(ctx, deps, { type: 'rotate' })
}

export async function expandNotifications(ctx: Context, deps: DeviceMirrorDeps): Promise<void> {
  await send(ctx, deps, { type: 'expandNotifications' })
}

/**
 * `displayOn` trong State là ƯỚC LƯỢNG theo lệnh vừa gửi thành công — scrcpy
 * không báo ngược trạng thái màn hình. Ai bấm nút nguồn trên máy thì con số
 * này lệch, và lần bấm tới sẽ gửi đúng lệnh đảo lại; tooltip nói rõ.
 */
export async function toggleDisplayPower(ctx: Context, deps: DeviceMirrorDeps): Promise<void> {
  const next = !ctx.getState().displayOn
  const sent = await send(ctx, deps, { type: 'displayPower', on: next })
  if (!sent) return
  ctx.setState((state) => ({ ...state, displayOn: next }))
}

/** Chụp từ sink, không đi qua máy: chỉ cần luồng đang chảy, không cần bật điều khiển. */
export async function snapshot(ctx: Context, deps: DeviceMirrorDeps): Promise<void> {
  const state = ctx.getState()
  if (state.status !== 'streaming') return

  const png = await deps.videoSink.snapshotPng()
  if (ctx.signal.aborted) return
  if (!png.ok) {
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: png.error.message })
    return
  }
  ctx.emit({
    type: 'DownloadFile',
    fileName: snapshotFileName(state.serial, new Date()),
    bytes: png.value,
    mimeType: 'image/png',
  })
}
