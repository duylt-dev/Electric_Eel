import { randomUUID } from 'node:crypto'

import { AppErrors, toAppError } from '@/core/result'
import { serverContainer } from '@/di/server'
import { normalizeMirrorRequest } from '@/domain/device-mirror/entities/MirrorRequest'
import type { MirrorVideoPacket } from '@/domain/device-mirror/entities/MirrorVideoPacket'
import { encodeMirrorEvent } from '@/domain/device-mirror/entities/mirrorFrameCodec'
import { startMirrorSession } from '@/domain/device-mirror/usecases/startMirrorSession'
import { canExposeErrorDetail, jsonError } from '@/lib/api/response'
import { requireUser } from '@/lib/session'

/**
 * Luồng nhị phân của một phiên mirror — chảy theo đúng khung
 * `encodeMirrorEvent` (`meta` → `video`/`size` xen kẽ → `failed` nếu hỏng).
 *
 * Khác `logcat/route.ts`: phiên ở đây KHÔNG chỉ là một tiến trình con chết
 * theo `request.signal` — nó là một `MirrorDeviceSession` sống trong
 * `serverContainer.deviceMirror.sessions` để route `/control` tra được. Vòng
 * đời vẫn gắn chặt với request NÀY: `finally` (ở đây là nhánh lỗi của
 * `pull()`, `cancel()`, và listener `abort`) luôn `release()` + `close()`,
 * không có phiên nào sống sót sau khi không còn ai đọc luồng — xem
 * `TangoMirrorGateway.ts` và `LLM.md` §12.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)

  const adbSettings = serverContainer.adb.settings()
  if (!adbSettings.ok) return jsonError(adbSettings.error)

  const mirrorSettings = serverContainer.deviceMirror.settings()
  if (!mirrorSettings.ok) return jsonError(mirrorSettings.error)

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return jsonError(AppErrors.validation('Nội dung yêu cầu không phải JSON hợp lệ.'))
  }

  const normalized = normalizeMirrorRequest(raw)
  if (!normalized.ok) return jsonError(normalized.error)

  const registry = serverContainer.deviceMirror.sessions
  const started = await startMirrorSession(
    { gateway: serverContainer.deviceMirror.gateway, registry },
    normalized.value,
    user.value.id,
    () => randomUUID(),
    request.signal,
  )
  if (!started.ok) return jsonError(started.error)

  const { id, session } = started.value

  let iterator: AsyncIterator<MirrorVideoPacket> | null = null
  let unsubscribeSize: (() => void) | null = null

  let released = false
  const releaseAndClose = async (): Promise<void> => {
    if (released) return
    released = true
    registry.release(id)
    unsubscribeSize?.()
    // `return()` chạy `finally` của `iteratePackets` → `releaseLock()` trên reader
    // video, để `session.close()` bên dưới không phải chờ một reader còn khoá.
    await iterator?.return?.().catch(() => undefined)
    await session.close()
  }
  request.signal.addEventListener('abort', () => void releaseAndClose(), { once: true })

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encodeMirrorEvent({
          type: 'meta',
          sessionId: id,
          deviceName: session.meta.deviceName,
          width: session.meta.width,
          height: session.meta.height,
          codec: 'h264',
          control: normalized.value.control,
        }),
      )
      // Đăng ký NGAY, cùng lượt đồng bộ với lúc phiên được trả về (không có
      // `await` nào chen giữa) — máy xoay màn hình vẫn được báo dù xảy ra
      // trước khi trình duyệt kịp đọc byte đầu tiên.
      unsubscribeSize = session.onSize(({ width, height }) => {
        try {
          controller.enqueue(encodeMirrorEvent({ type: 'size', width, height }))
        } catch {
          // Trình duyệt đã đóng kết nối — không còn ai nghe.
        }
      })
      iterator = session.packets()[Symbol.asyncIterator]()
    },
    async pull(controller) {
      if (request.signal.aborted) {
        controller.close()
        await releaseAndClose()
        return
      }
      try {
        // `start()` chạy trước `pull()` đầu tiên, luôn gán `iterator` trước khi tới đây.
        const { value, done } = await iterator!.next()
        if (done) {
          // Iterator kết thúc mà request CHƯA bị huỷ: scrcpy-server đóng kết
          // nối một cách bất thường (rớt mạng, tiến trình trên máy chết).
          if (!request.signal.aborted) {
            controller.enqueue(
              encodeMirrorEvent({
                type: 'failed',
                kind: 'upstream',
                message: 'Kết nối tới scrcpy-server đã đóng bất ngờ.',
              }),
            )
          }
          controller.close()
          await releaseAndClose()
          return
        }
        controller.enqueue(encodeMirrorEvent({ type: 'video', packet: value }))
      } catch (thrown) {
        const appError = toAppError(thrown, 'Luồng mirror bị ngắt bất ngờ.')
        if (appError.kind !== 'cancelled') {
          // Cùng luật lọc `detail` như `jsonError`: stderr của scrcpy-server
          // (tên máy, encoder, stack Java) đi kèm `upstream` — ghi log, không
          // gửi xuống trình duyệt.
          const exposeDetail = canExposeErrorDetail(appError.kind) && appError.detail !== undefined
          if (!exposeDetail && appError.detail !== undefined) {
            console.error(`[mirror/stream] ${appError.kind}: ${appError.message}`, appError.detail)
          }
          controller.enqueue(
            encodeMirrorEvent({
              type: 'failed',
              kind: appError.kind,
              message: appError.message,
              ...(exposeDetail ? { detail: appError.detail } : {}),
            }),
          )
        }
        controller.close()
        await releaseAndClose()
      }
    },
    async cancel() {
      await releaseAndClose()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store, no-transform',
      // Nói với nginx đứng trước: đừng gom bộ đệm — video mirror mất hết ý
      // nghĩa nếu bị dồn cục vài chục KB rồi mới đẩy một lần.
      'X-Accel-Buffering': 'no',
    },
  })
}
