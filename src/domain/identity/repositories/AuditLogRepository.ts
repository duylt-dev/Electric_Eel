import type { Result } from '../../../core/result'

/**
 * Những thao tác được ghi vào nhật ký.
 *
 * Danh sách này do chủ dự án CHỈ ĐỊNH, không phải "cứ thao tác nhạy cảm là
 * ghi". Dịch chuỗi và xem logcat cố ý không có mặt ở đây: hai công cụ đó chạy
 * hàng chục lượt mỗi ngày cho mỗi người, mỗi lượt thành một hàng trong DB, mà
 * đổi lại chỉ là một dòng "ai đó vừa dịch / vừa xem log" — không truy được gì
 * thêm. Muốn đưa một công cụ vào nhật ký thì hỏi chủ dự án trước.
 */
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
