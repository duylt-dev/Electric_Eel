/**
 * Sắp xếp một danh sách đã nằm sẵn trong bộ nhớ theo một cột và một chiều.
 *
 * Là phép tính, không phải giao diện: bảng nào cũng dùng được và test được
 * bằng `pnpm test` mà không cần dựng React. Phần vẽ đầu cột (mũi tên, bấm để
 * đảo chiều) là `TableSortLabel` của MUI ngay trong từng bảng.
 *
 * So chuỗi bằng `Intl.Collator('vi')`: "Đóng" phải đứng sau "Dịch" chứ không
 * bị đẩy xuống cuối bảng như khi so mã Unicode, và "a" với "A" là một chữ.
 * Bộ so dựng đúng một lần cho cả module — dựng lại mỗi lần so là chậm nhất
 * trong những cách sai.
 */

export type SortDirection = 'asc' | 'desc'

export interface SortState<K extends string> {
  readonly key: K
  readonly direction: SortDirection
}

const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true })

export const compareText = (a: string, b: string): number => collator.compare(a, b)

/** `false` trước `true` khi tăng dần — cùng quy ước với số 0 trước 1. */
export const compareBoolean = (a: boolean, b: boolean): number => Number(a) - Number(b)

/**
 * Bấm vào cột đang sắp xếp thì đảo chiều; bấm cột khác thì sang cột đó, chiều
 * tăng dần. Đây là quy ước mọi bảng trên máy tính đều theo, nên không bảng nào
 * được tự đặt khác đi.
 */
export const toggleSort = <K extends string>(current: SortState<K>, key: K): SortState<K> =>
  current.key === key
    ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: 'asc' }

/**
 * Trả về mảng MỚI đã sắp xếp; không đụng vào mảng gốc vì mảng đó đến từ
 * Server Component và các chỗ khác vẫn đang giữ tham chiếu của nó.
 *
 * `compare` chỉ cần biết so tăng dần; chiều giảm dần là đảo dấu ở đây, để
 * mỗi cột không phải viết hai bộ so.
 */
export function sortItems<T>(
  items: readonly T[],
  compare: (a: T, b: T) => number,
  direction: SortDirection = 'asc',
): T[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...items].sort((a, b) => sign * compare(a, b))
}
