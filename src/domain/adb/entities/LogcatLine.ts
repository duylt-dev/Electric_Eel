/**
 * Một dòng log đã được tách thành các phần.
 *
 * Tách ở TRÌNH DUYỆT chứ không ở máy chủ, và đó là chủ ý: máy chủ đẩy về đúng
 * dòng thô adb in ra, nên phần chảy qua mạng nhỏ nhất có thể và Route Handler
 * không phải hiểu định dạng log. Trình duyệt mới là bên cần từng phần, vì nó
 * tô màu theo mức và lọc theo tag.
 */
export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'F'

/** Thứ tự từ nhẹ tới nặng. Dùng cho bộ lọc "từ mức này trở lên". */
export const LOG_LEVELS: readonly LogLevel[] = ['V', 'D', 'I', 'W', 'E', 'F']

export const LEVEL_LABEL: Record<LogLevel, string> = {
  V: 'Verbose',
  D: 'Debug',
  I: 'Info',
  W: 'Warn',
  E: 'Error',
  F: 'Fatal',
}

export interface LogcatLine {
  /** Số thứ tự do trình duyệt cấp. Dùng làm khoá React; adb không cấp id nào. */
  readonly seq: number
  /** `09-02 21:33:12.345`. Giữ nguyên chuỗi: log không mang năm và không mang múi giờ. */
  readonly time: string
  readonly pid: number
  readonly tid: number
  readonly level: LogLevel
  readonly tag: string
  readonly message: string
}

/**
 * Định dạng `threadtime` — định dạng duy nhất tool này yêu cầu adb in ra.
 *
 *     09-02 21:33:12.345  1234  1300 D OkHttp: --> GET https://…
 *     └─ thời gian ─────┘ └pid┘ └tid┘ ↑        └tag┘  └─ nội dung ─┘
 *
 * `threadtime` là định dạng duy nhất mang đủ pid, tid, mức và tag trên cùng một
 * dòng. Định dạng mặc định (`brief`) không có tid và không có thời gian, nên
 * một log hai luồng đọc xong không biết dòng nào của luồng nào.
 */
const THREADTIME =
  /^(\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEFS])\s+(.*?)\s*:\s?(.*)$/

/** `--------- beginning of main` — adb chèn khi chuyển sang một vùng đệm khác. */
const SEPARATOR = /^-{5,}\s/

const asLevel = (raw: string): LogLevel =>
  // `S` (silent) không bao giờ xuất hiện trên một dòng thật; quy về Verbose để
  // kiểu dữ liệu không phải mang thêm một nhánh không ai vẽ.
  raw === 'S' ? 'V' : (raw as LogLevel)

/**
 * Đọc một dòng thô.
 *
 * Trả `null` cho dòng trống và dòng phân cách — đó là tiếng ồn của adb, không
 * phải log của app. Dòng KHÔNG khớp định dạng thì vẫn giữ lại nguyên văn thay
 * vì vứt đi: một stack trace bị cắt cụt vì trình phân tích không hiểu là kiểu
 * mất dữ liệu tệ nhất mà công cụ này có thể gây ra.
 */
export function parseLogcatLine(raw: string, seq: number): LogcatLine | null {
  const line = raw.replace(/\r$/, '')
  if (line.trim().length === 0) return null
  if (SEPARATOR.test(line)) return null

  const matched = THREADTIME.exec(line)
  if (matched === null) {
    return {
      seq,
      time: '',
      pid: 0,
      tid: 0,
      level: 'I',
      tag: '',
      message: line,
    }
  }

  const [, time, pid, tid, level, tag, message] = matched
  return {
    seq,
    time: time ?? '',
    pid: Number(pid ?? 0),
    tid: Number(tid ?? 0),
    level: asLevel(level ?? 'I'),
    tag: tag ?? '',
    message: message ?? '',
  }
}

/** Dựng lại một dòng văn bản để ghi ra tệp tải về. */
export const formatLogcatLine = (line: LogcatLine): string =>
  line.time.length === 0
    ? line.message
    : `${line.time}  ${line.pid}  ${line.tid} ${line.level} ${line.tag}: ${line.message}`
