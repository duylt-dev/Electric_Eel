import type { Result } from '../../../core/result'

export type AuditAction =
  | 'TEMPLATE_FETCH'
  | 'TEMPLATE_VALIDATE'
  | 'TEMPLATE_PUBLISH'
  | 'APP_CREATE'
  | 'APP_PACKAGE_SET'
  | 'APP_CREDENTIAL_SET'
  | 'APP_CREDENTIAL_REMOVE'
  | 'APP_MEMBERSHIP_SET'
  | 'USER_CREATE'
  | 'USER_DEACTIVATE'
  | 'USER_PASSWORD_CHANGE'
  | 'LOGIN_FAILED'
  | 'LOGIN_THROTTLED'
  | 'LOGIN_SUCCEEDED'

export interface AuditEntry {
  id: string
  action: AuditAction
  userId: string | null
  userName: string | null
  appId: string | null
  appSlug: string | null
  targetKey: string | null
  detail: string | null
  ipAddress: string | null
  userAgent: string | null
  succeeded: boolean
  createdAt: Date
}

/**
 * Nhật ký thao tác.
 *
 * Ghi log KHÔNG được phép làm hỏng thao tác chính: nếu ghi log lỗi thì thao
 * tác vẫn tính là thành công. Vì vậy `record` không trả về lỗi cho phía gọi.
 */
export interface AuditLogRepository {
  record(entry: {
    action: AuditAction
    userId?: string | null
    appId?: string | null
    targetKey?: string | null
    detail?: string | null
    ipAddress?: string | null
    userAgent?: string | null
    succeeded?: boolean
  }): Promise<void>

  list(filter: { appId?: string; userId?: string; limit?: number }): Promise<Result<AuditEntry[]>>
}
