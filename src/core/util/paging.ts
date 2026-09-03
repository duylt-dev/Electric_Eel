/**
 * Cắt trang cho danh sách đã nằm sẵn trong bộ nhớ.
 *
 * Đây là phép tính, không phải giao diện: nó không biết nút bấm nào vẽ ở đâu,
 * nên vừa dùng được cho lưới thẻ, cho bảng, vừa test được bằng `pnpm test` mà
 * không cần dựng React. Phần vẽ nằm ở `ui/components/Pagination.tsx`.
 *
 * Cắt tại trình duyệt chứ không hỏi máy chủ từng trang: những danh sách dùng
 * nó (app trên máy, app trong danh bạ) đã về đủ ngay lần vẽ đầu. Trang chỉ để
 * mắt người khỏi phải lướt qua ba trăm thẻ một lúc.
 *
 * Số trang đếm từ 1 — đó là con số người dùng nhìn thấy trên nút bấm, và giữ
 * đúng một cách đánh số ở mọi chỗ thì không ai phải nhớ chỗ nào lệch một đơn vị.
 */

/**
 * Số mục mỗi trang, mặc định cho mọi danh sách.
 *
 * Đổi ở đây là đổi cho cả trang web. Chỗ nào cần khác thì truyền `pageSize`
 * riêng, đừng chép con số ra chỗ khác.
 */
export const PAGE_SIZE = 25

/** Kích thước trang hợp lệ: số nguyên, ít nhất là 1. */
const step = (size: number): number => (Number.isFinite(size) ? Math.max(1, Math.floor(size)) : PAGE_SIZE)

/**
 * Tổng số trang. Danh sách rỗng vẫn là **một** trang.
 *
 * Trả 0 sẽ khiến bên gọi phải tự phòng chia cho 0 và tự dựng nhánh "chưa có
 * trang nào" — trong khi thứ cần vẽ lúc đó chỉ là một trang trống.
 */
export function pageCount(total: number, size: number = PAGE_SIZE): number {
  if (!Number.isFinite(total) || total <= 0) return 1
  return Math.ceil(total / step(size))
}

/**
 * Kéo một số trang bất kỳ về khoảng hợp lệ.
 *
 * Cần đến khi danh sách co lại dưới chân người dùng: đang ở trang 7 rồi gõ vào
 * ô tìm kiếm còn 12 kết quả, thì thứ phải hiện là trang cuối cùng còn tồn tại
 * chứ không phải một lưới trống.
 */
export function clampPage(page: number, count: number): number {
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(Math.trunc(page), 1), Math.max(1, Math.trunc(count)))
}

/** Phần danh sách thuộc về một trang. Trang ngoài khoảng được kéo về trước khi cắt. */
export function pageSlice<T>(items: readonly T[], page: number, size: number = PAGE_SIZE): T[] {
  const perPage = step(size)
  const safe = clampPage(page, pageCount(items.length, perPage))
  const start = (safe - 1) * perPage
  return items.slice(start, start + perPage)
}

/** Vị trí của trang trong tổng thể, để viết ra câu "26–50 trên 132". */
export interface PageRange {
  /** Thứ tự của mục đầu trang, đếm từ 1. Danh sách rỗng cho 0. */
  readonly from: number
  /** Thứ tự của mục cuối trang. Danh sách rỗng cho 0. */
  readonly to: number
  readonly total: number
}

export function pageRange(page: number, total: number, size: number = PAGE_SIZE): PageRange {
  const count = Math.max(0, Math.trunc(Number.isFinite(total) ? total : 0))
  if (count === 0) return { from: 0, to: 0, total: 0 }

  const perPage = step(size)
  const safe = clampPage(page, pageCount(count, perPage))
  const from = (safe - 1) * perPage + 1

  return { from, to: Math.min(from + perPage - 1, count), total: count }
}
