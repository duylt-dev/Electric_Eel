import type { Result } from '../../../core/result'
import type { AuthenticatedUser, GlobalRole } from '../entities/Permission'

export interface UserRepository {
  findByEmail(email: string): Promise<Result<AuthenticatedUser | null>>
  /** Trả về người dùng nếu mật khẩu đúng và tài khoản còn hoạt động. */
  verifyPassword(email: string, password: string): Promise<Result<AuthenticatedUser | null>>
  findById(id: string): Promise<Result<AuthenticatedUser | null>>
  listUsers(): Promise<Result<(AuthenticatedUser & { isActive: boolean })[]>>
  createUser(input: {
    email: string
    name: string
    password: string
    role: GlobalRole
  }): Promise<Result<AuthenticatedUser>>
  /** Sửa hồ sơ. Email trùng với tài khoản khác thì trả `validation`. */
  updateUser(id: string, input: { email: string; name: string; role: GlobalRole }): Promise<Result<AuthenticatedUser>>
  setActive(id: string, isActive: boolean): Promise<Result<void>>
  /** Đặt mật khẩu mới, kiểm luật mật khẩu. Dùng cho cả tự đổi lẫn quản trị đặt lại. */
  changePassword(id: string, newPassword: string): Promise<Result<void>>
  /**
   * Xoá hẳn tài khoản. Quyền trên app đi theo (cascade); nhật ký GIỮ LẠI với
   * `userId` về `null` — xoá người không được xoá dấu vết việc họ đã làm.
   */
  deleteUser(id: string): Promise<Result<void>>
}
