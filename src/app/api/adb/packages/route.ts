import { AppErrors } from '@/core/result'
import { serverContainer } from '@/di/server'
import { listPackages } from '@/domain/adb/usecases/adbCommands'
import { jsonError, jsonOk } from '@/lib/api/response'
import { requireUser } from '@/lib/session'

/**
 * applicationId của các app đang cài trên một thiết bị.
 *
 * Trả về danh sách TRẦN, không kèm nhãn: lấy tên hiển thị của từng app phải
 * `dumpsys package` từng cái một, tức là hàng trăm lượt gọi adb cho một lần mở
 * trang. Nhãn được ghép ở trình duyệt từ danh bạ app của tool — app của đội có
 * tên, app ngoài thì package name đã là cái tên người ta tìm.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)

  const settings = serverContainer.adb.settings()
  if (!settings.ok) return jsonError(settings.error)

  const params = new URL(request.url).searchParams
  const serial = params.get('serial')?.trim() ?? ''
  if (serial.length === 0) {
    return jsonError(AppErrors.validation('Thiếu serial thiết bị.'))
  }

  const includeSystem = params.get('system') === '1'

  const packages = await listPackages(serverContainer.adb.shell, serial, includeSystem, request.signal)
  if (!packages.ok) return jsonError(packages.error)

  return jsonOk({ packages: packages.value })
}
