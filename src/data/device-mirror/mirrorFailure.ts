import { AdbScrcpyExitedError } from '@yume-chan/adb-scrcpy'

import { AppErrors, type AppError, isAppError } from '../../core/result'
import { JAR_UNREADABLE_MESSAGE, SCRCPY_JAR_NOT_FOUND_MESSAGE } from './mirrorSettings'

/**
 * Quy MỌI lỗi có thể nảy ra trong lúc dựng một phiên Tango về `AppError` có
 * câu tiếng Việt nói bước tiếp theo — cùng triết lý `adbCommands.commandFailure`
 * và `ProcessAdbShell.describeSpawnFailure`, chỉ khác nguồn lỗi (Tango ném
 * exception thay vì trả mã thoát).
 *
 * `serverOutput` là mảng dòng `client.output` (stderr của scrcpy-server) mà
 * `TangoMirrorGateway` tự gom trong lúc `start()` chạy — KHÔNG chỉ dựa vào
 * `thrown.output` của `AdbScrcpyExitedError`, vì có những lỗi (ví dụ
 * `videoStream` không bao giờ resolve) không đi kèm exception loại đó nhưng
 * server vẫn kịp in dòng lỗi ra `output` trước khi mọi thứ treo.
 *
 * KHÔNG có `console.log` — file này thuần suy luận từ chuỗi, không tự ghi log
 * (log dòng lỗi hạ tầng là việc của `jsonError` khi trả HTTP).
 */

/** "The server version (3.3.4) does not match the client (3.3.3)" → "3.3.4" (bản SERVER, số đầu trong ngoặc). */
function extractServerVersion(line: string): string | null {
  const match = /version \(([\d.]+)\)/.exec(line)
  return match?.[1] ?? null
}

function findLine(lines: readonly string[], pattern: RegExp): string | undefined {
  return lines.find((line) => pattern.test(line))
}

/** Trần dòng đưa vào `detail` — output thật của scrcpy-server hiếm khi dài quá vài chục dòng. */
const MAX_OUTPUT_LINES = 200

export function capOutputLines(lines: readonly string[]): string[] {
  return lines.length > MAX_OUTPUT_LINES ? lines.slice(-MAX_OUTPUT_LINES) : [...lines]
}

export function describeMirrorFailure(
  thrown: unknown,
  serverOutput: readonly string[],
  jarPath: string,
  clientVersion: string,
): AppError {
  // Lỗi đã có tên (huỷ theo request, hết giờ ở một bước bắt tay) — trả nguyên,
  // không quy lại thành `unknown`.
  if (isAppError(thrown)) return thrown

  const output = thrown instanceof AdbScrcpyExitedError ? thrown.output : serverOutput
  const code = (thrown as NodeJS.ErrnoException | null)?.code

  // adb server (cổng 5037) chưa chạy hoặc vừa sập — xảy ra ở bước kết nối
  // TCP, TRƯỚC khi chạm tới bất kỳ chuyện gì của scrcpy-server.
  if (code === 'ECONNREFUSED') {
    return AppErrors.network('adb server chưa chạy trên máy chủ. Chạy `adb start-server` rồi thử lại.')
  }

  // Jar mất/hết quyền đọc GIỮA lúc `readMirrorSettings` kiểm và lúc thật sự
  // đẩy lên máy (TOCTOU) — cùng câu với `jarSource.ts` để không có hai cách
  // diễn đạt cho cùng một sự cố.
  if (code === 'ENOENT') {
    return AppErrors.notFound(SCRCPY_JAR_NOT_FOUND_MESSAGE)
  }
  if (code === 'EACCES') {
    return AppErrors.forbidden(JAR_UNREADABLE_MESSAGE, { detail: jarPath })
  }

  const mismatchLine = findLine(output, /does not match/i)
  if (mismatchLine !== undefined) {
    const serverVersion = extractServerVersion(mismatchLine)
    return AppErrors.upstream(
      serverVersion !== null
        ? `scrcpy-server trên máy chủ là bản ${serverVersion}, khác bản client (${clientVersion}). Đặt SCRCPY_SERVER_VERSION=${serverVersion} trong .env rồi thử lại.`
        : 'Bản scrcpy-server trên máy chủ không khớp với client. Kiểm tra SCRCPY_SERVER_VERSION trong .env.',
      { detail: capOutputLines(output).join('\n') },
    )
  }

  if (findLine(output, /device .* not found|no devices/i) !== undefined) {
    return AppErrors.notFound('Không còn thấy thiết bị này. Bấm làm mới rồi thử lại.')
  }

  const thrownMessage = thrown instanceof Error ? thrown.message : ''
  if (/unauthorized/i.test(thrownMessage) || findLine(output, /unauthorized/i) !== undefined) {
    return AppErrors.forbidden(
      'Thiết bị chưa cho phép gỡ lỗi. Mở khoá màn hình rồi bấm "Cho phép" ở hộp thoại USB debugging.',
    )
  }

  if (thrown instanceof AdbScrcpyExitedError) {
    return AppErrors.upstream('scrcpy-server thoát ngay khi khởi động.', {
      detail: capOutputLines(thrown.output).join('\n'),
    })
  }

  const detail = thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : String(thrown)
  return AppErrors.unknown('Không khởi động được scrcpy-server.', { detail })
}
