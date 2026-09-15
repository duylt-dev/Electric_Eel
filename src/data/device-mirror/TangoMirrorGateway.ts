import 'server-only'

import { type Adb, AdbServerClient } from '@yume-chan/adb'
import { AdbScrcpyClient, AdbScrcpyOptions3_3_3 } from '@yume-chan/adb-scrcpy'
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp'
import { DefaultServerPath, ScrcpyInstanceId } from '@yume-chan/scrcpy'

import { AppErrors, type Result, err, ok } from '../../core/result'
import type { AdbShell } from '../../domain/adb/repositories/AdbShell'
import { MIRROR_QUALITY } from '../../domain/device-mirror/entities/MirrorRequest'
import type { MirrorRequest } from '../../domain/device-mirror/entities/MirrorRequest'
import type {
  MirrorDeviceGateway,
  MirrorDeviceSession,
} from '../../domain/device-mirror/repositories/MirrorDeviceGateway'
import { openJarStream } from './jarSource'
import { describeMirrorFailure } from './mirrorFailure'
import type { MirrorSettings } from './mirrorSettings'
import { type ScrcpyClient, type StreamReader, closeTangoResources, createTangoSession } from './tangoSession'

const OUTPUT_LINE_CAP = 200
/** Trần cho MỖI bước bắt tay Tango — máy treo hay Samsung từ chối `app_process` mà không thoát thì không đợi vô hạn. */
const STEP_TIMEOUT_MS = 15_000

type JarStream = Parameters<typeof AdbScrcpyClient.pushServer>[1]

/** Đọc stderr của scrcpy-server song song, không chờ — xem ghi chú trong `start()`. */
async function drainOutput(reader: StreamReader<string>, into: string[]): Promise<void> {
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done === true || value === undefined) return
      if (into.length < OUTPUT_LINE_CAP) into.push(value)
    }
  } catch {
    // Luồng đóng cùng lúc tiến trình thoát — không phải lỗi cần xử lý riêng,
    // `describeMirrorFailure` chỉ cần mảng đã gom được tới thời điểm này.
  } finally {
    reader.releaseLock()
  }
}

/**
 * Tango không biết gì về `AbortSignal` của request. Mỗi bước `await` dài được
 * bọc ở đây để (1) đóng tab lúc "Đang nối…" là `start()` thoát ngay, và (2)
 * không có bước nào treo quá `STEP_TIMEOUT_MS`. Cả hai đều ném `AppError` để
 * `describeMirrorFailure` trả nguyên về, không quy nhầm thành `unknown`.
 */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal, step: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(AppErrors.cancelled('Đã huỷ.'))
      return
    }
    const timer = setTimeout(
      () => reject(AppErrors.network(`${step} không trả lời sau ${String(STEP_TIMEOUT_MS / 1000)}s.`)),
      STEP_TIMEOUT_MS,
    )
    const onAbort = () => reject(AppErrors.cancelled('Đã huỷ.'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    })
  })
}

/**
 * Hiện thực THẬT của cổng mirror — dựng một phiên scrcpy trên máy đang cắm
 * qua adb server, bằng thư viện Tango (`@yume-chan/*`).
 *
 * Ngoại lệ có chủ ý so với `ProcessAdbShell` (mỗi lệnh sống, chết trong đúng
 * một request): một phiên scrcpy PHẢI sống lâu hơn một lượt gọi hàm, vì trình
 * duyệt cần gửi điều khiển (route `/control`) tới ĐÚNG phiên `/stream` đang
 * chảy — HTTP/1.1 không mở được kênh nhị phân hai chiều trên một request.
 * Điều KHÔNG đổi: phiên vẫn thuộc đúng MỘT request đã tạo ra nó.
 * `MirrorSessionRegistry` chỉ giữ tham chiếu để route `/control` tra cứu,
 * không sở hữu vòng đời — route `/stream` luôn `release()` + `close()` trong
 * `finally` của chính nó (xem `LLM.md` §12).
 *
 * Mọi nhánh thoát sớm (lỗi, huỷ, hết giờ) đều đi qua `closeTangoResources`
 * — kể cả khi mới `createAdb` xong mà chưa có `scrcpy`.
 */
export class TangoMirrorGateway implements MirrorDeviceGateway {
  constructor(
    private readonly shell: AdbShell,
    private readonly settings: () => Result<MirrorSettings>,
    private readonly adbPort: number = Number(process.env.ANDROID_ADB_SERVER_PORT ?? 5037),
  ) {}

  async start(request: MirrorRequest, signal: AbortSignal): Promise<Result<MirrorDeviceSession>> {
    const settingsResult = this.settings()
    if (!settingsResult.ok) return settingsResult
    const { jarPath, version } = settingsResult.value

    // Đảm bảo adb server đang chạy TRƯỚC khi Tango tự nối TCP tới nó — thiếu
    // bước này thì lỗi đầu tiên là một `ECONNREFUSED` khó hiểu.
    const adbStarted = await this.shell.run({ args: ['start-server'], timeoutMs: 10_000 }, signal)
    if (!adbStarted.ok) return adbStarted

    const outputLines: string[] = []
    let adb: Adb | undefined
    let scrcpy: ScrcpyClient | undefined

    try {
      const connector = new AdbServerNodeTcpConnector({ host: '127.0.0.1', port: this.adbPort })
      const client = new AdbServerClient(connector)
      adb = await raceAbort(client.createAdb({ serial: request.serial }), signal, 'adb server')

      const jarStream = openJarStream(jarPath)
      if (!jarStream.ok) {
        await closeTangoResources(scrcpy, adb)
        return jarStream
      }
      await raceAbort(AdbScrcpyClient.pushServer(adb, jarStream.value as unknown as JarStream), signal, 'Đẩy scrcpy-server lên máy')

      const options = new AdbScrcpyOptions3_3_3(
        {
          video: true,
          audio: false,
          control: request.control,
          tunnelForward: true,
          videoCodec: 'h264',
          // Chất lượng cố định ở mức cao nhất — xem `MIRROR_QUALITY`.
          maxSize: MIRROR_QUALITY.maxSize,
          maxFps: MIRROR_QUALITY.maxFps,
          videoBitRate: MIRROR_QUALITY.bitRateMbps * 1_000_000,
          clipboardAutosync: false,
          scid: ScrcpyInstanceId.random(),
          // 'debug' để bắt dòng "Using video encoder". KHÔNG 'verbose' — làm
          // scrcpy-server 3.3.4 CRASH dù kiểu `LogLevel` vẫn liệt kê nó hợp lệ
          // (spike-report §2 mục 7).
          logLevel: 'debug',
        },
        { version },
      )

      scrcpy = await raceAbort(AdbScrcpyClient.start(adb, DefaultServerPath, options), signal, 'scrcpy-server')

      // Đọc stderr NGAY, không `await` — không đọc thì `output` nghẽn ngược, và
      // mảng này là nguồn `detail` DUY NHẤT nếu `videoStream` không bao giờ
      // resolve (spike-report §2 mục 6).
      void drainOutput(scrcpy.output.getReader(), outputLines)

      const videoStream = await raceAbort(scrcpy.videoStream, signal, 'Luồng video của scrcpy-server')

      return ok(createTangoSession(scrcpy, adb, videoStream))
    } catch (thrown) {
      await closeTangoResources(scrcpy, adb)
      return err(describeMirrorFailure(thrown, outputLines, jarPath, version))
    }
  }
}
