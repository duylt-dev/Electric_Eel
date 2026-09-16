/**
 * Tìm tài khoản theo họ tên hoặc email.
 *
 * Cùng cách với `AppSearch`: phép tính chuỗi ở `core/util/textSearch`, ở đây
 * chỉ khai trường nào là định danh của một tài khoản. Vai trò và trạng thái
 * KHÔNG nằm trong chỉ mục — chúng là bộ lọc có sẵn lựa chọn, gõ "admin" vào ô
 * tìm kiếm mà ra cả danh sách quản trị viên thì người dùng không đoán được.
 */

import { buildSearchIndex, filterIndexed } from '../../core/util/textSearch'
import type { SearchIndex } from '../../core/util/textSearch'

export interface SearchableUser {
  readonly name: string
  readonly email: string
}

export type UserSearchIndex = SearchIndex

export const buildUserSearchIndex = (users: readonly SearchableUser[]): UserSearchIndex =>
  buildSearchIndex(users, (user) => [user.name, user.email])

export function filterUsers<T extends SearchableUser>(
  users: readonly T[],
  index: UserSearchIndex,
  query: string,
): readonly T[] {
  return filterIndexed(users, index, query)
}
