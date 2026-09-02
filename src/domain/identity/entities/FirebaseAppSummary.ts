import type { AppRole } from './Permission'

/** Một project Firebase mà tool này quản lý. Không bao giờ chứa credential. */
export interface FirebaseAppSummary {
  id: string
  /** Định danh trên URL. */
  slug: string
  displayName: string
  projectId: string
  /**
   * applicationId của app Android, ví dụ `com.pion.lovetest`.
   *
   * `null` khi chưa ai điền — app tạo trước khi có trường này vẫn hợp lệ. Đây
   * là cái tên đội ngũ dùng khi nói về app ở mọi nơi khác (Play Console, log,
   * bug report), nên nó là từ khoá người ta gõ trước tiên khi đi tìm app.
   */
  packageName: string | null
  /** Đã gắn service account chưa. Chưa gắn thì chỉ xem được, không nối Firebase được. */
  hasCredential: boolean
  /** Email của service account, hiển thị để đối chiếu. Không phải bí mật. */
  credentialClientEmail: string | null
  isActive: boolean
  /** Vai trò của người đang đăng nhập trên app này. `null` nghĩa là không có quyền. */
  role: AppRole | null
}

/**
 * Dạng hợp lệ của một applicationId: các đoạn ngăn bằng dấu chấm, mỗi đoạn mở
 * đầu bằng chữ cái. Đúng luật định danh của Java/Kotlin, cộng dấu gạch ngang mà
 * bundle id của iOS cho phép.
 *
 * Bắt buộc có ít nhất một dấu chấm: gõ nhầm tên hiển thị vào ô này là lỗi dễ
 * xảy ra nhất, và một chuỗi không có dấu chấm gần như chắc chắn là lỗi đó.
 */
const PACKAGE_NAME = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_-]*)+$/

export const isPackageName = (value: string): boolean => PACKAGE_NAME.test(value)
