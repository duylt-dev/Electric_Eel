'use server'

import { revalidatePath } from 'next/cache'

import { serverContainer } from '@/di/server'
import { isPackageName } from '@/domain/identity/entities/FirebaseAppSummary'
import type { AppRole, GlobalRole } from '@/domain/identity/entities/Permission'
import { requestInfo } from '@/lib/requestInfo'
import { requireAdmin } from '@/lib/session'
import { failure, success } from '../actionState'
import type { ActionState } from '../actionState'

/**
 * Thao tác quản trị.
 *
 * Mỗi hàm tự gọi `requireAdmin()` ngay dòng đầu. Không hàm nào tin rằng nút bấm
 * gọi nó đã bị ẩn với người không đủ quyền — server action là một endpoint HTTP
 * như mọi endpoint khác, và gọi thẳng vào nó không khó.
 */

/**
 * Ghi nhật ký kèm nguồn gốc request.
 *
 * Không export: file `'use server'` chỉ được export hàm async, và đây là hàm
 * dùng nội bộ. Gom lại một chỗ để không có thao tác quản trị nào bị bỏ sót
 * phần IP — mà thiếu IP thì nhật ký chỉ nói ai làm, không nói làm từ đâu.
 */
const recordAudit = async (
  entry: Parameters<typeof serverContainer.audit.record>[0],
): Promise<void> => {
  const { ipAddress, userAgent } = await requestInfo()
  await serverContainer.audit.record({ ...entry, ipAddress, userAgent })
}

export async function createAppAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  if (!admin.ok) return failure(admin.error.message)

  const slug = String(formData.get('slug') ?? '').trim()
  const displayName = String(formData.get('displayName') ?? '').trim()
  const projectId = String(formData.get('projectId') ?? '').trim()
  const packageName = String(formData.get('packageName') ?? '').trim()

  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug)) {
    return failure('Định danh chỉ gồm chữ thường, số và gạch ngang, dài 3–50 ký tự.')
  }
  if (displayName.length === 0 || projectId.length === 0) {
    return failure('Cần điền cả tên hiển thị và Project ID.')
  }
  if (packageName.length > 0 && !isPackageName(packageName)) {
    return failure(`"${packageName}" không giống một package name. Dạng đúng: com.pion.lovetest`)
  }

  const created = await serverContainer.appDirectory.createApp({
    slug,
    displayName,
    projectId,
    packageName: packageName.length === 0 ? null : packageName,
    createdById: admin.value.id,
  })
  if (!created.ok) return failure(created.error.message)

  await recordAudit({
    action: 'APP_CREATE',
    userId: admin.value.id,
    appId: created.value.id,
    detail: `${displayName} (${projectId})`,
  })

  revalidatePath('/admin')
  revalidatePath('/remote-config')
  return success(`Đã tạo app "${displayName}". Bước tiếp theo là gắn service account.`)
}

/**
 * Đặt hoặc xoá package name của một app đã tạo.
 *
 * Có hàm riêng thay vì chỉ cho điền lúc tạo app: app tạo trước khi có trường
 * này thì không còn đường nào để điền, và đó là toàn bộ số app đang có.
 */
export async function setPackageNameAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin()
  if (!admin.ok) return failure(admin.error.message)

  const slug = String(formData.get('slug') ?? '')
  const packageName = String(formData.get('packageName') ?? '').trim()

  if (packageName.length > 0 && !isPackageName(packageName)) {
    return failure(`"${packageName}" không giống một package name. Dạng đúng: com.pion.lovetest`)
  }

  const saved = await serverContainer.appDirectory.setPackageName(
    slug,
    packageName.length === 0 ? null : packageName,
  )
  if (!saved.ok) return failure(saved.error.message)

  await recordAudit({
    action: 'APP_PACKAGE_SET',
    userId: admin.value.id,
    appId: saved.value.id,
    detail: saved.value.packageName ?? 'xoá',
  })

  revalidatePath(`/admin/apps/${slug}`)
  revalidatePath('/remote-config')
  return success(
    saved.value.packageName === null
      ? 'Đã xoá package name. App này không còn tìm được bằng package name nữa.'
      : `Đã lưu package name ${saved.value.packageName}.`,
  )
}

export async function setCredentialAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin()
  if (!admin.ok) return failure(admin.error.message)

  const slug = String(formData.get('slug') ?? '')
  const file = formData.get('serviceAccount')

  if (!(file instanceof File) || file.size === 0) {
    return failure('Chọn tệp service account JSON tải từ Firebase Console.')
  }
  if (file.size > 32 * 1024) {
    return failure('Tệp lớn bất thường so với một service account. Kiểm tra lại xem có chọn đúng tệp không.')
  }

  const saved = await serverContainer.appDirectory.setCredential(slug, await file.text())
  if (!saved.ok) return failure(saved.error.message)

  await recordAudit({
    action: 'APP_CREDENTIAL_SET',
    userId: admin.value.id,
    appId: saved.value.id,
    detail: saved.value.credentialClientEmail,
  })

  revalidatePath(`/admin/apps/${slug}`)
  revalidatePath('/remote-config')
  return success('Đã lưu service account. Nội dung được mã hoá trước khi ghi xuống cơ sở dữ liệu.')
}

export async function removeCredentialAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin()
  if (!admin.ok) return failure(admin.error.message)

  const slug = String(formData.get('slug') ?? '')
  const removed = await serverContainer.appDirectory.removeCredential(slug)
  if (!removed.ok) return failure(removed.error.message)

  await recordAudit({
    action: 'APP_CREDENTIAL_REMOVE',
    userId: admin.value.id,
    appId: removed.value.id,
  })

  revalidatePath(`/admin/apps/${slug}`)
  return success('Đã gỡ service account. App này tạm thời không nối được với Firebase.')
}

export async function createUserAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  if (!admin.ok) return failure(admin.error.message)

  const email = String(formData.get('email') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const role: GlobalRole = formData.get('role') === 'ADMIN' ? 'ADMIN' : 'MEMBER'

  if (name.length === 0) return failure('Cần điền tên người dùng.')

  const created = await serverContainer.users.createUser({ email, name, password, role })
  if (!created.ok) return failure(created.error.message)

  await recordAudit({
    action: 'USER_CREATE',
    userId: admin.value.id,
    targetKey: created.value.email,
  })

  revalidatePath('/admin')
  return success(`Đã tạo tài khoản cho ${created.value.email}.`)
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

  revalidatePath('/admin')
  return success(isActive ? 'Đã mở lại tài khoản.' : 'Đã khoá tài khoản.')
}

export async function setMembershipAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin()
  if (!admin.ok) return failure(admin.error.message)

  const appId = String(formData.get('appId') ?? '')
  const slug = String(formData.get('slug') ?? '')
  const userId = String(formData.get('userId') ?? '')
  const raw = String(formData.get('role') ?? '')
  const role: AppRole | null =
    raw === 'VIEWER' || raw === 'EDITOR' || raw === 'PUBLISHER' ? raw : null

  const updated = await serverContainer.appDirectory.setMembership(appId, userId, role)
  if (!updated.ok) return failure(updated.error.message)

  await recordAudit({
    action: 'APP_MEMBERSHIP_SET',
    userId: admin.value.id,
    appId,
    targetKey: userId,
    detail: role ?? 'gỡ quyền',
  })

  revalidatePath(`/admin/apps/${slug}`)
  return success(role === null ? 'Đã gỡ quyền.' : 'Đã cập nhật quyền.')
}
