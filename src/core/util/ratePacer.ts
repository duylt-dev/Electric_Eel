import { delay } from './concurrency'

/**
 * Giữ nhịp gọi ra ngoài theo số lượt mỗi phút.
 *
 * `mapWithLimit` chặn số việc chạy CÙNG LÚC, nhưng hạn mức của nhà cung cấp
 * mô hình tính theo số lượt MỖI PHÚT — hai thứ khác nhau. Sáu lượt song song,
 * mỗi lượt xong trong năm giây, là hơn bảy chục lượt một phút; khoá Gemini
 * bậc miễn phí chỉ cho khoảng mười. Không giữ nhịp thì lượt thứ mười một trở
 * đi trả 429, và thử lại ngay lập tức chỉ là gõ tiếp vào cùng một cánh cửa
 * đang khoá.
 *
 * Cách giữ: rải đều, mỗi lượt cách lượt trước `60000 / perMinute` mili giây,
 * thay vì cho đi một chùm rồi bắt cả chùm sau chờ trọn một phút. Rải đều thì
 * người dùng thấy ngôn ngữ về đều đặn; đi chùm thì họ thấy tool đứng im.
 *
 * `hold` là kênh phản hồi: khi nhà cung cấp trả 429 kèm "chờ N giây", mọi lượt
 * chưa đi đều lùi theo — chứ không phải chỉ lượt vừa hỏng biết chờ, còn năm
 * lượt kia vẫn lao vào và hỏng y hệt.
 */
export interface RatePacer {
  /** Chờ tới lượt mình. Trả `false` nếu bị huỷ trong lúc chờ. */
  acquire(signal?: AbortSignal): Promise<boolean>
  /** Lùi mọi lượt chưa đi tới ít nhất `ms` kể từ bây giờ. */
  hold(ms: number): void
}

/**
 * `perMinute <= 0` nghĩa là không giữ nhịp — dành cho nhà cung cấp có hạn mức
 * cao tới mức không đáng đếm, và cho test.
 *
 * `sleep` tiêm được để test không phải ngồi chờ thật.
 */
export function createRatePacer(
  perMinute: number,
  sleep: (ms: number, signal?: AbortSignal) => Promise<boolean> = delay,
): RatePacer {
  const interval = perMinute > 0 ? 60_000 / perMinute : 0
  let nextSlot = 0
  let holdUntil = 0

  return {
    async acquire(signal) {
      if (interval === 0) return true
      for (;;) {
        const now = Date.now()
        // Đặt chỗ ngay, trước khi ngủ: hai lượt hỏi cùng một lúc phải nhận hai
        // chỗ khác nhau, chứ không phải cùng tỉnh dậy rồi cùng đi.
        const slot = Math.max(now, nextSlot, holdUntil)
        nextSlot = slot + interval
        if (slot <= now) return true
        if (!(await sleep(slot - now, signal))) return false
        // Trong lúc ngủ có thể đã có lệnh `hold` đẩy lùi xa hơn chỗ đã đặt.
        if (holdUntil <= slot) return true
      }
    },
    hold(ms) {
      holdUntil = Math.max(holdUntil, Date.now() + ms)
    },
  }
}
