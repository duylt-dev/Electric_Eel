import { AppErrors } from '@/core/result'
import { serverContainer } from '@/di/server'
import { connectDevice, disconnectDevice, listDevices } from '@/domain/adb/usecases/adbCommands'
import { jsonError, jsonOk, readJsonBody } from '@/lib/api/response'
import { requireUser } from '@/lib/session'

/**
 * Danh sách thiết bị adb đang nhìn thấy, và nút nối thêm máy qua mạng.
 *
 * Cả hai phương thức đều trả về CÙNG một hình dạng — danh sách thiết bị sau
 * thao tác. Nhờ vậy màn hình không phải tự đoán trạng thái mới sau khi nối:
 * nối xong là đã có danh sách đúng trong tay, không cần một lượt gọi thứ hai
 * và không có khoảng thời gian nào màn hình hiển thị sai.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface DeviceActionBody {
  action?: unknown
  address?: unknown
}

export async function GET() {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)

  const settings = serverContainer.adb.settings()
  if (!settings.ok) return jsonError(settings.error)

  const devices = await listDevices(serverContainer.adb.shell)
  if (!devices.ok) return jsonError(devices.error)

  return jsonOk({ devices: devices.value })
}

export async function POST(request: Request) {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)

  const settings = serverContainer.adb.settings()
  if (!settings.ok) return jsonError(settings.error)

  const body = await readJsonBody<DeviceActionBody>(request)
  if (body === null) {
    return jsonError(AppErrors.validation('Nội dung yêu cầu không phải JSON hợp lệ.'))
  }

  const address = typeof body.address === 'string' ? body.address.trim() : ''
  if (address.length === 0) {
    return jsonError(AppErrors.validation('Chưa nhập địa chỉ thiết bị.'))
  }

  const shell = serverContainer.adb.shell

  // Kiểm dạng địa chỉ nằm trong chính hai use case dưới đây, không lặp lại ở
  // đây: một luật kiểm tra viết ở hai chỗ là một luật sẽ lệch nhau.
  const acted =
    body.action === 'disconnect'
      ? await disconnectDevice(shell, address)
      : body.action === 'connect'
        ? await connectDevice(shell, address)
        : null

  if (acted === null) {
    return jsonError(AppErrors.validation('`action` phải là "connect" hoặc "disconnect".'))
  }
  if (!acted.ok) return jsonError(acted.error)

  const devices = await listDevices(shell)
  if (!devices.ok) return jsonError(devices.error)

  return jsonOk({ devices: devices.value })
}
