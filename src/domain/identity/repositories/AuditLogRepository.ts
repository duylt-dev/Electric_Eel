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
  | 'APP_UPDATE'
  | 'APP_DELETE'
  | 'APP_PACKAGE_SET'
  | 'APP_CREDENTIAL_SET'
  | 'APP_CREDENTIAL_REMOVE'
  | 'APP_MEMBERSHIP_SET'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_PASSWORD_RESET'
  | 'USER_DELETE'
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

  list(filter: AuditListFilter): Promise<Result<AuditPage>>
}

/**
 * Điều kiện lọc và cắt trang của nhật ký.
 *
 * Cắt trang ở máy chủ chứ không ở trình duyệt như hai bảng quản trị: nhật ký
 * dài không giới hạn, tải hết về chỉ để xem 25 dòng đầu là trả tiền cho cả
 * bảng mỗi lần mở trang.
 */
export interface AuditListFilter {
  appId?: string
  userId?: string
  /** Mốc đầu, bao gồm. */
  from?: Date | null
  /** Mốc cuối, KHÔNG bao gồm. */
  to?: Date | null
  /** `null`/bỏ trống là lấy cả hai. */
  succeeded?: boolean | null
  /** Đếm từ 1. Trang vượt quá tổng số thì trả về trang rỗng, không lỗi. */
  page?: number
  pageSize?: number
}

export interface AuditPage {
  entries: AuditEntry[]
  /** Tổng số bản ghi khớp bộ lọc, để vẽ hàng nút trang. */
  total: number
}
