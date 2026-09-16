import type { LogcatEvent } from '../entities/LogcatSession'
import type { FollowEvent } from './followAppLogcat'

/**
 * Gom từng dòng của `followAppLogcat` thành `LogcatEvent` có `lines` theo nhịp.
 *
 * ─── Vì sao gom dòng lại rồi mới đẩy ───
 *
 * Một app đang khởi động in ra vài nghìn dòng trong hai giây. Mỗi dòng một sự
 * kiện nghĩa là vài nghìn lượt ghi vào luồng (hoặc vài nghìn lượt cập nhật
 * state), và trình duyệt đứng hình đúng lúc người dùng cần nhìn nhất. Gom theo
 * nhịp 100ms biến chỗ đó thành hai chục lượt, mà mắt người không phân biệt được.
 *
 * Nhịp gom nằm ở ĐÂY chứ không trong `followAppLogcat`: use case nói về việc
 * bám theo pid, còn gom bao nhiêu dòng một lượt là chuyện của đường truyền —
 * và cả hai đường (NDJSON từ máy chủ, WebUSB ngay trong trình duyệt) đều cần
 * đúng một nhịp như nhau.
 */
export interface FollowEventBatcherOptions {
  /** Gom tối đa chừng này dòng, hoặc chừng này mili giây — cái nào tới trước. */
  readonly flushLines?: number
  readonly flushMs?: number
}

export const DEFAULT_FLUSH_LINES = 300
export const DEFAULT_FLUSH_MS = 100

export interface FollowEventBatcher {
  /** Nhận sự kiện từ `followAppLogcat`. */
  readonly emit: (event: FollowEvent) => void
  /** Dừng đồng hồ và xả nốt phần đang chờ. Gọi đúng một lần khi luồng kết thúc. */
  readonly stop: () => void
}

export function createFollowEventBatcher(
  send: (event: LogcatEvent) => void,
  options: FollowEventBatcherOptions = {},
): FollowEventBatcher {
  const flushLines = options.flushLines ?? DEFAULT_FLUSH_LINES
  const flushMs = options.flushMs ?? DEFAULT_FLUSH_MS

  let pending: string[] = []
  const flush = (): void => {
    if (pending.length === 0) return
    const lines = pending
    pending = []
    send({ type: 'lines', lines })
  }

  const ticker = setInterval(flush, flushMs)

  return {
    emit: (event) => {
      if (event.type === 'line') {
        pending.push(event.line)
        if (pending.length >= flushLines) flush()
        return
      }
      // Mọi sự kiện khác đánh dấu một mốc trong luồng (bám được pid, app vừa
      // chết). Xả hàng đợi trước khi gửi, nếu không thì các dòng cuối của tiến
      // trình cũ sẽ hiện ra SAU thông báo "app đã thoát".
      flush()
      send(event)
    },
    stop: () => {
      clearInterval(ticker)
      flush()
    },
  }
}
