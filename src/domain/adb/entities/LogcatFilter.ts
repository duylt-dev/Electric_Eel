import { LOG_LEVELS } from './LogcatLine'
import type { LogLevel, LogcatLine } from './LogcatLine'

/**
 * Bộ lọc chạy ở trình duyệt, trên đệm đã nhận.
 *
 * ─── Vì sao lọc ở trình duyệt chứ không đưa vào lệnh adb ───
 *
 * adb lọc được theo mức và theo tag ngay tại nguồn (`adb logcat Tag:D *:S`),
 * nhưng cái đã bị lọc ở nguồn thì mất hẳn. Đổi bộ lọc sẽ phải cắt luồng và mở
 * lại từ đầu, và những dòng chảy qua trong lúc bộ lọc cũ còn hiệu lực không
 * lấy lại được nữa. Giữ nguyên luồng rồi lọc trên đệm thì đổi bộ lọc là tức
 * thì, và bỏ bộ lọc ra thì mọi dòng vẫn còn nguyên ở đó.
 */
export interface LogcatFilter {
  /** Các mức được hiện. Rỗng nghĩa là không hiện gì — không phải hiện tất cả. */
  readonly levels: readonly LogLevel[]
  /** Khớp một phần tên tag, không phân biệt hoa thường. */
  readonly tag: string
  /** Khớp một phần nội dung hoặc tag. */
  readonly query: string
}

export const ALL_LEVELS: readonly LogLevel[] = LOG_LEVELS

export const DEFAULT_LOGCAT_FILTER: LogcatFilter = {
  levels: ALL_LEVELS,
  tag: '',
  query: '',
}

export const isDefaultFilter = (filter: LogcatFilter): boolean =>
  filter.levels.length === ALL_LEVELS.length && filter.tag === '' && filter.query === ''

/** Bật/tắt một mức, giữ nguyên thứ tự chuẩn để hàng chip không nhảy chỗ. */
export function toggleLevel(filter: LogcatFilter, level: LogLevel): LogcatFilter {
  const next = filter.levels.includes(level)
    ? filter.levels.filter((current) => current !== level)
    : LOG_LEVELS.filter((current) => current === level || filter.levels.includes(current))
  return { ...filter, levels: next }
}

export function matchesFilter(line: LogcatLine, filter: LogcatFilter): boolean {
  if (!filter.levels.includes(line.level)) return false

  const tag = filter.tag.trim().toLowerCase()
  if (tag.length > 0 && !line.tag.toLowerCase().includes(tag)) return false

  const query = filter.query.trim().toLowerCase()
  if (query.length === 0) return true

  return line.message.toLowerCase().includes(query) || line.tag.toLowerCase().includes(query)
}

export const filterLines = (
  lines: readonly LogcatLine[],
  filter: LogcatFilter,
): LogcatLine[] => lines.filter((line) => matchesFilter(line, filter))

/** Đếm số dòng theo mức — dùng cho hàng chip, để biết tắt mức nào là mất bao nhiêu. */
export function countByLevel(lines: readonly LogcatLine[]): Record<LogLevel, number> {
  const counts: Record<LogLevel, number> = { V: 0, D: 0, I: 0, W: 0, E: 0, F: 0 }
  for (const line of lines) counts[line.level] += 1
  return counts
}
