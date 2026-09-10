import { AppErrors } from '@/core/result'
import { serverContainer } from '@/di/server'
import { isLlmProvider } from '@/domain/translation/entities/LlmProvider'
import { jsonError, jsonOk } from '@/lib/api/response'
import { requireUser } from '@/lib/session'

/**
 * Danh sách model theo khoá ĐÃ lưu của người dùng.
 *
 * Khác `POST /credential` ở nguồn khoá: bên kia nhận khoá mới từ thân yêu cầu,
 * bên này lấy khoá đã lưu. Nhờ vậy ô chọn model nạp lại được sau khi tải trang
 * mà khoá không phải đi qua dây thêm một lần nào nữa.
 *
 * Nạp LƯỜI — màn hình chỉ gọi khi người dùng mở ô chọn. Gọi sẵn lúc dựng trang
 * nghĩa là mọi lượt vào trang đều tốn một lượt gọi ra ngoài, kể cả lượt chỉ vào
 * để bấm dịch bằng đúng model đã chọn từ trước.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)

  const provider = new URL(request.url).searchParams.get('provider')
  if (!isLlmProvider(provider)) {
    return jsonError(AppErrors.validation('Nhà cung cấp không hợp lệ. Chọn "openai" hoặc "gemini".'))
  }

  const credential = await serverContainer.translation.settings.resolve(user.value.id, provider)
  if (!credential.ok) return jsonError(credential.error)
  if (credential.value === null) {
    return jsonError(AppErrors.validation('Chưa có khoá API cho nhà cung cấp này.'))
  }

  const models = await serverContainer.translation.models.list(
    provider,
    credential.value.apiKey,
    request.signal,
  )
  if (!models.ok) return jsonError(models.error)

  return jsonOk({ models: models.value })
}
