/**
 * Gộp các mẩu văn bản thành từng dòng trọn vẹn.
 *
 * Mọi nguồn đọc theo mẩu (stdout của tiến trình, socket adb) đều cắt dòng ở
 * chỗ ngẫu nhiên. Dùng chung một bộ tách để `ProcessAdbShell` và
 * `TangoAdbShell` không lệch nhau ở đúng chỗ khó thấy nhất: một dòng log bị
 * chẻ đôi nhìn như hai dòng hỏng.
 */
export class LineSplitter {
  #buffered = ''
  readonly #onLine: (line: string) => void

  /** Trần chặn trường hợp bệnh lý: một tiến trình in ra vài MB không có ký tự xuống dòng. */
  static readonly MAX_PARTIAL = 64 * 1024

  constructor(onLine: (line: string) => void) {
    this.#onLine = onLine
  }

  push(chunk: string): void {
    this.#buffered += chunk
    let newline = this.#buffered.indexOf('\n')
    while (newline >= 0) {
      this.#onLine(this.#buffered.slice(0, newline))
      this.#buffered = this.#buffered.slice(newline + 1)
      newline = this.#buffered.indexOf('\n')
    }
    if (this.#buffered.length > LineSplitter.MAX_PARTIAL) {
      this.#onLine(this.#buffered)
      this.#buffered = ''
    }
  }

  /** Dòng dở dang cuối cùng, khi nguồn đã đóng. */
  flush(): void {
    if (this.#buffered.length > 0) this.#onLine(this.#buffered)
    this.#buffered = ''
  }
}
