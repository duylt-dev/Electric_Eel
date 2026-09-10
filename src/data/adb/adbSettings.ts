import { AppErrors, type Result, err, ok } from '../../core/result'

/**
 * Cấu hình của công cụ Logcat.
 *
 * ─── Vì sao mặc định TẮT ở production ───
 *
 * Công cụ này là thứ duy nhất trong cả supertool sinh ra tiến trình con trên
 * máy chủ. Ở máy dev thì đó chính là điểm hữu ích của nó — adb ở đó nhìn thấy
 * điện thoại đang cắm. Trên một máy chủ dùng chung thì adb ở đó không nhìn
 * thấy máy của ai cả, nên tính năng vừa vô dụng vừa mở thêm một bề mặt.
 *
 * Vì vậy: bật sẵn khi `NODE_ENV !== 'production'`, và ở production thì phải tự
 * tay đặt `ADB_ENABLED=true`. Mặc định an toàn, và ai thật sự cần vẫn bật được.
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

export function readAdbSettings(env: NodeJS.ProcessEnv = process.env): Result<AdbSettings> {
  if (!isAdbEnabled(env)) {
    return err(
      AppErrors.forbidden(
        'Công cụ Logcat đang tắt trên máy chủ này. Đặt ADB_ENABLED=true nếu adb ở đây thật sự nhìn thấy thiết bị của bạn.',
      ),
    )
  }

  const configured = env.ADB_PATH?.trim()
  return ok({
    binary: configured !== undefined && configured.length > 0 ? configured : 'adb',
    commandTimeoutMs: 20_000,
  })
}
