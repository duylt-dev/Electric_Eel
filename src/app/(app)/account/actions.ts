'use server'

import { serverContainer } from '@/di/server'
import { requestInfo } from '@/lib/requestInfo'
import { requireUser } from '@/lib/session'
import { failure, success } from '../actionState'
import type { ActionState } from '../actionState'

/**
 * Tự đổi mật khẩu.
 *
 * Trước khi có màn này, mật khẩu chỉ do quản trị viên đặt lúc tạo tài khoản và
 * không ai đổi được — nghĩa là quản trị viên biết mật khẩu của mọi người, mãi
 * mãi, và không có cách nào phản ứng khi một mật khẩu bị lộ ngoài việc khoá
 * hẳn tài khoản.
 *
 * Bắt nhập mật khẩu hiện tại chứ không chỉ dựa vào phiên đang mở: nếu không,
 * một máy bỏ quên trong lúc đăng nhập là đủ để người khác chiếm hẳn tài khoản
 * thay vì chỉ dùng ké tới lúc phiên hết hạn.
 */
export async function changePasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  if (!user.ok) return failure(user.error.message)

  const currentPassword = String(formData.get('currentPassword') ?? '')
  const newPassword = String(formData.get('newPassword') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')

  if (currentPassword.length === 0 || newPassword.length === 0) {
    return failure('Nhập cả mật khẩu hiện tại và mật khẩu mới.')
  }
  if (newPassword !== confirmPassword) {
    return failure('Hai ô mật khẩu mới không khớp nhau.')
  }
  if (newPassword === currentPassword) {
    return failure('Mật khẩu mới phải khác mật khẩu hiện tại.')
  }

  const { users, audit } = serverContainer

  const verified = await users.verifyPassword(user.value.email, currentPassword)
  if (!verified.ok) return failure(verified.error.message)
  if (verified.value === null) {
    const { ipAddress, userAgent } = await requestInfo()
    await audit.record({
      action: 'USER_PASSWORD_CHANGE',
      userId: user.value.id,
      detail: 'sai mật khẩu hiện tại',
      ipAddress,
      userAgent,
      succeeded: false,
    })
    return failure('Mật khẩu hiện tại không đúng.')
  }

  const changed = await users.changePassword(user.value.id, newPassword)
  if (!changed.ok) return failure(changed.error.message)

  const { ipAddress, userAgent } = await requestInfo()
  await audit.record({
    action: 'USER_PASSWORD_CHANGE',
    userId: user.value.id,
    ipAddress,
    userAgent,
  })

  // Phiên hiện tại vẫn chạy tiếp. Phiên là JWT nên không có danh sách phiên để
  // mà thu hồi; đây là một sai lệch đã biết, ghi ở `LLM.md` §11.
  return success('Đã đổi mật khẩu.')
}
