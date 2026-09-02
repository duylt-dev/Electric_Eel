import { AppErrors, type Result, err, ok } from '../../../core/result'

/**
 * Chính sách mật khẩu, đặt ở một chỗ.
 *
 * Trước đây luật "dài ít nhất 8" nằm rải ở hai chỗ trong `PrismaUserRepository`,
 * và chỗ thứ ba — màn tự đổi mật khẩu — thì chưa có. Ba bản sao của một luật là
 * ba cơ hội để chúng lệch nhau, mà lần lệch đầu tiên sẽ là lần nới lỏng.
 *
 * Mười ký tự chứ không phải tám: mật khẩu ở đây mở đường tới nút đẩy cấu hình
 * lên production của app thật, và tài khoản do quản trị viên tạo hộ nên người
 * dùng ít khi tự nghĩ ra một chuỗi dài.
 */
export const MIN_PASSWORD_LENGTH = 10

/** Những chuỗi bị gõ ra nhiều tới mức chúng là mục đầu tiên trong mọi bộ dò. */
const OBVIOUS = new Set([
  'password',
  'password123',
  '1234567890',
  '12345678901',
  'qwertyuiop',
  'matkhau123',
  'admin12345',
  'doi-mat-khau-nay-ngay',
])

const normalise = (value: string): string => value.trim().toLowerCase()

/**
 * Kiểm tra một mật khẩu mới.
 *
 * `email` và `name` truyền vào để chặn mật khẩu đặt theo chính chủ tài khoản —
 * dạng đó qua được luật độ dài nhưng là thứ người dò thử trước tiên.
 */
export function validateNewPassword(
  password: string,
  owner: { email?: string; name?: string } = {},
): Result<void> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return err(
      AppErrors.validation(`Mật khẩu phải dài ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`),
    )
  }

  const lowered = normalise(password)

  if (OBVIOUS.has(lowered)) {
    return err(
      AppErrors.validation('Mật khẩu này nằm trong danh sách bị thử đầu tiên. Chọn chuỗi khác.'),
    )
  }

  const localPart = normalise(owner.email ?? '').split('@')[0] ?? ''
  if (localPart.length >= 3 && lowered.includes(localPart)) {
    return err(AppErrors.validation('Mật khẩu không được chứa phần đầu của email.'))
  }

  const name = normalise(owner.name ?? '')
  if (name.length >= 3 && lowered.includes(name)) {
    return err(AppErrors.validation('Mật khẩu không được chứa tên tài khoản.'))
  }

  // Một chuỗi chỉ gồm một ký tự lặp lại vẫn đủ dài nhưng không có gì để dò.
  if (new Set(password).size < 4) {
    return err(AppErrors.validation('Mật khẩu cần ít nhất 4 ký tự khác nhau.'))
  }

  return ok(undefined)
}
