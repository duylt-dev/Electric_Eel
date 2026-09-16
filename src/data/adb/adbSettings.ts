import { AppErrors, type Result, err, ok } from '../../core/result'
import type { AdbAccess } from '../../domain/adb/entities/AdbAccess'

/**
 * Cấu hình của adb Ở MÁY CHỦ.
 *
 * ─── Vì sao mặc định TẮT ở production ───
 *
 * Đường này là thứ duy nhất trong cả supertool sinh ra tiến trình con trên
 * máy chủ. Ở máy dev thì đó chính là điểm hữu ích của nó — adb ở đó nhìn thấy
 * điện thoại đang cắm. Trên một máy chủ dùng chung (và trên Vercel, nơi không
 * có adb lẫn USB) thì adb ở đó không nhìn thấy máy của ai cả.
 *
 * Vì vậy: bật sẵn khi `NODE_ENV !== 'production'`, và ở production thì phải tự
 * tay đặt `ADB_ENABLED=true`. Tắt KHÔNG có nghĩa là Logcat tắt: trang chuyển
 * sang đường WebUSB — trình duyệt nói chuyện thẳng với máy của người dùng
 * (`adbAccess`). Cờ này chỉ chọn đường, xem `domain/adb/entities/AdbAccess`.
 */
export interface AdbSettings {
  /** Đường dẫn tới adb. Mặc định là `adb`, tức là tìm trong PATH. */
  readonly binary: string
  /** Trần thời gian mặc định cho một lệnh ngắn. */
  readonly commandTimeoutMs: number
}

const FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

export function isAdbEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.ADB_ENABLED?.trim().toLowerCase()
  if (raw !== undefined && raw.length > 0) {
    if (TRUE_VALUES.has(raw)) return true
    if (FALSE_VALUES.has(raw)) return false
  }
  return env.NODE_ENV !== 'production'
}

/** Đường tới thiết bị mà trang truyền xuống trình duyệt. */
export const adbAccess = (env: NodeJS.ProcessEnv = process.env): AdbAccess =>
  isAdbEnabled(env) ? 'server' : 'webusb'

export function readAdbSettings(env: NodeJS.ProcessEnv = process.env): Result<AdbSettings> {
  if (!isAdbEnabled(env)) {
    return err(
      AppErrors.forbidden(
        'adb ở máy chủ này đang tắt (ADB_ENABLED); thiết bị nối qua trình duyệt bằng WebUSB.',
      ),
    )
  }

  const configured = env.ADB_PATH?.trim()
  return ok({
    binary: configured !== undefined && configured.length > 0 ? configured : 'adb',
    commandTimeoutMs: 20_000,
  })
}
