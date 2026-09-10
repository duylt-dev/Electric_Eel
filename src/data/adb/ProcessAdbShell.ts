import 'server-only'

import { spawn } from 'node:child_process'

import { AppErrors, type Result, err, ok } from '../../core/result'
import type {
  AdbCommand,
  AdbExit,
  AdbRunOutput,
  AdbShell,
} from '../../domain/adb/repositories/AdbShell'
import { readAdbSettings } from './adbSettings'

/**
 * Chạy `adb` bằng tiến trình con trên chính máy chủ.
 *
 * ─── `spawn` chứ không phải `exec` ───
 *
 * `exec` đưa chuỗi lệnh cho shell, nên mọi ký tự đặc biệt trong một tham số
 * đều có nghĩa với shell. Ở đây tham số đến từ trình duyệt (serial thiết bị,
 * tên package), nên một dấu chấm phẩy trong đó sẽ là một lệnh thứ hai. `spawn`
 * với mảng tham số không đi qua shell: ký tự đặc biệt chỉ còn là ký tự.
 *
 * Đó là hàng rào thứ hai. Hàng rào thứ nhất là `isSafeSerial`/`isSafePackageName`
 * bên `domain/adb`, chặn cả những tham số mở đầu bằng `-` — thứ mà `spawn`
 * không chặn được vì với nó đó vẫn là một tham số hợp lệ.
 *
 * ─── Vì sao không giữ lại tiến trình adb nào giữa các request ───
 *
 * Mỗi luồng logcat gắn với đúng một request và chết theo `AbortSignal` của
 * request đó. Trình duyệt đóng tab là Next huỷ signal, là tiến trình bị giết.
 * Không có bảng tiến trình nào phải dọn, nên không có tiến trình nào bị bỏ
 * quên chạy tiếp sau khi không còn ai đọc.
 */

/** Trần bộ nhớ cho stdout của một lệnh ngắn. `pm list packages` lớn nhất cũng chỉ vài chục KB. */
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

const DEFAULT_TIMEOUT_MS = 20_000

function describeSpawnFailure(thrown: unknown, binary: string): ReturnType<typeof AppErrors.notFound> {
  const code = (thrown as NodeJS.ErrnoException | null)?.code
  if (code === 'ENOENT') {
    return AppErrors.notFound(
      `Không tìm thấy \`${binary}\` trên máy chủ. Cài Android platform-tools, hoặc trỏ ADB_PATH tới đường dẫn đầy đủ của adb.`,
    )
  }
  if (code === 'EACCES') {
    return AppErrors.forbidden(`Không có quyền chạy \`${binary}\`.`)
  }
  return AppErrors.unknown('Không chạy được adb.', { detail: String(code ?? thrown) })
}

const buildArgs = (command: AdbCommand): string[] =>
  command.serial === undefined || command.serial === null || command.serial.length === 0
    ? [...command.args]
    : ['-s', command.serial, ...command.args]

export class ProcessAdbShell implements AdbShell {
  async run(command: AdbCommand, signal?: AbortSignal): Promise<Result<AdbRunOutput>> {
    const settings = readAdbSettings()
    if (!settings.ok) return settings
    if (signal?.aborted === true) return err(AppErrors.cancelled('Đã huỷ.'))

    const binary = settings.value.binary
    const timeoutMs = command.timeoutMs ?? settings.value.commandTimeoutMs ?? DEFAULT_TIMEOUT_MS

    return new Promise<Result<AdbRunOutput>>((resolve) => {
      let child: ReturnType<typeof spawn>
      try {
        child = spawn(binary, buildArgs(command), { stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (thrown) {
        resolve(err(describeSpawnFailure(thrown, binary)))
        return
      }

      let stdout = ''
      let stderr = ''
      let settled = false
      let timedOut = false

      const finish = (result: Result<AdbRunOutput>): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve(result)
      }

      const onAbort = (): void => {
        child.kill('SIGTERM')
        finish(err(AppErrors.cancelled('Đã huỷ lệnh adb.')))
      }

      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
      }, timeoutMs)

      signal?.addEventListener('abort', onAbort, { once: true })

      child.stdout?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => {
        if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk
      })
      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', (chunk: string) => {
        if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk
      })

      child.on('error', (thrown) => finish(err(describeSpawnFailure(thrown, binary))))

      child.on('close', (code) => {
        if (timedOut) {
          finish(
            err(
              AppErrors.network(
                `adb không trả lời sau ${String(Math.round(timeoutMs / 1000))}s. Thiết bị có thể đang treo hoặc vừa rớt kết nối.`,
              ),
            ),
          )
          return
        }
        finish(ok({ stdout, stderr, code }))
      })
    })
  }

  async stream(
    command: AdbCommand,
    onLine: (line: string) => void,
    signal?: AbortSignal,
  ): Promise<Result<AdbExit>> {
    const settings = readAdbSettings()
    if (!settings.ok) return settings
    if (signal?.aborted === true) return ok({ code: null, stderr: '' })

    const binary = settings.value.binary

    return new Promise<Result<AdbExit>>((resolve) => {
      let child: ReturnType<typeof spawn>
      try {
        child = spawn(binary, buildArgs(command), { stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (thrown) {
        resolve(err(describeSpawnFailure(thrown, binary)))
        return
      }

      let stderr = ''
      let buffered = ''
      let settled = false

      const finish = (result: Result<AdbExit>): void => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', onAbort)
        resolve(result)
      }

      const onAbort = (): void => {
        child.kill('SIGTERM')
      }
      signal?.addEventListener('abort', onAbort, { once: true })

      child.stdout?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => {
        buffered += chunk
        let newline = buffered.indexOf('\n')
        while (newline >= 0) {
          onLine(buffered.slice(0, newline))
          buffered = buffered.slice(newline + 1)
          newline = buffered.indexOf('\n')
        }
        // Dòng dở dang ở lại chờ mẩu sau. Trần này chặn trường hợp bệnh lý:
        // một tiến trình in ra vài MB không có ký tự xuống dòng nào.
        if (buffered.length > 64 * 1024) {
          onLine(buffered)
          buffered = ''
        }
      })
      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', (chunk: string) => {
        if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk
      })

      child.on('error', (thrown) => finish(err(describeSpawnFailure(thrown, binary))))

      child.on('close', (code) => {
        if (buffered.length > 0) onLine(buffered)
        finish(ok({ code, stderr }))
      })
    })
  }
}
