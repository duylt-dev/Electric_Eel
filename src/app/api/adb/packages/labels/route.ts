import { AppErrors } from '@/core/result'
import { serverContainer } from '@/di/server'
import { isSafeSerial } from '@/domain/adb/entities/AdbDevice'
import type { PackageLabelEvent } from '@/domain/adb/entities/PackageLabelEvent'
import { listInstalledPackages } from '@/domain/adb/usecases/adbCommands'
import { readPackageLabels } from '@/domain/adb/usecases/readPackageLabels'
import { jsonError } from '@/lib/api/response'
import { requireUser } from '@/lib/session'

/**
 * Tên hiển thị của các app trên một thiết bị, chảy về dưới dạng NDJSON.
 *
 * Tách khỏi `GET /api/adb/packages` vì hai thứ tốn khác nhau: danh sách về
 * trong một lệnh adb, còn nhãn phải đọc từng APK (`AaptLabelReader`). Trình
 * duyệt gọi cái thứ nhất, vẽ ngay, rồi mở luồng này để điền tên vào thẻ.
 *
 * Luồng sống theo request: đổi máy hay đóng tab là `request.signal` huỷ và
 * lượt đọc dừng giữa chừng — không có nhãn nào đọc dở bị ghi vào cache.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)

  const settings = serverContainer.adb.settings()
  if (!settings.ok) return jsonError(settings.error)

  const serial = new URL(request.url).searchParams.get('serial')?.trim() ?? ''
  if (!isSafeSerial(serial)) {
    return jsonError(AppErrors.validation('Serial thiết bị không hợp lệ.'))
  }

  const packages = await listInstalledPackages(serverContainer.adb.shell, serial, request.signal)
  if (!packages.ok) return jsonError(packages.error)

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (event: PackageLabelEvent): void => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          closed = true
        }
      }

      const outcome = await readPackageLabels(
        serverContainer.adb.labels,
        serial,
        packages.value,
        (packageName, label) => send({ type: 'label', packageName, label }),
        request.signal,
      )

      if (!outcome.ok && outcome.error.kind !== 'cancelled') {
        send({ type: 'unavailable', message: outcome.error.message })
      }
      send({ type: 'done' })

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
