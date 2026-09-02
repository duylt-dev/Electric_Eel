import { PrismaUserRepository } from '../src/data/db/PrismaUserRepository'
import { MIN_PASSWORD_LENGTH } from '../src/domain/identity/entities/PasswordPolicy'

/**
 * Dựng tài khoản quản trị đầu tiên.
 *
 * Chỉ tạo đúng một tài khoản, không tạo app mẫu: một app có projectId bịa ra
 * sẽ hỏng ngay khi ai đó bấm vào, và người dùng mất thời gian tìm hiểu tại sao.
 * App thật được thêm qua giao diện quản trị, kèm service account thật.
 */
async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@pion.local'
  const password = process.env.SEED_ADMIN_PASSWORD ?? ''
  const name = process.env.SEED_ADMIN_NAME ?? 'Quản trị viên'

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `SEED_ADMIN_PASSWORD phải dài ít nhất ${MIN_PASSWORD_LENGTH} ký tự. Đặt biến này trong .env rồi chạy lại.`,
    )
  }

  const users = new PrismaUserRepository()

  const existing = await users.findByEmail(email)
  if (!existing.ok) throw new Error(`Không đọc được cơ sở dữ liệu: ${existing.error.message}`)

  if (existing.value !== null) {
    console.log(`Tài khoản ${email} đã tồn tại, không tạo lại.`)
    return
  }

  const created = await users.createUser({ email, name, password, role: 'ADMIN' })
  if (!created.ok) throw new Error(`Không tạo được tài khoản: ${created.error.message}`)

  console.log(`Đã tạo quản trị viên: ${created.value.email}`)
  console.log('Bước tiếp theo: đăng nhập rồi vào mục Quản trị để thêm project Firebase.')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
