import { AppErrors, type Result, err, ok } from '../../../core/result'
import type { AdbShell } from '../repositories/AdbShell'
import { clearLogcatBuffer, resolveAppPid } from './adbCommands'

/**
 * Bám theo log của MỘT app, qua cả những lần app khởi động lại.
 *
 * ─── Vì sao phải bám theo pid ───
 *
 * logcat không biết "app" là gì. Nó chỉ biết pid. Cách duy nhất để lấy đúng
 * log của một app — kể cả những dòng do thư viện in ra dưới tag riêng của
 * chúng (OkHttp, AdMob, Firebase) — là hỏi pid rồi lọc theo pid đó.
 *
 * ─── Vì sao phải bám LẠI ───
 *
 * pid chết theo tiến trình. Người ta debug bằng cách sửa code, chạy lại, xem
 * log — nên trong một phiên làm việc app khởi động lại hàng chục lần, và mỗi
 * lần là một pid mới. Nếu chỉ hỏi pid một lần thì màn hình đứng im từ lần chạy
 * lại thứ nhất trở đi, và điều đó nhìn giống hệt "app không in log nữa" — kiểu
 * hỏng tệ nhất, vì nó khiến người ta đi tìm lỗi ở chỗ không có lỗi.
 *
 * Vòng lặp dưới đây vì vậy không bao giờ tự kết thúc: nó chỉ dừng khi `signal`
 * bị huỷ, tức là khi người dùng đóng màn hình hoặc bấm dừng.
 */

export interface FollowAppLogcatDeps {
  readonly shell: AdbShell
}

export interface FollowAppLogcatOptions {
  readonly serial: string
  readonly packageName: string
  /** Xoá đệm log trên máy trước khi bắt đầu. */
  readonly clearFirst?: boolean
  /** Nhịp dò lại pid khi app chưa chạy. */
  readonly pollIntervalMs?: number
  /** Số dòng cũ lấy về ở lần bám ĐẦU TIÊN. Xem ghi chú trong thân hàm. */
  readonly historyLines?: number
  /** Nghỉ giữa hai lần bám. Xem `SETTLE_MS`. Test hạ xuống 0 để chạy nhanh. */
  readonly settleMs?: number
}

/** Sự kiện nội bộ: từng dòng một. Route Handler gom lại trước khi đẩy qua mạng. */
export type FollowEvent =
  | { type: 'attached'; pid: number }
  | { type: 'waiting' }
  | { type: 'line'; line: string }
  | { type: 'detached'; pid: number }
  | { type: 'notice'; message: string }

const DEFAULT_POLL_MS = 1000
const DEFAULT_HISTORY_LINES = 500

/**
 * Nghỉ tối thiểu giữa hai lần bám.
 *
 * Không có nó thì một tiến trình vừa chết sẽ được hỏi pid lại ngay lập tức,
 * `pidof` vẫn kịp trả về pid cũ (bảng tiến trình chưa dọn xong), `logcat` mở
 * rồi thoát ngay — và vòng lặp quay vài trăm vòng một giây.
 */
const SETTLE_MS = 350

/** Số lần logcat thoát ngay lập tức liên tiếp trước khi kết luận là hỏng thật. */
const MAX_IMMEDIATE_FAILURES = 3
const IMMEDIATE_MS = 800

function delay(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false)
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      resolve(false)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve(true)
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function followAppLogcat(
  deps: FollowAppLogcatDeps,
  options: FollowAppLogcatOptions,
  emit: (event: FollowEvent) => void,
  signal: AbortSignal,
): Promise<Result<void>> {
  const { serial, packageName } = options
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_MS
  const historyLines = options.historyLines ?? DEFAULT_HISTORY_LINES
  const settleMs = options.settleMs ?? SETTLE_MS

  if (options.clearFirst === true) {
    const cleared = await clearLogcatBuffer(deps.shell, serial, signal)
    // Xoá đệm hỏng không đáng làm hỏng cả phiên: người dùng vẫn đọc được mọi
    // dòng mới, chỉ là có thêm mấy dòng cũ ở đầu. Nói ra rồi đi tiếp.
    if (!cleared.ok) emit({ type: 'notice', message: cleared.error.message })
  }

  let firstAttach = true
  let waitingAnnounced = false
  let immediateFailures = 0

  while (!signal.aborted) {
    const found = await resolveAppPid(deps.shell, serial, packageName, signal)
    if (signal.aborted) break
    if (!found.ok) return found

    if (found.value === null) {
      if (!waitingAnnounced) {
        emit({ type: 'waiting' })
        waitingAnnounced = true
      }
      if (!(await delay(pollIntervalMs, signal))) break
      continue
    }

    const pid = found.value
    waitingAnnounced = false
    emit({ type: 'attached', pid })

    // `-T` chỉ đặt ở lần bám đầu: lúc đó app có thể đã chạy từ lâu và đệm chứa
    // hàng chục nghìn dòng cũ, đổ hết ra là màn hình đầy trước khi người dùng
    // kịp đọc. Từ lần bám thứ hai trở đi pid luôn là tiến trình vừa sinh ra,
    // nên "toàn bộ đệm của pid đó" chính là toàn bộ log từ lúc app khởi động —
    // cắt bớt ở đây là cắt mất đúng phần người ta cần nhất.
    const args = [
      'logcat',
      '-v',
      'threadtime',
      ...(firstAttach ? ['-T', String(historyLines)] : []),
      '--pid',
      String(pid),
    ]
    firstAttach = false

    const startedAt = Date.now()
    const exit = await deps.shell.stream({ serial, args }, (line) => emit({ type: 'line', line }), signal)
    if (signal.aborted) break
    if (!exit.ok) return exit

    emit({ type: 'detached', pid })

    // Thoát gần như tức thì nghĩa là logcat không chạy được, chứ không phải app
    // vừa chết ngay sau khi sinh ra. Đếm để không quay vòng vô hạn trên một
    // thiết bị vừa bị rút cáp.
    if (Date.now() - startedAt < IMMEDIATE_MS && exit.value.code !== 0 && exit.value.code !== null) {
      immediateFailures += 1
      if (immediateFailures >= MAX_IMMEDIATE_FAILURES) {
        return err(
          AppErrors.upstream('adb logcat thoát ngay khi vừa mở. Kiểm tra lại kết nối thiết bị.', {
            detail: exit.value.stderr.trim() || `mã thoát ${String(exit.value.code)}`,
          }),
        )
      }
    } else {
      immediateFailures = 0
    }

    if (!(await delay(settleMs, signal))) break
  }

  return ok(undefined)
}
