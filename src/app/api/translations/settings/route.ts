import { AppErrors } from '@/core/result'
import { serverContainer } from '@/di/server'
import { isLlmProvider } from '@/domain/translation/entities/LlmProvider'
import {
  MAX_APP_DESCRIPTION_LENGTH,
  MAX_APP_NAME_LENGTH,
} from '@/domain/translation/entities/TranslationSettings'
import type { TranslationSettingsPatch } from '@/domain/translation/entities/TranslationSettings'
import { jsonError, jsonOk, readJsonBody } from '@/lib/api/response'
import { requireUser } from '@/lib/session'

/**
 * Ghi phần cấu hình KHÔNG phải khoá: nhà cung cấp, model, tên và mô tả app.
 *
 * Trả về nguyên trạng thái sau khi ghi thay vì `204`. Đổi nhà cung cấp kéo theo
 * model đổi sang model của bên kia, mà màn hình không tự suy ra được điều đó —
 * để nó tự đoán là mở đường cho hai bên lệch nhau.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(request: Request) {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)

  const body = await readJsonBody<Record<string, unknown>>(request)
  if (body === null) {
    return jsonError(AppErrors.validation('Nội dung yêu cầu không phải JSON hợp lệ.'))
  }

  if (body.provider !== undefined && !isLlmProvider(body.provider)) {
    return jsonError(AppErrors.validation('Nhà cung cấp không hợp lệ. Chọn "openai" hoặc "gemini".'))
  }

  const text = (value: unknown, max: number): string | undefined =>
    typeof value === 'string' ? value.slice(0, max) : undefined

  const patch: TranslationSettingsPatch = {
    ...(isLlmProvider(body.provider) ? { provider: body.provider } : {}),
    ...(typeof body.model === 'string' && body.model.trim().length > 0
      ? { model: body.model }
      : {}),
    ...(text(body.appName, MAX_APP_NAME_LENGTH) !== undefined
      ? { appName: text(body.appName, MAX_APP_NAME_LENGTH) as string }
      : {}),
    ...(text(body.appDescription, MAX_APP_DESCRIPTION_LENGTH) !== undefined
      ? { appDescription: text(body.appDescription, MAX_APP_DESCRIPTION_LENGTH) as string }
      : {}),
  }

  const saved = await serverContainer.translation.settings.savePreference(user.value.id, patch)
  if (!saved.ok) return jsonError(saved.error)

  const settings = await serverContainer.translation.settings.read(user.value.id)
  if (!settings.ok) return jsonError(settings.error)

  return jsonOk(settings.value)
}
