/**
 * Phân quyền hai tầng: vai trò toàn hệ thống, và vai trò trên từng app.
 *
 * Vì sao hai tầng: một người có thể được sửa cấu hình app A mà chỉ được xem
 * app B. Gộp thành một vai trò duy nhất thì hoặc phải mở quá tay, hoặc phải
 * tạo tài khoản riêng cho từng app.
 */
export type GlobalRole = 'ADMIN' | 'MEMBER'
export type AppRole = 'VIEWER' | 'EDITOR' | 'PUBLISHER'

export const GLOBAL_ROLES: readonly GlobalRole[] = ['ADMIN', 'MEMBER']
export const APP_ROLES: readonly AppRole[] = ['VIEWER', 'EDITOR', 'PUBLISHER']

export const GLOBAL_ROLE_LABEL: Record<GlobalRole, string> = {
  ADMIN: 'Quản trị hệ thống',
  MEMBER: 'Thành viên',
}

export const APP_ROLE_LABEL: Record<AppRole, string> = {
  VIEWER: 'Chỉ xem',
  EDITOR: 'Sửa được, không publish',
  PUBLISHER: 'Sửa và publish',
}

export const APP_ROLE_DESCRIPTION: Record<AppRole, string> = {
  VIEWER: 'Xem cấu hình và kết quả kiểm tra. Không sửa được gì.',
  EDITOR: 'Sửa và lưu nháp, chạy kiểm tra. Không đẩy được lên Firebase.',
  PUBLISHER: 'Toàn quyền, kể cả đẩy cấu hình lên Firebase.',
}

export interface AuthenticatedUser {
  id: string
  email: string
  name: string
  role: GlobalRole
}

export interface AppAccess {
  appId: string
  appSlug: string
  role: AppRole
}

const RANK: Record<AppRole, number> = { VIEWER: 0, EDITOR: 1, PUBLISHER: 2 }

const atLeast = (user: AuthenticatedUser, access: AppAccess | null, minimum: AppRole): boolean => {
  if (user.role === 'ADMIN') return true
  if (access === null) return false
  return RANK[access.role] >= RANK[minimum]
}

export const canViewApp = (user: AuthenticatedUser, access: AppAccess | null): boolean =>
  atLeast(user, access, 'VIEWER')

export const canEditApp = (user: AuthenticatedUser, access: AppAccess | null): boolean =>
  atLeast(user, access, 'EDITOR')

export const canPublishApp = (user: AuthenticatedUser, access: AppAccess | null): boolean =>
  atLeast(user, access, 'PUBLISHER')

/** Tạo app, gắn service account, thêm/bớt người — chỉ quản trị hệ thống. */
export const canManageApps = (user: AuthenticatedUser): boolean => user.role === 'ADMIN'
export const canManageUsers = (user: AuthenticatedUser): boolean => user.role === 'ADMIN'
