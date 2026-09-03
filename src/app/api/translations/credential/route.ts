import { AppErrors } from '@/core/result'
import { serverContainer } from '@/di/server'
import { LLM_PROVIDER_INFO, inspectApiKeyShape, isLlmProvider, keyHintOf } from '@/domain/translation/entities/LlmProvider'
import type { CredentialCheckResult } from '@/domain/translation/entities/TranslationSettings'
import { jsonError, jsonOk, readJsonBody } from '@/lib/api/response'
import { requireUser } from '@/lib/session'

/**
 * Gắn khoá API của một người dùng cho một nhà cung cấp.
 *
 * Trình tự cố ý là XÁC THỰC TRƯỚC, GHI SAU:
 *
 *   1. Soi hình dạng khoá — bắt lỗi dán nhầm mà không tốn lượt gọi mạng nào.
 *   2. Hỏi nhà cung cấp danh sách model bằng chính khoá đó. Khoá sai thì bước
 *      này trả 401 và không có gì được ghi xuống.
 *   3. Chỉ khi bước 2 xong mới ghi bản mã xuống DB.
 *
 * Đảo hai bước cuối lại thì một khoá gõ sai sẽ ĐÈ LÊN khoá đang chạy được, và
 * người dùng mất cấu hình cũ vì một lần dán nhầm.
 *
 * Không ghi nhật ký thao tác ở đây. Đây là cấu hình cá nhân của một người trên
 * tài khoản của chính họ, không phải một thao tác trên dữ liệu dùng chung như
 * `APP_CREDENTIAL_SET`.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CredentialBody {
  provider?: unknown
  apiKey?: unknown
}

export async function POST(request: Request) {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)

  const body = await readJsonBody<CredentialBody>(request)
  if (body === null) {
    return jsonError(AppErrors.validation('Nội dung yêu cầu không phải JSON hợp lệ.'))
  }

  if (!isLlmProvider(body.provider)) {
    return jsonError(AppErrors.validation('Nhà cung cấp không hợp lệ. Chọn "openai" hoặc "gemini".'))
  }
  const provider = body.provider

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const shape = inspectApiKeyShape(provider, apiKey)
  if (!shape.ok) {
    return jsonError(AppErrors.validation(shape.message ?? 'Khoá API không hợp lệ.'))
  }

  // Xác thực bằng chính lượt gọi lấy danh sách model: khoá sai thì trả 401 ngay,
  // và không tiêu một token nào.
  const models = await serverContainer.translation.models.list(provider, apiKey, request.signal)
  if (!models.ok) return jsonError(models.error)

  // Giữ lại model cũ nếu khoá mới vẫn dùng được nó — đổi khoá không phải là lý
  // do để bản dịch tiếp theo đổi sang một model khác mà người dùng không chọn.
  const settings = await serverContainer.translation.settings.read(user.value.id)
  const previous = settings.ok
    ? settings.value.credentials.find((credential) => credential.provider === provider)?.model
    : undefined

  const fallback = LLM_PROVIDER_INFO[provider].defaultModel
  const model =
    previous !== undefined && models.value.includes(previous)
      ? previous
      : models.value.includes(fallback)
        ? fallback
        : (models.value[0] as string)

  const saved = await serverContainer.translation.settings.saveCredential(
    user.value.id,
    provider,
    apiKey,
    model,
  )
  if (!saved.ok) return jsonError(saved.error)

  // Phản hồi KHÔNG mang khoá về, chỉ mang bốn ký tự cuối.
  return jsonOk<CredentialCheckResult>({
    provider,
    keyHint: keyHintOf(apiKey),
    model,
    models: models.value,
  })
}
