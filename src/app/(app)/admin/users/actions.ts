'use server'

import { revalidatePath } from 'next/cache'

import { serverContainer } from '@/di/server'
import type { GlobalRole } from '@/domain/identity/entities/Permission'
import { requireAdmin } from '@/lib/session'
import { failure, success } from '../../actionState'
import type { ActionState } from '../../actionState'
import { recordAudit } from '../recordAudit'

/**
 * Thao tác quản trị trên TÀI KHOẢN. Mỗi hàm mở đầu bằng `requireAdmin()` —
 * xem chú thích ở `admin/actions.ts`.
 *
 * Ba việc không được làm với chính mình: khoá, hạ quyền, xoá. Không phải vì
 * nguy hiểm cho hệ thống, mà vì làm xong là mất luôn đường vào để hoàn tác —
 * và nếu đó là quản trị viên duy nhất thì không ai còn vào được khu vực này.
 */

const asGlobalRole = (value: FormDataEntryValue | null): GlobalRole => (value === 'ADMIN' ? 'ADMIN' : 'MEMBER')

export async function createUserAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  if (!admin.ok) return failure(admin.error.message)

  const email = String(formData.get('email') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const role = asGlobalRole(formData.get('role'))

  if (name.length === 0) return failure('Cần điền tên người dùng.')

  const created = await serverContainer.users.createUser({ email, name, password, role })
  if (!created.ok) return failure(created.error.message)

  await recordAudit({
    action: 'USER_CREATE',
    userId: admin.value.id,
    targetKey: created.value.email,
  })

  revalidatePath('/admin/users')
  return success(`Đã tạo tài khoản cho ${created.value.email}.`)
}

export async function updateUserAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  if (!admin.ok) return failure(admin.error.message)

  const userId = String(formData.get('userId') ?? '')
  const email = String(formData.get('email') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const role = asGlobalRole(formData.get('role'))

  if (name.length === 0 || email.length === 0) return failure('Cần điền cả họ tên và email.')
  if (userId === admin.value.id && role !== 'ADMIN') {
    return failure('Không thể tự hạ quyền quản trị của chính mình. Nhờ một quản trị viên khác làm việc này.')
  }

  const updated = await serverContainer.users.updateUser(userId, { email, name, role })
  if (!updated.ok) return failure(updated.error.message)

  await recordAudit({
    action: 'USER_UPDATE',
    userId: admin.value.id,
    targetKey: updated.value.email,
    detail: `${updated.value.name} · ${updated.value.role}`,
  })

  revalidatePath('/admin/users')
  return success(`Đã lưu tài khoản ${updated.value.email}.`)
}

/**
 * Quản trị viên đặt lại mật khẩu cho người quên. Không có kênh email (LLM.md
 * §11) nên đây là đường duy nhất; mật khẩu tạm được đọc cho người dùng và họ
 * tự đổi ở `/account`. Không ghi mật khẩu vào nhật ký, hiển nhiên.
 */
export async function resetPasswordAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  if (!admin.ok) return failure(admin.error.message)

  const userId = String(formData.get('userId') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (password !== confirm) return failure('Hai ô mật khẩu không khớp nhau.')

  const changed = await serverContainer.users.changePassword(userId, password)
  if (!changed.ok) return failure(changed.error.message)

  await recordAudit({
    action: 'USER_PASSWORD_RESET',
    userId: admin.value.id,
    targetKey: userId,
  })

  return success('Đã đặt mật khẩu tạm. Nhắc người dùng tự đổi lại sau khi đăng nhập.')
}

export async function deleteUserAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  if (!admin.ok) return failure(admin.error.message)

  const userId = String(formData.get('userId') ?? '')
  const email = String(formData.get('email') ?? '')
  const confirm = String(formData.get('confirm') ?? '').trim().toLowerCase()

  if (userId === admin.value.id) return failure('Không thể tự xoá tài khoản của chính mình.')
  if (confirm !== email.toLowerCase()) return failure(`Gõ đúng email "${email}" để xác nhận xoá.`)

  const deleted = await serverContainer.users.deleteUser(userId)
  if (!deleted.ok) return failure(deleted.error.message)

  await recordAudit({
    action: 'USER_DELETE',
    userId: admin.value.id,
    targetKey: email,
  })

  revalidatePath('/admin/users')
  return success(`Đã xoá tài khoản ${email}. Nhật ký thao tác cũ của người này vẫn còn.`)
}

export async function setUserActiveAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin()
  if (!admin.ok) return failure(admin.error.message)

  const userId = String(formData.get('userId') ?? '')
  const isActive = formData.get('isActive') === 'true'

  if (userId === admin.value.id && !isActive) {
    return failure('Không thể tự khoá tài khoản của chính mình.')
  }

  const updated = await serverContainer.users.setActive(userId, isActive)
  if (!updated.ok) return failure(updated.error.message)

  await recordAudit({
    action: 'USER_DEACTIVATE',
    userId: admin.value.id,
    targetKey: userId,
    detail: isActive ? 'mở lại' : 'khoá',
  })

  revalidatePath('/admin/users')
  return success(isActive ? 'Đã mở lại tài khoản.' : 'Đã khoá tài khoản.')
}
