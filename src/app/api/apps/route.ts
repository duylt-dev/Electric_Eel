import { AppErrors } from '@/core/result'
import { serverContainer } from '@/di/server'
import { isPackageName } from '@/domain/identity/entities/FirebaseAppSummary'
import { jsonError, jsonOk } from '@/lib/api/response'
import { requestInfo } from '@/lib/requestInfo'
import { requireUser } from '@/lib/session'

/** Danh sách app người đang đăng nhập được phép thấy. */
export async function GET() {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)

  const apps = await serverContainer.appDirectory.listAppsForUser(user.value)
  if (!apps.ok) return jsonError(apps.error)

  return jsonOk({ apps: apps.value })
}

export async function POST(request: Request) {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)
  if (user.value.role !== 'ADMIN') {
    return jsonError(AppErrors.forbidden('Chỉ quản trị hệ thống mới tạo được app.'))
  }

  const body = (await request.json().catch(() => null)) as {
    slug?: string
    displayName?: string
    projectId?: string
    packageName?: string
  } | null

  const slug = body?.slug?.trim() ?? ''
  const displayName = body?.displayName?.trim() ?? ''
  const projectId = body?.projectId?.trim() ?? ''
  const packageName = body?.packageName?.trim() ?? ''

  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug)) {
    return jsonError(
      AppErrors.validation('Định danh chỉ gồm chữ thường, số và dấu gạch ngang, dài 3–50 ký tự.'),
    )
  }
  if (displayName.length === 0 || projectId.length === 0) {
    return jsonError(AppErrors.validation('Cần điền cả tên hiển thị và Project ID của Firebase.'))
  }
  if (packageName.length > 0 && !isPackageName(packageName)) {
    return jsonError(
      AppErrors.validation(`"${packageName}" không giống một package name. Dạng đúng: com.pion.lovetest`),
    )
  }

  const created = await serverContainer.appDirectory.createApp({
    slug,
    displayName,
    projectId,
    packageName: packageName.length === 0 ? null : packageName,
    createdById: user.value.id,
  })
  if (!created.ok) return jsonError(created.error)

  await serverContainer.audit.record({
    ...(await requestInfo()),
    action: 'APP_CREATE',
    userId: user.value.id,
    appId: created.value.id,
    detail: `${displayName} (${projectId})`,
  })

  return jsonOk({ app: created.value }, { status: 201 })
}
