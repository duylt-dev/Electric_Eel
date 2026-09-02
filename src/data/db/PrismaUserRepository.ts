import bcrypt from 'bcryptjs'

import { AppErrors, type Result, attemptAsync, err, ok } from '../../core/result'
import { validateNewPassword } from '../../domain/identity/entities/PasswordPolicy'
import type { AuthenticatedUser, GlobalRole } from '../../domain/identity/entities/Permission'
import type { UserRepository } from '../../domain/identity/repositories/UserRepository'
import { prisma } from './prismaClient'

const BCRYPT_ROUNDS = 12

/** Bảng lưu vai trò dạng chuỗi (SQLite không có enum), nên quy đổi ở đúng một chỗ. */
const asGlobalRole = (value: string): GlobalRole => (value === 'ADMIN' ? 'ADMIN' : 'MEMBER')

const toUser = (row: { id: string; email: string; name: string; role: string }): AuthenticatedUser => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: asGlobalRole(row.role),
})

export class PrismaUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<Result<AuthenticatedUser | null>> {
    return attemptAsync(async () => {
      const row = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
      return row === null ? null : toUser(row)
    }, 'Không đọc được thông tin tài khoản.')
  }

  async findById(id: string): Promise<Result<AuthenticatedUser | null>> {
    return attemptAsync(async () => {
      const row = await prisma.user.findUnique({ where: { id } })
      return row === null || !row.isActive ? null : toUser(row)
    }, 'Không đọc được thông tin tài khoản.')
  }

  /**
   * Xác thực mật khẩu.
   *
   * Trả về `null` cho MỌI trường hợp thất bại — sai email, sai mật khẩu, tài
   * khoản đã khoá — và luôn chạy một phép so sánh bcrypt kể cả khi email không
   * tồn tại. Nếu bỏ qua phép so sánh ở nhánh không tìm thấy, thời gian phản hồi
   * sẽ tiết lộ email nào có trong hệ thống.
   */
  async verifyPassword(email: string, password: string): Promise<Result<AuthenticatedUser | null>> {
    return attemptAsync(async () => {
      const row = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })

      const hash = row?.passwordHash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin'
      const matches = await bcrypt.compare(password, hash)

      if (row === null || !row.isActive || !matches) return null
      return toUser(row)
    }, 'Không kiểm tra được mật khẩu.')
  }

  async listUsers(): Promise<Result<(AuthenticatedUser & { isActive: boolean })[]>> {
    return attemptAsync(async () => {
      const rows = await prisma.user.findMany({ orderBy: { name: 'asc' } })
      return rows.map((row) => ({ ...toUser(row), isActive: row.isActive }))
    }, 'Không đọc được danh sách tài khoản.')
  }

  async createUser(input: {
    email: string
    name: string
    password: string
    role: GlobalRole
  }): Promise<Result<AuthenticatedUser>> {
    const email = input.email.trim().toLowerCase()

    const existing = await attemptAsync(() => prisma.user.findUnique({ where: { email } }))
    if (!existing.ok) return existing
    if (existing.value !== null) return err(AppErrors.validation(`Email "${email}" đã có tài khoản.`))

    const policy = validateNewPassword(input.password, { email, name: input.name })
    if (!policy.ok) return policy

    return attemptAsync(async () => {
      const row = await prisma.user.create({
        data: {
          email,
          name: input.name.trim(),
          role: input.role,
          passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
        },
      })
      return toUser(row)
    }, 'Không tạo được tài khoản.')
  }

  async setActive(id: string, isActive: boolean): Promise<Result<void>> {
    const updated = await attemptAsync(
      () => prisma.user.update({ where: { id }, data: { isActive } }),
      'Không cập nhật được trạng thái tài khoản.',
    )
    return updated.ok ? ok(undefined) : updated
  }

  async changePassword(id: string, newPassword: string): Promise<Result<void>> {
    const owner = await attemptAsync(() =>
      prisma.user.findUnique({ where: { id }, select: { email: true, name: true } }),
    )
    if (!owner.ok) return owner
    if (owner.value === null) return err(AppErrors.notFound('Không tìm thấy tài khoản.'))

    const policy = validateNewPassword(newPassword, owner.value)
    if (!policy.ok) return policy

    const updated = await attemptAsync(async () => {
      await prisma.user.update({
        where: { id },
        data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
      })
    }, 'Không đổi được mật khẩu.')
    return updated.ok ? ok(undefined) : updated
  }
}
