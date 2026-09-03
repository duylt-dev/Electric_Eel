import type { AppError } from '@/core/result'
import { DEFAULT_LOGCAT_FILTER, filterLines } from '@/domain/adb/entities/LogcatFilter'
import type { LogcatFilter } from '@/domain/adb/entities/LogcatFilter'
import type { LogLevel, LogcatLine } from '@/domain/adb/entities/LogcatLine'

/**
 * Hợp đồng của màn xem log.
 *
 *   State  — thứ màn hình vẽ ra. Dữ liệu thuần: không hàm, không đối tượng lớp.
 *   Intent — mọi thứ có thể yêu cầu ViewModel làm. Đường vào duy nhất.
 *   Effect — việc xảy ra một lần: thông báo, tải tệp về.
 */

// ─── State ──────────────────────────────────────────────────────────────────

export type LogcatStatus =
  /** Chưa mở luồng, hoặc vừa bấm dừng. */
  | 'stopped'
  /** Đang hỏi pid lần đầu. */
  | 'connecting'
  /** App chưa chạy. Máy chủ vẫn đang dò; người dùng chỉ cần mở app trên máy. */
  | 'waiting'
  | 'streaming'
  | 'failed'

/**
 * Trần số dòng giữ trong bộ nhớ.
 *
 * Một app đang khởi động in vài nghìn dòng trong vài giây, và một phiên debug
 * kéo dài hàng giờ. Không có trần thì tab ăn hết bộ nhớ rồi bị trình duyệt
 * giết — đúng vào lúc người ta đang chờ tái hiện một lỗi hiếm, tức là lúc mất
 * dữ liệu đắt nhất. Cắt từ đầu và ĐẾM số dòng đã cắt: người dùng phải biết
 * mình đang xem một khúc chứ không phải toàn bộ.
 */
export const MAX_BUFFERED_LINES = 5000

export interface AdbLogcatState {
  readonly serial: string
  readonly packageName: string

  readonly status: LogcatStatus
  /** pid đang bám. Đổi mỗi lần app khởi động lại. */
  readonly pid: number | null
  /** Số lần app khởi động lại kể từ lúc mở màn hình. */
  readonly restarts: number

  readonly lines: readonly LogcatLine[]
  /** Số dòng đã bị cắt khỏi đầu đệm vì chạm trần. */
  readonly dropped: number

  /**
   * Đang tạm dừng. Luồng vẫn chảy và log vẫn được giữ lại — chỉ có màn hình là
   * đứng yên. Tạm dừng mà mất log là kiểu tạm dừng vô dụng: người ta bấm nó
   * đúng lúc thấy thứ đáng đọc, tức là đúng lúc không được phép bỏ sót gì.
   */
  readonly paused: boolean
  /** Những dòng tới trong lúc tạm dừng, chờ được nhập vào `lines`. */
  readonly holding: readonly LogcatLine[]

  readonly filter: LogcatFilter
  readonly autoScroll: boolean

  readonly error: AppError | null
}

export const initialAdbLogcatState = (serial: string, packageName: string): AdbLogcatState => ({
  serial,
  packageName,
  status: 'stopped',
  pid: null,
  restarts: 0,
  lines: [],
  dropped: 0,
  paused: false,
  holding: [],
  filter: DEFAULT_LOGCAT_FILTER,
  autoScroll: true,
  error: null,
})

// ─── Intent ─────────────────────────────────────────────────────────────────

export type AdbLogcatIntent =
  | { type: 'StreamRequested'; clearFirst: boolean }
  | { type: 'StreamStopped' }
  | { type: 'PauseToggled' }
  /** Xoá đệm ĐANG XEM. Không đụng tới log trên máy. */
  | { type: 'ScreenCleared' }
  /** `adb logcat -c` — xoá đệm trên máy, rồi mở lại luồng từ chỗ trắng. */
  | { type: 'DeviceBufferCleared' }
  | { type: 'LevelToggled'; level: LogLevel }
  | { type: 'TagFilterChanged'; value: string }
  | { type: 'QueryChanged'; value: string }
  | { type: 'FilterCleared' }
  | { type: 'AutoScrollChanged'; value: boolean }
  | { type: 'DownloadRequested' }

// ─── Effect ─────────────────────────────────────────────────────────────────

export type AdbLogcatEffect =
  | { type: 'ShowMessage'; severity: 'success' | 'error' | 'info'; message: string }
  /** Trình duyệt lưu tệp về thư mục Tải xuống. */
  | { type: 'DownloadLog'; fileName: string; content: string }

// ─── Dẫn xuất từ state ──────────────────────────────────────────────────────
//
// Để ở đây thay vì tính trong component: đây là quy tắc, không phải cách trình
// bày, và cần kiểm thử được mà không cần render gì.

export const isLive = (state: AdbLogcatState): boolean =>
  state.status === 'streaming' || state.status === 'waiting' || state.status === 'connecting'

export const visibleLines = (state: AdbLogcatState): LogcatLine[] =>
  filterLines(state.lines, state.filter)

/**
 * Nhập những dòng mới vào đệm, cắt phần vượt trần.
 *
 * Trả về cả `dropped` cộng dồn để màn hình nói được "đã bỏ N dòng cũ" thay vì
 * lặng lẽ đánh mất chúng.
 */
export function appendLines(
  current: readonly LogcatLine[],
  incoming: readonly LogcatLine[],
  dropped: number,
): { lines: LogcatLine[]; dropped: number } {
  const merged = [...current, ...incoming]
  if (merged.length <= MAX_BUFFERED_LINES) return { lines: merged, dropped }

  const excess = merged.length - MAX_BUFFERED_LINES
  return { lines: merged.slice(excess), dropped: dropped + excess }
}

/** `logcat-com.pion.lovetest-20260903-1145.txt` — đọc tên là biết của app nào, lúc nào. */
export function logFileName(packageName: string, at: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`
  return `logcat-${packageName}-${stamp}.txt`
}
