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
  setActive(id: string, isActive: boolean): Promise<Result<void>>
  changePassword(id: string, newPassword: string): Promise<Result<void>>
}
