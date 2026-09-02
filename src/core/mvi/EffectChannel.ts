/**
 * Kênh Effect một chiều, một người tiêu thụ, giao đúng một lần, đúng thứ tự.
 *
 * Tương đương `Channel` bên Kotlin chứ không phải `StateFlow`: Effect là việc
 * xảy ra một lần (điều hướng, snackbar, mở dialog), không phải trạng thái. Nếu
 * mô hình hoá bằng cờ trong state thì sau khi xoay màn hình hay quay lại màn
 * cũ, cờ vẫn còn và việc đó xảy ra lần thứ hai.
 *
 * Chỉ cho phép MỘT người tiêu thụ. Hai người cùng nghe nghĩa là một lệnh
 * điều hướng chạy hai lần — lỗi rất khó lần ra nên chặn ngay từ đầu.
 */
export class EffectChannel<E> {
  private readonly pending: E[] = []
  private consumer: ((effect: E) => void) | null = null
  private closed = false

  emit(effect: E): void {
    if (this.closed) return
    if (this.consumer) {
      this.consumer(effect)
      return
    }
    // Chưa ai nghe: giữ lại. Effect phát trong lúc màn hình chưa gắn xong
    // vẫn phải tới nơi, không được rơi.
    this.pending.push(effect)
  }

  /** Gắn người tiêu thụ duy nhất và xả hết những gì đang đợi. Trả về hàm gỡ. */
  connect(consumer: (effect: E) => void): () => void {
    if (this.consumer !== null && process.env.NODE_ENV !== 'production') {
      console.warn(
        '[mvi] EffectChannel đã có người tiêu thụ. Người mới sẽ thay thế người cũ. ' +
          'Hai nơi cùng nghe một kênh Effect là nguyên nhân của điều hướng lặp.',
      )
    }
    this.consumer = consumer

    while (this.pending.length > 0 && this.consumer === consumer && !this.closed) {
      const next = this.pending.shift()
      if (next === undefined) break
      consumer(next)
    }

    return () => {
      if (this.consumer === consumer) this.consumer = null
    }
  }

  close(): void {
    this.closed = true
    this.pending.length = 0
    this.consumer = null
  }
}
