import type { MirrorControlMessage } from './entities/MirrorControlMessage'

/**
 * Hộp gộp thông điệp điều khiển TRƯỚC khi gửi lên server.
 *
 * Đây là chuyện của ĐƯỜNG TRUYỀN, không phải của ViewModel — cùng tinh thần
 * bình luận ở `logcat/route.ts` về gộp dòng log. `HttpMirrorRepository` (phase
 * 04) là nơi DUY NHẤT gọi `push`/`take`; ViewModel chỉ biết "gửi một thông
 * điệp chạm", không biết chuyện gộp lô.
 *
 * ─── Luật gộp ───
 *
 * `move` cùng `pointer` chỉ giữ lại cái MỚI NHẤT, miễn là chưa có `down`/`up`
 * của CHÍNH pointer đó chen vào giữa — hai lần kéo (gesture) khác nhau của
 * cùng một ngón tay không được phép trộn lẫn vị trí. `down`/`up`/`key`/`text`/
 * … không bao giờ bị gộp: mất một `down` nghĩa là server không biết một cú
 * chạm đã bắt đầu, còn `move` bị mất giữa chừng chỉ làm đường vẽ đỡ mượt hơn
 * một chút — hai cái giá đó không tương xứng.
 */
export class ControlOutbox {
  private queue: MirrorControlMessage[] = []

  /**
   * Vị trí trong `queue` của `move` GẦN NHẤT cho từng pointer, để gộp TẠI CHỖ
   * thay vì đẩy xuống cuối hàng đợi — nhờ vậy thứ tự tương đối với các thông
   * điệp của pointer khác được giữ nguyên.
   */
  private lastMoveIndex = new Map<number, number>()

  push(message: MirrorControlMessage): void {
    if (message.type === 'touch' && message.action === 'move') {
      const existingIndex = this.lastMoveIndex.get(message.pointer)
      if (existingIndex !== undefined) {
        this.queue[existingIndex] = message
        return
      }
      this.lastMoveIndex.set(message.pointer, this.queue.length)
      this.queue.push(message)
      return
    }

    // `down`/`up` CHEN GIỮA nghĩa là move tiếp theo của pointer này thuộc một
    // cú chạm khác — xoá dấu vết move cũ để không gộp nhầm hai cú chạm.
    if (message.type === 'touch' && (message.action === 'down' || message.action === 'up')) {
      this.lastMoveIndex.delete(message.pointer)
    }
    this.queue.push(message)
  }

  /** Lấy tối đa `max` thông điệp ra khỏi hàng đợi, theo đúng thứ tự đã gộp. */
  take(max = 64): MirrorControlMessage[] {
    const taken = this.queue.splice(0, max)

    // Các chỉ số move đã lưu đều lệch sau khi cắt đầu hàng đợi — dựng lại từ
    // đầu thay vì dịch từng chỉ số, hàng đợi tối đa vài chục phần tử nên chi
    // phí không đáng kể.
    this.lastMoveIndex.clear()
    this.queue.forEach((item, index) => {
      if (item.type === 'touch' && item.action === 'move') {
        this.lastMoveIndex.set(item.pointer, index)
      }
    })

    return taken
  }

  get size(): number {
    return this.queue.length
  }
}
