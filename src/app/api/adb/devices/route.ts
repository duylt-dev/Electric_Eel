import { serverContainer } from '@/di/server'
import { listDevices } from '@/domain/adb/usecases/adbCommands'
import { jsonError, jsonOk } from '@/lib/api/response'
import { requireUser } from '@/lib/session'

/**
 * Danh sách thiết bị adb đang nhìn thấy.
 *
 * CHỈ ĐỌC. Không có đường nào để trang này bảo adb nối thêm máy: đội chỉ cắm
 * cáp USB, nên một endpoint nhận địa chỉ máy từ trình duyệt là một mặt tấn
 * công mở ra cho một cách dùng không ai dùng.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)

  const settings = serverContainer.adb.settings()
  if (!settings.ok) return jsonError(settings.error)

  const devices = await listDevices(serverContainer.adb.shell)
  if (!devices.ok) return jsonError(devices.error)

  return jsonOk({ devices: devices.value })
}
