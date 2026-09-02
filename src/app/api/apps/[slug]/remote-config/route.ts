import { AppErrors } from '@/core/result'
import { serverContainer } from '@/di/server'
import type { RemoteConfigTemplate } from '@/domain/remote-config/entities/RemoteConfigTemplate'
import { jsonError, jsonOk, readJsonBody } from '@/lib/api/response'
import { requestInfo } from '@/lib/requestInfo'
import { requireAppAccess } from '@/lib/session'

interface RouteContext {
  params: Promise<{ slug: string }>
}

/** Lấy template hiện hành kèm ETag. Trình duyệt dựng không gian làm việc từ đây. */
export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params

  const access = await requireAppAccess(slug, 'VIEWER')
  if (!access.ok) return jsonError(access.error)

  const fetched = await serverContainer.remoteConfig.fetchTemplate(slug)
  if (!fetched.ok) {
    await serverContainer.audit.record({
      ...(await requestInfo()),
      action: 'TEMPLATE_FETCH',
      userId: access.value.user.id,
      appId: access.value.app.id,
      detail: fetched.error.message,
      succeeded: false,
    })
    return jsonError(fetched.error)
  }

  return jsonOk({ template: fetched.value.template, etag: fetched.value.etag })
}

/**
 * Đẩy template lên Firebase.
 *
 * ETag đi trong header `If-Match` đúng như giao thức thật, chứ không nhét vào
 * thân yêu cầu. Thiếu header này thì từ chối ngay — không có đường nào ghi đè
 * mà không nói rõ mình đang ghi đè lên bản nào.
 */
export async function PUT(request: Request, context: RouteContext) {
  const { slug } = await context.params

  const access = await requireAppAccess(slug, 'PUBLISHER')
  if (!access.ok) return jsonError(access.error)

  const etag = request.headers.get('if-match')
  if (etag === null || etag.length === 0 || etag === '*') {
    return jsonError(
      AppErrors.validation('Thiếu header If-Match hợp lệ. Tải lại cấu hình rồi thử lại.'),
    )
  }

  const body = await readJsonBody<{ template?: RemoteConfigTemplate }>(request)
  if (body?.template === undefined) {
    return jsonError(AppErrors.validation('Thiếu template trong nội dung yêu cầu.'))
  }

  const published = await serverContainer.remoteConfig.publishTemplate(slug, body.template, etag)

  await serverContainer.audit.record({
      ...(await requestInfo()),
    action: 'TEMPLATE_PUBLISH',
    userId: access.value.user.id,
    appId: access.value.app.id,
    detail: published.ok ? `etag ${etag} → ${published.value.etag}` : published.error.message,
    succeeded: published.ok,
  })

  if (!published.ok) return jsonError(published.error)
  return jsonOk({ template: published.value.template, etag: published.value.etag })
}
