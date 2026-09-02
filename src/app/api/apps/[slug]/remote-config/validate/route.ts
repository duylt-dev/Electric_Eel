import { AppErrors } from '@/core/result'
import { serverContainer } from '@/di/server'
import type { RemoteConfigTemplate } from '@/domain/remote-config/entities/RemoteConfigTemplate'
import { jsonError, jsonOk, readJsonBody } from '@/lib/api/response'
import { requestInfo } from '@/lib/requestInfo'
import { requireAppAccess } from '@/lib/session'

interface RouteContext {
  params: Promise<{ slug: string }>
}

/**
 * Nhờ chính Firebase kiểm tra template mà không ghi gì (`?validate_only=true`).
 *
 * Đây là cách duy nhất đáng tin để biết một biểu thức điều kiện có hợp lệ hay
 * không: cú pháp ấy do Firebase định nghĩa và họ có thể đổi. Dựng lại bộ phân
 * tích của họ trong tool rồi tin vào nó là tự chuốc lấy một bản sao sẽ lệch dần.
 */
export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params

  const access = await requireAppAccess(slug, 'EDITOR')
  if (!access.ok) return jsonError(access.error)

  const body = await readJsonBody<{ template?: RemoteConfigTemplate }>(request)
  if (body?.template === undefined) {
    return jsonError(AppErrors.validation('Thiếu template trong nội dung yêu cầu.'))
  }

  const validated = await serverContainer.remoteConfig.validateTemplate(slug, body.template)

  await serverContainer.audit.record({
      ...(await requestInfo()),
    action: 'TEMPLATE_VALIDATE',
    userId: access.value.user.id,
    appId: access.value.app.id,
    detail: validated.ok ? 'hợp lệ' : validated.error.message,
    succeeded: validated.ok,
  })

  if (!validated.ok) return jsonError(validated.error)
  return jsonOk({ valid: true })
}
