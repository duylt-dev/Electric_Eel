/**
 * Bộ lọc của trang Nhật ký, đọc từ và ghi ra query string của URL.
 *
 * ─── Vì sao bộ lọc nằm trên URL chứ không trong state ───
 *
 * Nhật ký khác hai bảng quản trị: nó dài không có giới hạn, nên không tải hết
 * về trình duyệt rồi lọc tại chỗ được — máy chủ phải lọc và cắt trang. Mà một
 * thứ máy chủ phải biết thì đặt trên URL là rẻ nhất: Server Component đọc
 * `searchParams`, không cần API riêng, và địa chỉ "nhật ký thất bại tuần
 * trước" gửi cho người khác được, bấm Back là về đúng bộ lọc cũ.
 *
 * ─── Múi giờ ───
 *
 * Ngày người dùng chọn là ngày ở Việt Nam, nhưng máy chủ (Vercel) chạy UTC.
 * "Từ 15/09" nghĩa là từ 00:00 ngày 15 giờ Việt Nam, tức 17:00 ngày 14 UTC.
 * Việt Nam không đổi giờ theo mùa nên một độ lệch cố định là đủ; ghim nó ở
 * đây để phần lọc và phần hiển thị cùng dùng một múi.
 */

export const AUDIT_TIME_ZONE = 'Asia/Ho_Chi_Minh'
const UTC_OFFSET = '+07:00'

export type AuditStatusFilter = 'all' | 'succeeded' | 'failed'

export interface AuditQuery {
  /** Ngày dạng `YYYY-MM-DD`, hoặc `null` khi không giới hạn. */
  readonly from: string | null
  readonly to: string | null
  readonly status: AuditStatusFilter
  /** Đếm từ 1, như mọi chỗ khác. */
  readonly page: number
}

export const DEFAULT_AUDIT_QUERY: AuditQuery = { from: null, to: null, status: 'all', page: 1 }

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** Một giá trị `searchParams` của Next có thể là chuỗi, mảng hoặc thiếu. */
export type RawParams = Readonly<Record<string, string | readonly string[] | undefined>>

const first = (value: string | readonly string[] | undefined): string | null => {
  if (value === undefined) return null
  return Array.isArray(value) ? ((value[0] as string | undefined) ?? null) : (value as string)
}

/**
 * Ngày phải đúng dạng VÀ là một ngày có thật: "2026-02-30" đúng dạng nhưng
 * `Date` sẽ tự lăn sang tháng 3, và người dùng thấy kết quả của một ngày họ
 * không chọn.
 */
const asDay = (value: string | null): string | null => {
  if (value === null || !YMD.test(value)) return null
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value
}

const asStatus = (value: string | null): AuditStatusFilter =>
  value === 'succeeded' || value === 'failed' ? value : 'all'

const asPage = (value: string | null): number => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
}

/**
 * Đọc bộ lọc từ query string. Giá trị hỏng được thay bằng mặc định chứ không
 * báo lỗi — một URL gõ tay sai một ký tự vẫn phải mở ra được trang nhật ký.
 *
 * `from` sau `to` thì đảo lại: người dùng nhập nhầm thứ tự chứ không có ý
 * hỏi một khoảng rỗng.
 */
export function parseAuditQuery(params: RawParams): AuditQuery {
  let from = asDay(first(params['from']))
  let to = asDay(first(params['to']))
  if (from !== null && to !== null && from > to) [from, to] = [to, from]

  return { from, to, status: asStatus(first(params['status'])), page: asPage(first(params['page'])) }
}

/**
 * Ghi bộ lọc ra query string. Chỉ ghi những gì khác mặc định, để URL của
 * trang "chưa lọc gì" vẫn là `/audit` trần.
 */
export function auditQueryToSearchParams(query: AuditQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.from !== null) params.set('from', query.from)
  if (query.to !== null) params.set('to', query.to)
  if (query.status !== 'all') params.set('status', query.status)
  if (query.page > 1) params.set('page', String(query.page))
  return params
}

/** Điều kiện lọc mà kho nhật ký hiểu, tính từ bộ lọc trên URL. */
export interface AuditRange {
  /** Mốc đầu (bao gồm), giờ tuyệt đối. */
  readonly from: Date | null
  /** Mốc cuối (không bao gồm): 00:00 của ngày KẾ TIẾP ngày `to`. */
  readonly to: Date | null
  readonly succeeded: boolean | null
}

const nextDay = (day: string): string => {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function auditQueryToRange(query: AuditQuery): AuditRange {
  return {
    from: query.from === null ? null : new Date(`${query.from}T00:00:00${UTC_OFFSET}`),
    to: query.to === null ? null : new Date(`${nextDay(query.to)}T00:00:00${UTC_OFFSET}`),
    succeeded: query.status === 'all' ? null : query.status === 'succeeded',
  }
}
