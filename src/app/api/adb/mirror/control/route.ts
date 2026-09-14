import { AppErrors } from '@/core/result'
import { serverContainer } from '@/di/server'
import { dispatchMirrorControl } from '@/domain/device-mirror/usecases/dispatchMirrorControl'
import { jsonError, jsonOk } from '@/lib/api/response'
import { requireUser } from '@/lib/session'

/**
 * Một lô thông điệp điều khiển (chạm, phím, cuộn…) gửi tới một phiên mirror
 * ĐANG chạy — không mở luồng, không chạm Tango trực tiếp ở đây. `route`
 * `/stream` giữ phiên thật; route này chỉ tra `sessionId` trong registry rồi
 * forward, nên phải trả nhanh (được gọi vài chục lần/giây khi người dùng kéo/
 * vuốt liên tục).
 */
export async function POST(request: Request) {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)

  const adbSettings = serverContainer.adb.settings()
  if (!adbSettings.ok) return jsonError(adbSettings.error)

  let body: { sessionId?: unknown; messages?: unknown } | null = null
  try {
    body = (await request.json()) as { sessionId?: unknown; messages?: unknown }
  } catch {
    return jsonError(AppErrors.validation('Nội dung yêu cầu không phải JSON hợp lệ.'))
  }

  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
  if (sessionId.length === 0) {
    return jsonError(AppErrors.validation('Thiếu sessionId.'))
  }

  const accepted = await dispatchMirrorControl(
    { registry: serverContainer.deviceMirror.sessions },
    sessionId,
    user.value.id,
    body?.messages,
  )
  if (!accepted.ok) return jsonError(accepted.error)

  return jsonOk({ accepted: accepted.value })
}
