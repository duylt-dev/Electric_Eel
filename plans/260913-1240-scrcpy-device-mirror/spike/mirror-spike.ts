/**
 * Spike phase 01 — chứng minh Tango nối được scrcpy-server thật, không phải
 * đọc tài liệu suông. Chạy: `pnpm exec tsx plans/.../spike/mirror-spike.ts
 * <serial> [normal|bad-version|no-forward]`.
 *
 * File này KHÔNG thuộc `src/` nên không theo Contract/ViewModel — nó là một
 * script chẩn đoán một lần, in thẳng ra console. Vẫn phải qua `pnpm
 * typecheck`/`lint` vì `tsconfig.json` gom cả repo (`**\/*.ts`), không riêng
 * `src/`.
 */
import { spawnSync } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'

import { AdbServerClient } from '@yume-chan/adb'
import { AdbScrcpyClient, AdbScrcpyExitedError, AdbScrcpyOptions3_3_3 } from '@yume-chan/adb-scrcpy'
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp'
import {
  AndroidKeyCode,
  AndroidKeyEventAction,
  AndroidKeyEventMeta,
  DefaultServerPath,
  ScrcpyInstanceId,
} from '@yume-chan/scrcpy'

/**
 * `@yume-chan/stream-extra` chỉ là phụ thuộc bắc cầu (qua `adb-scrcpy`), nên
 * không có trong `package.json` — không `import` thẳng từ nó. `ReadableStream`
 * toàn cục (lib `dom`) đã cùng hình dạng với kiểu Tango khai lại, và tham số
 * của `pushServer` lấy thẳng từ chữ ký hàm nên không cần biết tên kiểu đó.
 */
type JarStream = Parameters<typeof AdbScrcpyClient.pushServer>[1]

const ADB_PATH = process.env.ADB_PATH?.trim() || 'adb'
const SERVER_PATH =
  process.env.SCRCPY_SERVER_PATH?.trim() || '/opt/homebrew/share/scrcpy/scrcpy-server'
const SERVER_VERSION = process.env.SCRCPY_SERVER_VERSION?.trim() || '3.3.4'

type Mode = 'normal' | 'bad-version' | 'no-forward'
const serial = process.argv[2]
const mode: Mode = process.argv[3] === 'bad-version' || process.argv[3] === 'no-forward' ? process.argv[3] : 'normal'

if (serial === undefined || serial.length === 0) {
  console.error('Dùng: tsx mirror-spike.ts <serial> [normal|bad-version|no-forward]')
  process.exit(1)
}

async function main(serial: string): Promise<void> {
  // Tango nối adb server qua TCP 5037; phải đảm bảo daemon đó sống trước,
  // giống việc `ProcessAdbShell` không tự bật daemon hộ người gọi.
  spawnSync(ADB_PATH, ['start-server'], { stdio: 'inherit' })

  const connector = new AdbServerNodeTcpConnector({ host: '127.0.0.1', port: 5037 })
  const client = new AdbServerClient(connector)
  const adb = await client.createAdb({ serial })

  console.log(`[spike] adb nối tới ${serial}, đẩy server ${SERVER_PATH}`)
  const jarStream = Readable.toWeb(createReadStream(SERVER_PATH)) as unknown as JarStream
  await AdbScrcpyClient.pushServer(adb, jarStream)

  // 'bad-version' cố tình khai phiên bản client lệch với jar 3.3.4 đã đẩy —
  // mục đích DUY NHẤT là chép nguyên văn câu lỗi "does not match" cho phase 03.
  const version = mode === 'bad-version' ? '3.3.3' : SERVER_VERSION
  const tunnelForward = mode !== 'no-forward'

  const options = new AdbScrcpyOptions3_3_3(
    {
      video: true,
      audio: false,
      control: true,
      tunnelForward,
      videoCodec: 'h264',
      maxSize: 1440,
      maxFps: 60,
      videoBitRate: 8_000_000,
      clipboardAutosync: false,
      scid: ScrcpyInstanceId.random(),
      // Lệch với Architecture của phase (ghi 'info'): ở mức đó server KHÔNG in
      // dòng "Using video encoder" — dòng đó chỉ lên ở DEBUG. Yêu cầu của phase
      // là "ghi lại encoder mà máy chọn (client.output)", nên phải hạ xuống
      // 'debug' mới thoả được, không phải làm màu.
      logLevel: 'debug',
    },
    { version },
  )

  const startedAt = Date.now()
  let scrcpy: Awaited<ReturnType<typeof AdbScrcpyClient.start<typeof options>>>
  try {
    scrcpy = await AdbScrcpyClient.start(adb, DefaultServerPath, options)
  } catch (thrown) {
    if (thrown instanceof AdbScrcpyExitedError) {
      console.error('[spike] server thoát ngay khi start, output nguyên văn:')
      for (const line of thrown.output) console.error(`  ${line}`)
    } else {
      console.error('[spike] start() ném lỗi khác AdbScrcpyExitedError:', thrown)
    }
    return
  }

  // Đọc song song, không await — đây là nơi duy nhất thấy encoder máy chọn
  // hoặc câu lỗi version mismatch. Kiểu của `scrcpy.output` lấy tại chỗ, tránh
  // phải đặt tên cho kiểu `ReadableStream` riêng của Tango (không structurally
  // khớp 100% với `ReadableStream` toàn cục ở overload `getReader`).
  const serverOutput = scrcpy.output
  void (async () => {
    for await (const line of serverOutput) {
      console.log(`[server] ${line}`)
    }
  })()

  try {
    const videoStream = await scrcpy.videoStream
    console.log('[spike] metadata:', videoStream.metadata)

    const reader = videoStream.stream.getReader()
    let packetCount = 0
    let configCount = 0
    let firstKeyframeMs: number | null = null
    let lastPts: bigint | null = null

    while (packetCount < 30) {
      const { value, done } = await reader.read()
      if (done) break
      packetCount++

      if (value.type === 'configuration') {
        configCount++
        console.log(`[spike] #${packetCount} configuration, ${value.data.byteLength} byte`)
        continue
      }

      const isKeyframe = value.keyframe === true
      if (isKeyframe && firstKeyframeMs === null) firstKeyframeMs = Date.now() - startedAt
      const ptsStep = lastPts !== null && value.pts !== undefined ? value.pts - lastPts : null
      if (value.pts !== undefined) lastPts = value.pts

      console.log(
        `[spike] #${packetCount} data keyframe=${String(isKeyframe)} pts=${value.pts ?? 'undefined'} ` +
          `ptsStep=${ptsStep ?? '-'} size=${value.data.byteLength}`,
      )
    }
    reader.releaseLock()

    console.log(
      `[spike] tổng kết: ${String(configCount)} gói configuration, ` +
        `TTFF keyframe = ${firstKeyframeMs === null ? 'CHƯA THẤY' : `${String(firstKeyframeMs)}ms`}`,
    )

    if (mode === 'normal') await sendBack(scrcpy)

    // `output` là luồng bất đồng bộ (adb shell), dòng nói tên encoder thường
    // trồi lên sau dòng "Device:". Đóng ngay thì cắt ngang — chờ một nhịp để
    // báo cáo có được câu chữ nguyên văn thay vì suy đoán từ tài liệu.
    await new Promise((resolve) => setTimeout(resolve, 800))
  } finally {
    await scrcpy.close()
  }
}

/** Gửi BACK (down rồi up) — kiểm tác dụng thật bằng `dumpsys` từ bên ngoài script này. */
async function sendBack(scrcpy: Awaited<ReturnType<typeof AdbScrcpyClient.start>>): Promise<void> {
  const controller = scrcpy.controller
  if (controller === undefined) {
    console.error('[spike] controller undefined dù control:true — không gửi được BACK.')
    return
  }
  console.log('[spike] gửi BACK…')
  await controller.injectKeyCode({
    action: AndroidKeyEventAction.Down,
    keyCode: AndroidKeyCode.AndroidBack,
    repeat: 0,
    metaState: AndroidKeyEventMeta.None,
  })
  await controller.injectKeyCode({
    action: AndroidKeyEventAction.Up,
    keyCode: AndroidKeyCode.AndroidBack,
    repeat: 0,
    metaState: AndroidKeyEventMeta.None,
  })
}

main(serial).catch((error: unknown) => {
  console.error('[spike] lỗi không bắt được:', error)
  process.exitCode = 1
})
