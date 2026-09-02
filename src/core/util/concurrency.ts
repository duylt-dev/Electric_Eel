/**
 * Chạy song song có trần.
 *
 * Vì sao không dùng thẳng `Promise.all`: bên gọi thường có vài chục việc cùng
 * loại (mỗi ngôn ngữ một lượt gọi LLM). Thả hết cùng lúc thì nhà cung cấp trả
 * 429 và cả mẻ hỏng theo — chậm hơn hẳn so với việc tự giữ nhịp ngay từ đầu.
 *
 * Thứ tự kết quả bám theo thứ tự đầu vào, không theo thứ tự hoàn thành, nên
 * bên gọi ghép được kết quả với việc đã giao mà không cần mang theo chỉ số.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const size = Math.max(1, Math.floor(limit))
  const results = new Array<R>(items.length)
  let next = 0

  const runner = async (): Promise<void> => {
    for (;;) {
      const index = next
      next += 1
      if (index >= items.length) return
      // `items[index]` chắc chắn tồn tại vì `index` vừa được chặn ở trên;
      // ép kiểu ở đây thay vì thêm một nhánh không bao giờ chạy tới.
      results[index] = await worker(items[index] as T, index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(size, items.length) }, runner))
  return results
}
