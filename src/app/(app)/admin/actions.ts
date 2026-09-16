'use server'

import { revalidatePath } from 'next/cache'

import { serverContainer } from '@/di/server'
import { isPackageName } from '@/domain/identity/entities/FirebaseAppSummary'
import type { AppRole } from '@/domain/identity/entities/Permission'
import { requireAdmin } from '@/lib/session'
import { failure, success } from '../actionState'
import type { ActionState } from '../actionState'
import { recordAudit } from './recordAudit'

/**
 * Thao tác quản trị.
 *
 * Mỗi hàm tự gọi `requireAdmin()` ngay dòng đầu. Không hàm nào tin rằng nút bấm
 * gọi nó đã bị ẩn với người không đủ quyền — server action là một endpoint HTTP
 * như mọi endpoint khác, và gọi thẳng vào nó không khó.
 *
 * File này là thao tác trên APP; thao tác trên tài khoản ở `users/actions.ts`.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/

/** Đọc ba trường mô tả app từ biểu mẫu, dùng chung cho tạo và sửa. */
const readAppFields = (formData: FormData) => ({
  displayName: String(formData.get('displayName') ?? '').trim(),
  projectId: String(formData.get('projectId') ?? '').trim(),
  packageName: String(formData.get('packageName') ?? '').trim(),
})

const validateAppFields = (fields: ReturnType<typeof readAppFields>): string | null => {
  if (fields.displayName.length === 0 || fields.projectId.length === 0) {
    return 'Cần điền cả tên hiển thị và Project ID.'
  }
  if (fields.packageName.length > 0 && !isPackageName(fields.packageName)) {
    return `"${fields.packageName}" không giống một package name. Dạng đúng: com.pion.lovetest`
  }
  return null
}

export async function createAppAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  if (!admin.ok) return failure(admin.error.message)

  const slug = String(formData.get('slug') ?? '').trim()
  const fields = readAppFields(formData)

  if (!SLUG.test(slug)) {
    return failure('Định danh chỉ gồm chữ thường, số và gạch ngang, dài 3–50 ký tự.')
  }
  const invalid = validateAppFields(fields)
  if (invalid !== null) return failure(invalid)

  const created = await serverContainer.appDirectory.createApp({
    slug,
    displayName: fields.displayName,
    projectId: fields.projectId,
    packageName: fields.packageName.length === 0 ? null : fields.packageName,
    createdById: admin.value.id,
  })
  if (!created.ok) return failure(created.error.message)

  await recordAudit({
    action: 'APP_CREATE',
    userId: admin.value.id,
    appId: created.value.id,
    detail: `${fields.displayName} (${fields.projectId})`,
  })

  revalidatePath('/admin/apps')
  revalidatePath('/remote-config')
  return success(`Đã tạo app "${fields.displayName}". Bước tiếp theo là gắn service account.`)
}

/**
 * Sửa tên, Project ID, package name và trạng thái của app.
 *
 * Không sửa được slug — xem `UpdateAppInput`. Đổi Project ID trong khi service
 * account cũ vẫn gắn thì lần publish tới sẽ lỗi vì hai bên lệch project; câu
 * báo thành công nói trước điều đó thay vì để người dùng gặp lỗi sau.
 */
export async function updateAppAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  if (!admin.ok) return failure(admin.error.message)

  const slug = String(formData.get('slug') ?? '')
  const fields = readAppFields(formData)
  const isActive = formData.get('isActive') === 'on'

  const invalid = validateAppFields(fields)
  if (invalid !== null) return failure(invalid)

  const updated = await serverContainer.appDirectory.updateApp(slug, {
    displayName: fields.displayName,
    projectId: fields.projectId,
    packageName: fields.packageName.length === 0 ? null : fields.packageName,
    isActive,
  })
  if (!updated.ok) return failure(updated.error.message)

  await recordAudit({
    action: 'APP_UPDATE',
    userId: admin.value.id,
    appId: updated.value.id,
    detail: `${fields.displayName} (${fields.projectId})${isActive ? '' : ' · đã ngừng'}`,
  })

  revalidatePath('/admin/apps')
  revalidatePath(`/admin/apps/${slug}`)
  revalidatePath('/remote-config')

  const projectMismatch =
    updated.value.hasCredential &&
    updated.value.credentialClientEmail !== null &&
    !updated.value.credentialClientEmail.endsWith(`@${fields.projectId}.iam.gserviceaccount.com`)
  return success(
    projectMismatch
      ? `Đã lưu "${fields.displayName}". Service account đang gắn thuộc project khác — thay nó trước khi publish.`
      : `Đã lưu "${fields.displayName}".`,
  )
}

/**
 * Xoá hẳn app. Nhật ký ghi với `appId` rỗng và tên app trong `detail`: hàng
 * app không còn để trỏ tới, mà ghi trước rồi xoá thì khoá ngoại cũng về null
 * — chỉ khác là mất luôn cái tên.
 */
export async function deleteAppAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  if (!admin.ok) return failure(admin.error.message)

  const slug = String(formData.get('slug') ?? '')
  const confirm = String(formData.get('confirm') ?? '').trim()
  if (confirm !== slug) {
    return failure(`Gõ đúng định danh "${slug}" để xác nhận xoá.`)
  }

  const deleted = await serverContainer.appDirectory.deleteApp(slug)
  if (!deleted.ok) return failure(deleted.error.message)

  await recordAudit({
    action: 'APP_DELETE',
    userId: admin.value.id,
    targetKey: slug,
    detail: `${deleted.value.displayName} (${deleted.value.projectId})`,
  })

  revalidatePath('/admin/apps')
  revalidatePath('/remote-config')
  return success(`Đã xoá app "${deleted.value.displayName}" cùng toàn bộ phân quyền của nó.`)
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
