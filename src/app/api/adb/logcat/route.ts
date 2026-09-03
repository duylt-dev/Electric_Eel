import { AppErrors } from '@/core/result'
import { serverContainer } from '@/di/server'
import { isSafeSerial } from '@/domain/adb/entities/AdbDevice'
import { isSafePackageName } from '@/domain/adb/entities/AndroidPackage'
import type { LogcatEvent, LogcatRequest } from '@/domain/adb/entities/LogcatSession'
import { clearLogcatBuffer } from '@/domain/adb/usecases/adbCommands'
import { followAppLogcat } from '@/domain/adb/usecases/followAppLogcat'
import { jsonError, jsonOk } from '@/lib/api/response'
import { requestInfo } from '@/lib/requestInfo'
import { requireUser } from '@/lib/session'

/**
 * Luồng log của một app, chảy về dưới dạng NDJSON.
 *
 * ─── Vì sao gom dòng lại rồi mới đẩy ───
 *
 * Một app đang khởi động in ra vài nghìn dòng trong hai giây. Mỗi dòng một sự
 * kiện JSON nghĩa là vài nghìn lượt ghi vào luồng, vài nghìn lượt `JSON.parse`
 * bên kia, và vài nghìn lượt cập nhật state — trình duyệt đứng hình đúng lúc
 * người dùng cần nhìn nhất. Gom theo nhịp 100ms biến chỗ đó thành hai chục
 * lượt, mà mắt người không phân biệt được khác biệt.
 *
 * Nhịp gom nằm ở ĐÂY chứ không nằm trong use case: use case nói về việc bám
 * theo pid, còn gom bao nhiêu dòng một lượt là chuyện của đường truyền.
 *
 * ─── Vòng đời ───
 *
 * Luồng sống đúng bằng vòng đời request. Trình duyệt đóng tab thì Next huỷ
 * `request.signal`, use case thoát vòng lặp, `spawn` bị giết. Không có tiến
 * trình adb nào ở lại sau khi không còn ai đọc.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Gom tối đa chừng này dòng, hoặc chừng này mili giây — cái nào tới trước. */
const FLUSH_LINES = 300
const FLUSH_MS = 100

export async function POST(request: Request) {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)

  const settings = serverContainer.adb.settings()
  if (!settings.ok) return jsonError(settings.error)

  let body: LogcatRequest | null = null
  try {
    body = (await request.json()) as LogcatRequest
  } catch {
    return jsonError(AppErrors.validation('Nội dung yêu cầu không phải JSON hợp lệ.'))
  }

  const serial = typeof body?.serial === 'string' ? body.serial.trim() : ''
  const packageName = typeof body?.packageName === 'string' ? body.packageName.trim() : ''

  // Kiểm ở đây để một yêu cầu sai được trả lời bằng mã 400 THẲNG, thay vì mở
  // một luồng rồi mới báo lỗi trong dòng đầu tiên của nó. Bên kia là màn hình
  // của mình, nhưng một lệnh gọi API viết tay cũng đi vào đúng chỗ này.
  if (!isSafeSerial(serial)) {
    return jsonError(AppErrors.validation('Serial thiết bị không hợp lệ.'))
  }
  if (!isSafePackageName(packageName)) {
    return jsonError(AppErrors.validation('Tên package không hợp lệ.'))
  }

  const clearFirst = body?.clearFirst === true
  const origin = await requestInfo()

  await serverContainer.audit.record({
    ...origin,
    action: 'LOGCAT_STREAM',
    userId: user.value.id,
    targetKey: packageName,
    detail: `thiết bị ${serial}`,
  })

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false

      const send = (event: LogcatEvent): void => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          // Trình duyệt đã đóng kết nối. Không còn ai nghe, nên ngừng ghi.
          closed = true
        }
      }

      let pending: string[] = []
      const flush = (): void => {
        if (pending.length === 0) return
        const lines = pending
        pending = []
        send({ type: 'lines', lines })
      }

      const ticker = setInterval(flush, FLUSH_MS)

      const outcome = await followAppLogcat(
        { shell: serverContainer.adb.shell },
        { serial, packageName, clearFirst },
        (event) => {
          if (event.type === 'line') {
            pending.push(event.line)
            if (pending.length >= FLUSH_LINES) flush()
            return
          }
          // Mọi sự kiện khác đánh dấu một mốc trong luồng (bám được pid, app
          // vừa chết). Xả hàng đợi trước khi gửi, nếu không thì các dòng cuối
          // của tiến trình cũ sẽ hiện ra SAU thông báo "app đã thoát".
          flush()
          send(event)
        },
        request.signal,
      )

      clearInterval(ticker)
      flush()

      if (!outcome.ok && outcome.error.kind !== 'cancelled') {
        send({
          type: 'failed',
          kind: outcome.error.kind,
          message: outcome.error.message,
          ...(outcome.error.detail !== undefined ? { detail: outcome.error.detail } : {}),
        })
      }

      closed = true
      try {
        controller.close()
      } catch {
        // Kết nối đã đứt trước đó. Không có gì phải dọn thêm.
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      // Nói với nginx đứng trước: đừng gom bộ đệm. Không có dòng này thì log
      // về thành từng cục vài chục KB và mất hết ý nghĩa thời gian thực.
      'X-Accel-Buffering': 'no',
    },
  })
}

/** `adb logcat -c` — xoá đệm log NẰM TRÊN MÁY. Khác với xoá màn hình. */
export async function DELETE(request: Request) {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)

  const settings = serverContainer.adb.settings()
  if (!settings.ok) return jsonError(settings.error)

  const serial = new URL(request.url).searchParams.get('serial')?.trim() ?? ''
  if (serial.length === 0) {
    return jsonError(AppErrors.validation('Thiếu serial thiết bị.'))
  }

  const cleared = await clearLogcatBuffer(serverContainer.adb.shell, serial, request.signal)
  if (!cleared.ok) return jsonError(cleared.error)

  return jsonOk({ cleared: true })
}
