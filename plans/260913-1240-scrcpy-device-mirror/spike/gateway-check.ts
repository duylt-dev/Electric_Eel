/**
 * Kiểm tay `TangoMirrorGateway` với máy thật — script TẠM cho phase 03, xoá
 * sau khi kiểm xong (không phải mã production).
 *
 * `TangoMirrorGateway.ts` có `import 'server-only'`, ném lỗi ngay khi chạy
 * ngoài bundler của Next. Gói `server-only` tự khai hai nhánh export trong
 * `package.json` (`exports["."]`): điều kiện `react-server` trỏ tới
 * `empty.js` (no-op), `default` mới là bản ném lỗi — đây là đường CHÍNH THỐNG
 * gói đó dành cho đúng tình huống "chạy ngoài RSC", không phải một mẹo vá đè.
 * Bật nhánh đó bằng cờ `--conditions` của chính Node, không sửa file nguồn:
 *
 *   NODE_OPTIONS=--conditions=react-server pnpm exec tsx \
 *     plans/260913-1240-scrcpy-device-mirror/spike/gateway-check.ts RF8Y60B9NCZ
 *
 *   NODE_OPTIONS=--conditions=react-server pnpm exec tsx \
 *     plans/260913-1240-scrcpy-device-mirror/spike/gateway-check.ts RF8Y60B9NCZ --bad-version
 */
import { ok } from '@/core/result'
import { ProcessAdbShell } from '@/data/adb/ProcessAdbShell'
import { readMirrorSettings } from '@/data/device-mirror/mirrorSettings'
import { TangoMirrorGateway } from '@/data/device-mirror/TangoMirrorGateway'
import type { MirrorRequest } from '@/domain/device-mirror/entities/MirrorRequest'

const serial = process.argv[2]
const badVersion = process.argv.includes('--bad-version')

if (serial === undefined || serial.startsWith('--')) {
  console.error('Dùng: tsx gateway-check.ts <serial> [--bad-version]')
  process.exit(1)
}

const request: MirrorRequest = {
  serial,
  maxSize: 1440,
  maxFps: 60,
  bitRateMbps: 8,
  control: true,
}

async function main(): Promise<void> {
  const shell = new ProcessAdbShell()

  // `--bad-version`: ép SAI version qua ĐƯỜNG THẬT (kết nối adb thật, đẩy jar
  // thật lên máy thật) — kiểm được cả `TangoMirrorGateway` lẫn
  // `describeMirrorFailure` cùng lúc, không chỉ chuỗi lỗi giả trong unit test.
  const settings = () => {
    const result = readMirrorSettings()
    if (!result.ok || !badVersion) return result
    return ok({ ...result.value, version: '3.3.1' })
  }

  const gateway = new TangoMirrorGateway(shell, settings)
  const controller = new AbortController()

  const started = await gateway.start(request, controller.signal)
  if (!started.ok) {
    console.log('start() trả lỗi:', JSON.stringify(started.error, null, 2))
    return
  }

  const session = started.value
  console.log('meta:', session.meta)
  // Tango chỉ biết kích thước SAU khi đọc gói `configuration` (SPS) — meta luôn 0×0 lúc này,
  // kích thước thật phải tới qua `onSize` trước gói video đầu tiên.
  session.onSize((size) => console.log('size:', size))

  let count = 0
  for await (const packet of session.packets()) {
    count += 1
    console.log(
      packet.type === 'frame'
        ? `#${String(count)} frame keyframe=${String(packet.keyframe)} pts=${String(packet.pts)} size=${String(packet.data.byteLength)}`
        : `#${String(count)} config size=${String(packet.data.byteLength)}`,
    )
    if (count >= 30) break
  }

  const controlResult = await session.control([
    { type: 'backOrScreenOn', action: 'down' },
    { type: 'backOrScreenOn', action: 'up' },
  ])
  console.log('control result:', controlResult)

  await session.close()
  console.log('đã đóng phiên')
}

main().catch((thrown: unknown) => {
  console.error(thrown)
  process.exitCode = 1
})
