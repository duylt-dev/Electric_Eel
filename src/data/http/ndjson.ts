import { AppErrors, type Result, err, ok } from '../../core/result'

/**
 * Đọc một phản hồi NDJSON: mỗi dòng là một đối tượng JSON.
 *
 * Dùng cho những phản hồi mà giá trị nằm ở chỗ CHẢY DẦN — luồng log, tiến độ
 * một lượt chạy dài. `httpJson` không thay thế được vì nó chờ phản hồi xong
 * hẳn rồi mới đọc, mà những phản hồi này thì không "xong" cho tới khi người
 * dùng bấm dừng.
 *
 * Một dòng hỏng không làm hỏng cả luồng: nó bị bỏ qua kèm một cảnh báo. Luồng
 * chảy hàng nghìn dòng, và ném cả luồng đi vì một dòng lỗi là đổi một khiếm
 * khuyết nhỏ lấy một sự cố lớn.
 */
export async function readNdjson<T>(
  response: Response,
  onValue: (value: T) => void,
  signal?: AbortSignal,
): Promise<Result<void>> {
  if (response.body === null) {
    return err(AppErrors.unknown('Máy chủ không trả về nội dung nào.'))
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''

  const consume = (raw: string): void => {
    const line = raw.trim()
    if (line.length === 0) return
    try {
      onValue(JSON.parse(line) as T)
    } catch {
      console.warn('[ndjson] bỏ qua một dòng không đọc được')
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffered += decoder.decode(value, { stream: true })

      let newline = buffered.indexOf('\n')
      while (newline >= 0) {
        consume(buffered.slice(0, newline))
        buffered = buffered.slice(newline + 1)
        newline = buffered.indexOf('\n')
      }
    }
    consume(buffered)
  } catch (thrown) {
    if (signal?.aborted === true) return err(AppErrors.cancelled('Đã dừng.'))
    return err(AppErrors.network('Mất kết nối giữa chừng.', { cause: thrown }))
  } finally {
    reader.releaseLock()
  }

  return ok(undefined)
}
