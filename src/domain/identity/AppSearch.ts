/**
 * Tìm app trong danh bạ theo tên hiển thị, Firebase Project ID, package name
 * hoặc định danh trên URL.
 *
 * Phép tính chuỗi (bỏ dấu, chỉ mục, tách từ khoá) nằm ở `core/util/textSearch`
 * và dùng chung với các danh sách khác; file này chỉ nói TRƯỜNG NÀO của một
 * app tính là định danh — đó là luật nghiệp vụ, và là thứ test ở đây bảo vệ.
 */

import { buildSearchIndex, filterIndexed } from '../../core/util/textSearch'
import type { SearchIndex } from '../../core/util/textSearch'

export { normalizeSearchText, tokenizeQuery } from '../../core/util/textSearch'

/** Bốn trường định danh một app. Chỉ cần chừng này, không cần cả thực thể. */
export interface SearchableApp {
  readonly displayName: string
  readonly projectId: string
  readonly slug: string
  readonly packageName: string | null
}

/** Chuỗi tra cứu của từng app, cùng thứ tự và cùng độ dài với mảng app gốc. */
export type AppSearchIndex = SearchIndex

/** Dựng chỉ mục. Gọi một lần cho mỗi danh sách, không gọi lại khi gõ phím. */
export const buildAppSearchIndex = (apps: readonly SearchableApp[]): AppSearchIndex =>
  buildSearchIndex(apps, (app) => [app.displayName, app.projectId, app.slug, app.packageName])

/** Lọc danh sách theo từ khoá. `index` phải là chỉ mục dựng từ chính `apps`. */
export function filterApps<T extends SearchableApp>(
  apps: readonly T[],
  index: AppSearchIndex,
  query: string,
): readonly T[] {
  return filterIndexed(apps, index, query)
}
