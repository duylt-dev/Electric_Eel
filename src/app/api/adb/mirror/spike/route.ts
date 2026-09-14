/* eslint-disable no-restricted-imports -- mã spike phase 01, phase 03/05 thay bằng adapter trong data/ rồi xoá */
import { spawnSync } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'

import { AdbServerClient } from '@yume-chan/adb'
import { AdbScrcpyClient, AdbScrcpyExitedError, AdbScrcpyOptions3_3_3 } from '@yume-chan/adb-scrcpy'
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp'
import { DefaultServerPath, ScrcpyInstanceId } from '@yume-chan/scrcpy'

import { AppErrors, attemptAsync } from '@/core/result'
import { readAdbSettings } from '@/data/adb/adbSettings'
import { isSafeSerial } from '@/domain/adb/entities/AdbDevice'
import { jsonError } from '@/lib/api/response'
import { requireUser } from '@/lib/session'

/**
 * Route TẠM của spike phase 01 — phase 03 thay bằng gateway thật trong `data/`
 * đi qua `di/server`. Import `@yume-chan/*` thẳng ở đây là ngoại lệ đã ghi
 * trong phase; luật ESLint cấm việc này ở tầng khác đến ở phase 02.
 *
 * Không dùng `ReadableStream` khởi tạo xong rồi mới nối máy (như route
 * logcat) — cố tình làm ngược: nối máy, đẩy jar, chờ `videoStream` xong HẲN
 * rồi mới trả `Response`. Lý do: bắt tay với scrcpy-server hỏng được ở nhiều
 * bước (adb không thấy máy, version lệch, server thoát), và một `Response`
 * JSON lỗi rõ ràng hữu ích hơn nhiều một luồng nhị phân vỡ giữa chừng.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KIND_CONFIG = 2
const KIND_FRAME = 3

/** `[u32 BE len][u8 kind][payload]` — `len` đếm luôn byte `kind`. */
function encodeMessage(kind: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + 1 + payload.byteLength)
  new DataView(out.buffer).setUint32(0, 1 + payload.byteLength, false)
  out[4] = kind
  out.set(payload, 5)
  return out
}

/** Payload của kind=3: `[u8 keyframe][u64 BE pts][data]`. */
function encodeFramePayload(keyframe: boolean, pts: bigint, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + 8 + data.byteLength)
  out[0] = keyframe ? 1 : 0
  new DataView(out.buffer).setBigUint64(1, pts, false)
  out.set(data, 9)
  return out
}

type JarStream = Parameters<typeof AdbScrcpyClient.pushServer>[1]

export async function POST(request: Request) {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)

  // Cờ chặn thứ hai, không thay cho cờ thứ nhất (ADB_ENABLED bên dưới): route
  // này sinh `app_process` trên máy chủ, một máy dùng chung không nên có nó.
  if (process.env.NODE_ENV === 'production') {
    return jsonError(AppErrors.notFound('Route thăm dò mirror không chạy ở production.'))
  }

  const settings = readAdbSettings()
  if (!settings.ok) return jsonError(settings.error)

  const raw = await request.text()
  if (raw.length === 0) {
    // Đo RTT control (xem trang tạm): thân rỗng = chỉ đo khứ hồi request,
    // không mở phiên video thật — 20 lượt/giây mà mở scrcpy thật thì sẽ đo
    // nhầm chi phí bắt tay thay vì chi phí một round-trip HTTP.
    return new Response(null, { status: 204 })
  }

  let body: { serial?: unknown } | null = null
  try {
    body = JSON.parse(raw) as { serial?: unknown }
  } catch {
    return jsonError(AppErrors.validation('Nội dung yêu cầu không phải JSON hợp lệ.'))
  }
  const serial = typeof body?.serial === 'string' ? body.serial.trim() : ''
  if (!isSafeSerial(serial)) return jsonError(AppErrors.validation('Serial thiết bị không hợp lệ.'))

  spawnSync(settings.value.binary, ['start-server'])

  const connector = new AdbServerNodeTcpConnector({ host: '127.0.0.1', port: 5037 })
  const client = new AdbServerClient(connector)

  const adbResult = await attemptAsync(
    () => client.createAdb({ serial }),
    `Không nối được adb tới ${serial}. Thiết bị có đang cắm và ở trạng thái "device" không?`,
  )
  if (!adbResult.ok) return jsonError(adbResult.error)
  const adb = adbResult.value

  const serverPath = process.env.SCRCPY_SERVER_PATH?.trim() || '/opt/homebrew/share/scrcpy/scrcpy-server'
  const version = process.env.SCRCPY_SERVER_VERSION?.trim() || '3.3.4'

  const pushResult = await attemptAsync(
    () =>
      AdbScrcpyClient.pushServer(adb, Readable.toWeb(createReadStream(serverPath)) as unknown as JarStream),
    `Không đẩy được scrcpy-server lên máy. Cài \`brew install scrcpy\`, hoặc trỏ SCRCPY_SERVER_PATH.`,
  )
  if (!pushResult.ok) return jsonError(pushResult.error)

  const options = new AdbScrcpyOptions3_3_3(
    {
      video: true,
      audio: false,
      control: true,
      tunnelForward: true,
      videoCodec: 'h264',
      maxSize: 1440,
      maxFps: 60,
      videoBitRate: 8_000_000,
      clipboardAutosync: false,
      scid: ScrcpyInstanceId.random(),
      logLevel: 'debug',
    },
    { version },
  )

  let scrcpy: Awaited<ReturnType<typeof AdbScrcpyClient.start<typeof options>>>
  try {
    scrcpy = await AdbScrcpyClient.start(adb, DefaultServerPath, options)
  } catch (thrown) {
    if (thrown instanceof AdbScrcpyExitedError) {
      return jsonError(
        AppErrors.upstream('scrcpy-server thoát ngay khi khởi động.', {
          detail: thrown.output.join('\n'),
        }),
      )
    }
    return jsonError(AppErrors.unknown('Không khởi động được scrcpy-server.', { detail: String(thrown) }))
  }

  const videoStream = await scrcpy.videoStream
  const reader = videoStream.stream.getReader()

  let closed = false
  const closeSession = async (): Promise<void> => {
    if (closed) return
    closed = true
    try {
      await scrcpy.close()
    } catch {
      // Đã đóng từ phía kia (rút cáp, tự thoát) — không có gì phải dọn thêm.
    }
  }
  request.signal.addEventListener('abort', () => void closeSession(), { once: true })

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (request.signal.aborted) {
        controller.close()
        return
      }
      const { value, done } = await reader.read()
      if (done) {
        controller.close()
        await closeSession()
        return
      }
      if (value.type === 'configuration') {
        controller.enqueue(encodeMessage(KIND_CONFIG, value.data))
        return
      }
      controller.enqueue(
        encodeMessage(KIND_FRAME, encodeFramePayload(value.keyframe === true, value.pts ?? 0n, value.data)),
      )
    },
    async cancel() {
      await closeSession()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
