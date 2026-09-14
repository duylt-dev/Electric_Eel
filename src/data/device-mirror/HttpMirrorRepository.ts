import { AppErrors, type Result, err, ok } from '../../core/result'
import type { MirrorControlMessage } from '../../domain/device-mirror/entities/MirrorControlMessage'
import { MirrorFrameReader } from '../../domain/device-mirror/entities/mirrorFrameCodec'
import type { MirrorRequest } from '../../domain/device-mirror/entities/MirrorRequest'
import type { MirrorStreamEvent } from '../../domain/device-mirror/entities/MirrorStreamEvent'
import type { MirrorRepository } from '../../domain/device-mirror/repositories/MirrorRepository'
import { toAppErrorFromResponse } from '../http/httpJson'
import { MirrorControlPump } from './MirrorControlPump'

/**
 * Hiện thực CHẠY TRÊN TRÌNH DUYỆT của cổng mirror — cùng vai trò với
 * `HttpAdbRepository` bên logcat, khác đường truyền: `stream` đọc NHỊ PHÂN
 * qua `MirrorFrameReader` thay vì NDJSON, vì `video` mang `Uint8Array` +
 * `bigint` mà `JSON.stringify` ném lỗi thẳng khi gặp (xem `mirrorFrameCodec.ts`).
 *
 * `sendControl` không bắn một request cho mỗi lần gọi — gộp lô là việc của
 * ĐƯỜNG TRUYỀN (`ControlOutbox` ở domain, bơm bởi `MirrorControlPump`), không
 * phải ViewModel.
 */

type FailedEvent = Extract<MirrorStreamEvent, { type: 'failed' }>

const STREAM_PATH = '/api/adb/mirror/stream'
const CONTROL_PATH = '/api/adb/mirror/control'

export class HttpMirrorRepository implements MirrorRepository {
  /** Gộp lô + một fetch đang bay — toàn bộ trạng thái của `sendControl` nằm ở đây. */
  private readonly controlPump = new MirrorControlPump((sessionId, messages) =>
    this.postControlBatch(sessionId, messages),
  )

  /** `fetchImpl` tiêm được để test không cần trình duyệt thật: `stream()` tự
   *  đọc `response.body` theo từng mẩu, không qua `httpJson` (nó chờ JSON
   *  xong hẳn mới đọc — không hợp với luồng nhị phân chảy dần). */
  constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch) {}

  async stream(
    request: MirrorRequest,
    onEvent: (event: MirrorStreamEvent) => void,
    signal: AbortSignal,
  ): Promise<Result<void>> {
    let response: Response
    try {
      response = await this.fetchImpl(STREAM_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/octet-stream' },
        body: JSON.stringify(request),
        cache: 'no-store',
        signal,
      })
    } catch (thrown) {
      if (signal.aborted) return err(AppErrors.cancelled('Đã dừng mirror.'))
      return err(AppErrors.network('Không kết nối được tới máy chủ.', { cause: thrown }))
    }

    // Lỗi phát hiện được TRƯỚC khi luồng bắt đầu (serial sai, chưa đăng nhập)
    // vẫn về theo đường JSON thường — cùng quy ước `streamLogcat`.
    if (!response.ok) return err(await toAppErrorFromResponse(response))
    if (response.body === null) return err(AppErrors.upstream('Máy chủ không trả về luồng video.'))

    const reader = response.body.getReader()
    const frameReader = new MirrorFrameReader()
    let failure: FailedEvent | null = null

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        let events: MirrorStreamEvent[]
        try {
          events = frameReader.push(value)
        } catch (thrown) {
          // Lỗi giải mã FRAMING (bug, không phải mạng) — buffer đã hỏng trạng
          // thái, đọc tiếp chỉ sinh rác nối rác nên dừng hẳn ở đây. `cancel()`
          // báo máy chủ đóng phiên NGAY (nó nhìn thấy `request.signal` huỷ) —
          // chỉ `releaseLock()` thì kết nối vẫn mở và scrcpy-server trên máy
          // sống tới khi ViewModel bị dispose.
          await reader.cancel().catch(() => undefined)
          return err(AppErrors.upstream('Không giải mã được dữ liệu video từ máy chủ.', { cause: thrown }))
        }

        for (const event of events) {
          onEvent(event)
          if (event.type === 'failed') failure = event
        }
      }
    } catch (thrown) {
      if (signal.aborted) return err(AppErrors.cancelled('Đã dừng mirror.'))
      return err(AppErrors.network('Mất kết nối giữa chừng.', { cause: thrown }))
    } finally {
      reader.releaseLock()
    }

    if (failure !== null) {
      const event: FailedEvent = failure
      return err({
        kind: event.kind,
        message: event.message,
        ...(event.detail !== undefined ? { detail: event.detail } : {}),
      })
    }
    return ok(undefined)
  }

  sendControl(sessionId: string, message: MirrorControlMessage, signal: AbortSignal): Promise<Result<void>> {
    return this.controlPump.send(sessionId, message, signal)
  }

  /** Không dùng `httpJson`: nó gọi `fetch` toàn cục, không tiêm được để đếm
   *  request/kiểm thứ tự trong test. Vẫn tái dùng `toAppErrorFromResponse`. */
  private async postControlBatch(
    sessionId: string,
    messages: readonly MirrorControlMessage[],
  ): Promise<Result<void>> {
    let response: Response
    try {
      response = await this.fetchImpl(CONTROL_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sessionId, messages }),
        cache: 'no-store',
      })
    } catch (thrown) {
      return err(AppErrors.network('Không gửi được thao tác điều khiển.', { cause: thrown }))
    }
    if (!response.ok) return err(await toAppErrorFromResponse(response))
    return ok(undefined)
  }
}
