import type { Adb } from '@yume-chan/adb'

import { AppErrors, type Result, err, ok } from '../../../core/result'
import type {
  AdbCommand,
  AdbExit,
  AdbRunOutput,
  AdbShell,
} from '../../../domain/adb/repositories/AdbShell'
import { LineSplitter } from '../lineSplitter'

/**
 * `AdbShell` chạy NGAY TRONG TRÌNH DUYỆT, trên một kết nối Tango tới daemon
 * adb của một máy.
 *
 * ─── Dịch từ "dòng lệnh adb" sang "dịch vụ của daemon" ───
 *
 * Các use case nói bằng tham số của lệnh `adb` (`['shell', 'pidof', …]`,
 * `['logcat', '-c']`) vì đó là thứ `ProcessAdbShell` chạy. Ở đây không có nhị
 * phân `adb`, chỉ có daemon trên máy — nhưng cả hai dạng lệnh trên rốt cuộc
 * đều là "chạy một tiến trình trên máy": `adb shell X` chạy `X`, còn `adb
 * logcat …` chính là `adb shell logcat …`. Chỉ `devices` là việc của adb ở
 * máy tính, không có tương đương; danh sách máy đi đường khác (`WebUsbDeviceHub`).
 *
 * ─── Hai giao thức ───
 *
 * Android 7 trở lên có shell v2: stdout/stderr tách và có mã thoát — đúng thứ
 * `resolveAppPid` cần để phân biệt "app chưa chạy" (thoát 1) với "máy không có
 * `pidof`" (thoát 127). Máy cũ hơn chỉ có giao thức cũ: một luồng trộn, không
 * mã thoát. Với chúng mã thoát được coi là 0 và stderr rỗng — `pidof` in rỗng
 * vẫn cho ra "chưa chạy", chỉ mất đường lùi sang `ps` cho máy không có `pidof`.
 *
 * Mỗi shell gắn với ĐÚNG MỘT máy. Lệnh mang serial khác bị từ chối trước khi
 * chạy: đó là hàng rào cuối cùng cho lỗi "đọc log nhầm máy".
 */

/** Trần bộ nhớ cho stdout của một lệnh ngắn. `pm list packages` lớn nhất cũng chỉ vài chục KB. */
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

const DEFAULT_TIMEOUT_MS = 20_000

/** Bỏ `shell` ở đầu: phần còn lại là lệnh chạy trên máy. `logcat …` đã là lệnh trên máy. */
export function toDeviceCommand(args: readonly string[]): Result<readonly string[]> {
  const [head, ...rest] = args
  if (head === 'shell') {
    if (rest.length === 0) return err(AppErrors.validation('Lệnh shell trống.'))
    return ok(rest)
  }
  if (head === 'logcat') return ok(args)
  return err(
    AppErrors.validation(`Lệnh \`adb ${head ?? ''}\` không có tương đương khi nối qua trình duyệt.`),
  )
}

async function readAll(
  stream: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      onChunk(decoder.decode(value, { stream: true }))
    }
    const tail = decoder.decode()
    if (tail.length > 0) onChunk(tail)
  } finally {
    reader.releaseLock()
  }
}

/** Một tiến trình đã mở, quy hai giao thức về cùng một hình. */
interface Started {
  readonly stdout: ReadableStream<Uint8Array>
  readonly stderr: ReadableStream<Uint8Array> | null
  /** `null` với giao thức cũ — daemon không nói mã thoát. */
  readonly exited: Promise<number | null>
  readonly kill: () => void
}

/** Hàm thay vì đọc thẳng `signal.aborted`: TS thu hẹp thuộc tính đó sau lần kiểm đầu, mà nó đổi theo thời gian. */
const isAborted = (signal: AbortSignal | undefined): boolean => signal?.aborted === true

const describeFailure = (thrown: unknown): ReturnType<typeof AppErrors.upstream> => {
  const message = thrown instanceof Error ? thrown.message : String(thrown)
  if (/closed|disconnected|detached/i.test(message)) {
    return AppErrors.notFound('Không còn thấy thiết bị này. Cắm lại cáp rồi thử lại.')
  }
  return AppErrors.upstream('Không chạy được lệnh trên máy.', { detail: message })
}

export class TangoAdbShell implements AdbShell {
  readonly #adb: Adb

  constructor(adb: Adb) {
    this.#adb = adb
  }

  get serial(): string {
    return this.#adb.serial
  }

  async #start(command: AdbCommand, signal?: AbortSignal): Promise<Result<Started>> {
    if (
      command.serial !== undefined &&
      command.serial !== null &&
      command.serial.length > 0 &&
      command.serial !== this.#adb.serial
    ) {
      return err(AppErrors.validation('Lệnh này gửi cho một máy khác với máy đang nối.'))
    }

    const device = toDeviceCommand(command.args)
    if (!device.ok) return device

    try {
      const shellV2 = this.#adb.subprocess.shellProtocol
      if (shellV2 !== undefined && shellV2.isSupported) {
        const process = await shellV2.spawn(device.value, signal)
        return ok({
          stdout: process.stdout as unknown as ReadableStream<Uint8Array>,
          stderr: process.stderr as unknown as ReadableStream<Uint8Array>,
          exited: process.exited,
          kill: () => void process.kill(),
        })
      }

      const process = await this.#adb.subprocess.noneProtocol.spawn(device.value, signal)
      return ok({
        stdout: process.output as unknown as ReadableStream<Uint8Array>,
        stderr: null,
        exited: process.exited.then(() => null),
        kill: () => void process.kill(),
      })
    } catch (thrown) {
      if (signal?.aborted === true) return err(AppErrors.cancelled('Đã huỷ lệnh adb.'))
      return err(describeFailure(thrown))
    }
  }

  async run(command: AdbCommand, signal?: AbortSignal): Promise<Result<AdbRunOutput>> {
    if (signal?.aborted === true) return err(AppErrors.cancelled('Đã huỷ.'))

    const started = await this.#start(command, signal)
    if (!started.ok) return started
    const process = started.value

    const timeoutMs = command.timeoutMs ?? DEFAULT_TIMEOUT_MS
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      process.kill()
    }, timeoutMs)
    const onAbort = (): void => process.kill()
    signal?.addEventListener('abort', onAbort, { once: true })

    let stdout = ''
    let stderr = ''
    try {
      const [code] = await Promise.all([
        process.exited,
        readAll(process.stdout, (text) => {
          if (stdout.length < MAX_OUTPUT_BYTES) stdout += text
        }),
        process.stderr === null
          ? Promise.resolve()
          : readAll(process.stderr, (text) => {
              if (stderr.length < MAX_OUTPUT_BYTES) stderr += text
            }),
      ])

      if (isAborted(signal)) return err(AppErrors.cancelled('Đã huỷ lệnh adb.'))
      if (timedOut) {
        return err(
          AppErrors.network(
            `Máy không trả lời sau ${String(Math.round(timeoutMs / 1000))}s. Thiết bị có thể đang treo hoặc vừa rớt kết nối.`,
          ),
        )
      }
      // Giao thức cũ không có mã thoát: coi là 0, xem ghi chú đầu file.
      return ok({ stdout, stderr, code: code ?? 0 })
    } catch (thrown) {
      if (isAborted(signal)) return err(AppErrors.cancelled('Đã huỷ lệnh adb.'))
      return err(describeFailure(thrown))
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  async stream(
    command: AdbCommand,
    onLine: (line: string) => void,
    signal?: AbortSignal,
  ): Promise<Result<AdbExit>> {
    if (signal?.aborted === true) return ok({ code: null, stderr: '' })

    const started = await this.#start(command, signal)
    if (!started.ok) return started
    const process = started.value

    const onAbort = (): void => process.kill()
    signal?.addEventListener('abort', onAbort, { once: true })

    const lines = new LineSplitter(onLine)
    let stderr = ''
    try {
      const [code] = await Promise.all([
        process.exited,
        readAll(process.stdout, (text) => lines.push(text)),
        process.stderr === null
          ? Promise.resolve()
          : readAll(process.stderr, (text) => {
              if (stderr.length < MAX_OUTPUT_BYTES) stderr += text
            }),
      ])
      lines.flush()
      return ok({ code, stderr })
    } catch (thrown) {
      lines.flush()
      // Bị huỷ giữa chừng là kết thúc bình thường của một luồng, không phải lỗi.
      if (isAborted(signal)) return ok({ code: null, stderr })
      return err(describeFailure(thrown))
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }
}
