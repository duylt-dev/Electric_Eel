import { AppErrors, type Result, err } from '../../core/result'
import type { MirrorControlMessage } from '../../domain/device-mirror/entities/MirrorControlMessage'
import { ControlOutbox } from '../../domain/device-mirror/ControlOutbox'

export type PostControlBatch = (sessionId: string, messages: readonly MirrorControlMessage[]) => Promise<Result<void>>

/**
 * Bơm thông điệp điều khiển từ `ControlOutbox` xuống máy chủ — phần trạng thái
 * của `HttpMirrorRepository.sendControl`, tách ra để file repository chỉ còn
 * hai đường truyền (`stream`, `postControlBatch`).
 *
 * Ba bảo đảm:
 *  1. Một outbox cho MỘT sessionId — đổi phiên là bỏ outbox cũ, trả `cancelled`
 *     cho mọi lời gọi còn chờ thay vì để `Promise` treo mãi.
 *  2. Đúng MỘT `fetch` đang bay tại một thời điểm — giữ thứ tự down→move→up;
 *     hai request chồng nhau có thể xong không theo thứ tự gửi.
 *  3. Signal nào huỷ (ViewModel dispose) → bỏ outbox, trả `cancelled` cho hàng
 *     chờ. Mỗi intent điều khiển mang một `signal` riêng (không có khoá gộp),
 *     nên `WeakSet` để không gắn hai listener lên cùng một signal mà cũng
 *     không giữ chân signal đã xong.
 */
export class MirrorControlPump {
  private sessionId: string | null = null
  private outbox: ControlOutbox | null = null
  private pendingResolvers: Array<(result: Result<void>) => void> = []
  private pumping = false
  private readonly boundSignals = new WeakSet<AbortSignal>()

  constructor(private readonly postBatch: PostControlBatch) {}

  send(sessionId: string, message: MirrorControlMessage, signal: AbortSignal): Promise<Result<void>> {
    if (signal.aborted) return Promise.resolve(err(AppErrors.cancelled('Đã huỷ gửi điều khiển.')))

    if (sessionId !== this.sessionId) {
      this.discardPending('Phiên mirror đã đổi.')
      this.sessionId = sessionId
      this.outbox = new ControlOutbox()
    }

    // Không xảy ra được (nhánh trên luôn gán trước khi tới đây) — chỉ để qua `strict` null-check.
    const outbox = this.outbox
    if (outbox === null) return Promise.resolve(err(AppErrors.unknown('Outbox điều khiển chưa sẵn sàng.')))

    this.bindAbort(signal)
    outbox.push(message)

    return new Promise<Result<void>>((resolve) => {
      this.pendingResolvers.push(resolve)
      this.schedulePump()
    })
  }

  private bindAbort(signal: AbortSignal): void {
    if (this.boundSignals.has(signal)) return
    this.boundSignals.add(signal)
    signal.addEventListener(
      'abort',
      () => {
        this.outbox = new ControlOutbox()
        this.discardPending('Đã huỷ gửi điều khiển.')
      },
      { once: true },
    )
  }

  private discardPending(message: string): void {
    const resolvers = this.pendingResolvers
    this.pendingResolvers = []
    if (resolvers.length === 0) return
    const cancelled = err(AppErrors.cancelled(message))
    resolvers.forEach((resolve) => resolve(cancelled))
  }

  private schedulePump(): void {
    if (this.pumping) return
    const outbox = this.outbox
    const sessionId = this.sessionId
    if (outbox === null || sessionId === null || outbox.size === 0) return
    this.pumping = true
    void this.pumpLoop(outbox, sessionId)
  }

  private async pumpLoop(outbox: ControlOutbox, sessionId: string): Promise<void> {
    while (this.outbox === outbox && outbox.size > 0) {
      const messages = outbox.take(64)
      const resolvers = this.pendingResolvers
      this.pendingResolvers = []
      // Đơn giản hoá có chủ đích: mọi `Promise` gộp vào lô này (kể cả lời
      // gọi mà thông điệp đã bị GỘP move, không đứng riêng trong `messages`).
      const result = await this.postBatch(sessionId, messages)
      resolvers.forEach((resolve) => resolve(result))
    }
    this.pumping = false
    // Outbox có thể đã đổi (sessionId mới) ngay trong lúc đang gửi — bơm
    // tiếp cho outbox mới nếu có, đừng để im lặng.
    this.schedulePump()
  }
}
