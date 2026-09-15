import { type Result, ok } from '../../../core/result'
import { delay } from '../../../core/util/concurrency'
import type { AdbDevice } from '../entities/AdbDevice'
import type { DeviceWatchEvent } from '../entities/DeviceWatchEvent'
import type { AdbShell } from '../repositories/AdbShell'
import { listDevices } from './adbCommands'

/**
 * Theo dõi máy cắm vào máy chủ: hỏi `adb devices -l` theo nhịp, chỉ báo khi
 * danh sách ĐỔI.
 *
 * ─── Vì sao hỏi theo nhịp chứ không `adb track-devices` ───
 *
 * `track-devices` là luồng đẩy thật, nhưng nó in ra giao thức của adb server:
 * mỗi mẩu là bốn ký tự hex độ dài rồi tới nội dung, và "không còn máy nào" là
 * `0000` KHÔNG kèm xuống dòng. `AdbShell.stream` đọc theo dòng, nên mẩu đó
 * nằm kẹt trong bộ đệm cho tới khi có máy cắm lại — đúng lúc người dùng cần
 * biết là máy vừa rớt thì màn hình im. Đọc đúng giao thức ấy cần một cổng
 * đọc thô riêng; còn `adb devices` trên cùng máy chủ chỉ mất vài mili giây,
 * một giây một lần là không ai cảm được độ trễ.
 *
 * Chỉ trả về khi bị huỷ. Lỗi từng lượt được BÁO chứ không kết thúc luồng:
 * daemon adb khởi động lại là hỏng đúng một nhịp, và lượt sau lại tốt.
 */
export interface WatchDevicesOptions {
  readonly intervalMs?: number
}

export const DEFAULT_WATCH_INTERVAL_MS = 1_000

/** Cùng máy, cùng trạng thái, cùng thứ tự — không có gì mới để báo. */
export function sameDevices(a: readonly AdbDevice[], b: readonly AdbDevice[]): boolean {
  if (a.length !== b.length) return false
  return a.every((device, index) => {
    const other = b[index]
    return (
      other !== undefined &&
      device.serial === other.serial &&
      device.state === other.state &&
      device.model === other.model &&
      device.product === other.product
    )
  })
}

export async function watchDevices(
  shell: AdbShell,
  emit: (event: DeviceWatchEvent) => void,
  signal: AbortSignal,
  options: WatchDevicesOptions = {},
): Promise<Result<void>> {
  const intervalMs = options.intervalMs ?? DEFAULT_WATCH_INTERVAL_MS

  let last: readonly AdbDevice[] | null = null
  let lastFailure: string | null = null

  while (!signal.aborted) {
    const devices = await listDevices(shell, signal)
    if (signal.aborted) break

    if (!devices.ok) {
      // Cùng một lỗi lặp lại mỗi giây thì báo một lần là đủ.
      if (devices.error.message !== lastFailure) {
        lastFailure = devices.error.message
        emit({ type: 'failed', message: devices.error.message })
      }
    } else {
      lastFailure = null
      if (last === null || !sameDevices(last, devices.value)) {
        last = devices.value
        emit({ type: 'devices', devices: devices.value })
      }
    }

    if (!(await delay(intervalMs, signal))) break
  }

  return ok(undefined)
}
