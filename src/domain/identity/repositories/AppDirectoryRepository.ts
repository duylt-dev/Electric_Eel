import type { Result } from '../../../core/result'
import type { FirebaseAppSummary } from '../entities/FirebaseAppSummary'
import type { AppAccess, AppRole, AuthenticatedUser } from '../entities/Permission'

/** Đọc danh bạ app. Đây là thứ mọi màn hình đều cần. */
export interface AppDirectoryReader {
  listAppsForUser(user: AuthenticatedUser): Promise<Result<FirebaseAppSummary[]>>
  /**
   * Lấy một app kèm quyền của người dùng trên app đó. Trả `forbidden` khi
   * người dùng không có quyền xem — không trả `notFound`, vì phân biệt hai
   * trường hợp đó cho phép dò ra app nào tồn tại.
   */
  getAppForUser(
    user: AuthenticatedUser,
    slug: string,
  ): Promise<Result<{ app: FirebaseAppSummary; access: AppAccess | null }>>
}

export interface CreateAppInput {
  slug: string
  displayName: string
  projectId: string
  /** applicationId của app. Bỏ trống được, điền bổ sung sau ở màn quản trị. */
  packageName?: string | null
  createdById: string
}

/** Quản trị danh bạ. Chỉ khu vực quản trị dùng tới. */
export interface AppDirectoryAdmin {
  createApp(input: CreateAppInput): Promise<Result<FirebaseAppSummary>>
  /** Đặt hoặc xoá (`null`) applicationId của một app đã tạo. */
  setPackageName(slug: string, packageName: string | null): Promise<Result<FirebaseAppSummary>>
  /** Nhận nguyên văn service account JSON; hàm này lo phần mã hoá. */
  setCredential(slug: string, serviceAccountJson: string): Promise<Result<FirebaseAppSummary>>
  removeCredential(slug: string): Promise<Result<FirebaseAppSummary>>
  setMembership(appId: string, userId: string, role: AppRole | null): Promise<Result<void>>
  listMemberships(appId: string): Promise<Result<{ user: AuthenticatedUser; role: AppRole }[]>>
}
