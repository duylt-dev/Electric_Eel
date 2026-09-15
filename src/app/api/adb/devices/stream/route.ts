import { serverContainer } from '@/di/server'
import type { DeviceWatchEvent } from '@/domain/adb/entities/DeviceWatchEvent'
import { watchDevices } from '@/domain/adb/usecases/watchDevices'
import { jsonError } from '@/lib/api/response'
import { requireUser } from '@/lib/session'

/**
 * Theo dõi thiết bị adb, chảy về dưới dạng NDJSON: cắm cáp vào là danh sách
 * mới về trong vòng một giây, không phải bấm gì.
 *
 * Như `GET /api/adb/devices`, luồng này CHỈ ĐỌC — không có tham số nào, nên
 * không có đường nào để trình duyệt bảo adb nối tới đâu.
 *
 * Luồng sống theo request: đóng tab là `request.signal` huỷ và vòng hỏi dừng.
 * Mỗi tab mở màn chọn máy là một vòng hỏi riêng; `adb devices` trên cùng máy
 * chủ tốn vài mili giây nên vài tab cùng lúc không thành vấn đề.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)

  const settings = serverContainer.adb.settings()
  if (!settings.ok) return jsonError(settings.error)

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (event: DeviceWatchEvent): void => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          closed = true
        }
      }

      await watchDevices(serverContainer.adb.shell, send, request.signal)

      if (!closed) {
        try {
          controller.close()
        } catch {
          // Đã đóng từ phía kia.
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
