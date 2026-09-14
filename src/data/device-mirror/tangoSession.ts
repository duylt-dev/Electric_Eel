import 'server-only'

import type { Adb } from '@yume-chan/adb'
import type { AdbScrcpyClient, AdbScrcpyOptions3_3_3 } from '@yume-chan/adb-scrcpy'
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy'

import { AppErrors, type Result, err } from '../../core/result'
import type { MirrorControlMessage } from '../../domain/device-mirror/entities/MirrorControlMessage'
import type { MirrorVideoPacket } from '../../domain/device-mirror/entities/MirrorVideoPacket'
import type { MirrorDeviceSession } from '../../domain/device-mirror/repositories/MirrorDeviceGateway'
import { applyControl } from './tangoControl'

const CLOSE_TIMEOUT_MS = 3_000

/** Client scrcpy đúng bộ tuỳ chọn gateway dùng (`video: true` → `videoStream` chắc chắn có). */
export type ScrcpyClient = AdbScrcpyClient<AdbScrcpyOptions3_3_3<true>>
/** Tango không re-export `AdbScrcpyVideoStream` từ index — suy ra từ chính getter của client. */
type VideoStream = Awaited<ScrcpyClient['videoStream']>

/**
 * Kiểu tối giản của một reader — chỉ hai thành viên thật sự dùng tới. Tango
 * tự khai `ReadableStream...` RIÊNG (gói `@yume-chan/stream-extra`, không
 * phải dependency trực tiếp), lệch vài chi tiết nhỏ so với kiểu toàn cục của
 * DOM lib; khai tối giản thế này nhận được reader của CẢ HAI phía, khỏi ép kiểu.
 */
export interface StreamReader<T> {
  read(): Promise<{ readonly done?: boolean; readonly value?: T }>
  releaseLock(): void
}

type Size = { width: number; height: number }

/** Quy đổi packet của Tango (`keyframe`/`pts` OPTIONAL) sang kiểu domain (bắt buộc) — spike-report §2 mục 1, 3, 4. */
async function* iteratePackets(reader: StreamReader<ScrcpyMediaStreamPacket>): AsyncGenerator<MirrorVideoPacket> {
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done === true || value === undefined) return
      yield value.type === 'configuration'
        ? { type: 'config', data: value.data }
        : { type: 'frame', keyframe: value.keyframe === true, pts: value.pts ?? 0n, data: value.data }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Đóng MỌI THỨ một phiên đã mở, theo đúng thứ tự, với trần thời gian.
 *
 * `AdbScrcpyClient.close()` chỉ `kill` tiến trình app_process trên máy —
 * KHÔNG đóng transport adb. Còn `Adb.close()` đóng các socket thiết bị và huỷ
 * kết nối `host:…wait-for-any-disconnect` mà `createTransport()` giữ mở suốt
 * đời transport. Bỏ bước thứ hai là mỗi phiên (kể cả mỗi lần đổi chất lượng)
 * rò một socket tới cổng 5037 cho tới khi rút cáp.
 *
 * Trần 3s: `close()` có thể treo nếu socket đã đứt (rút cáp). Dùng được cả ở
 * nhánh lỗi giữa `start()` — khi đó `scrcpy` có thể còn `undefined`.
 */
export async function closeTangoResources(scrcpy: ScrcpyClient | undefined, adb: Adb | undefined): Promise<void> {
  const shutdown = (async () => {
    await scrcpy?.close().catch(() => undefined)
    await adb?.close().catch(() => undefined)
  })()
  await Promise.race([shutdown, new Promise<void>((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS))])
}

/**
 * Bọc một phiên Tango đã bắt tay xong thành `MirrorDeviceSession` — kiểu web
 * chuẩn, không lộ gì của Tango ra khỏi `data/`.
 */
export function createTangoSession(scrcpy: ScrcpyClient, adb: Adb, videoStream: VideoStream): MirrorDeviceSession {
  // `getReader()` khoá luồng — gọi ĐÚNG MỘT LẦN ở đây, không phải bên trong
  // `packets()` (route chỉ gọi nó một lần cho mỗi phiên).
  const videoReader = videoStream.stream.getReader()

  // Tango chỉ biết kích cỡ SAU gói SPS đầu tiên — lúc này thường là 0×0, và
  // con số thật tới qua `sizeChanged` (sticky) ngay trước gói `config`.
  let currentSize: Size = { width: videoStream.width, height: videoStream.height }
  // Máy xoay màn hình TRƯỚC khi route kịp gọi `onSize()` — hàng đợi nhỏ này giữ cho không mất sự kiện.
  const pendingSizes: Size[] = []
  const listeners = new Set<(size: Size) => void>()

  videoStream.sizeChanged((size: Size) => {
    currentSize = size
    if (listeners.size === 0) {
      pendingSizes.push(size)
      return
    }
    for (const listener of listeners) listener(size)
  })

  // Hai POST `/control` tới cùng lúc (trình duyệt lỗi, hay cố ý) không được
  // xen kẽ `write` của hai lô — Android nhận down/up theo thứ tự byte tới.
  // Nối chuỗi theo phiên: lô sau chờ lô trước xong, lỗi của lô trước không
  // làm lô sau bị bỏ.
  let controlQueue: Promise<unknown> = Promise.resolve()

  let closed = false

  return {
    meta: {
      deviceName: videoStream.metadata.deviceName ?? 'Thiết bị Android',
      width: currentSize.width,
      height: currentSize.height,
    },
    packets: () => iteratePackets(videoReader),
    onSize: (listener) => {
      listeners.add(listener)
      for (const size of pendingSizes.splice(0, pendingSizes.length)) listener(size)
      return () => listeners.delete(listener)
    },
    control: (messages: readonly MirrorControlMessage[]) => {
      const controller = scrcpy.controller
      if (controller === undefined) {
        return Promise.resolve(err(AppErrors.forbidden('Phiên này không mở kênh điều khiển.')))
      }
      const turn: Promise<Result<void>> = controlQueue.then(() => applyControl(controller, () => currentSize, messages))
      controlQueue = turn.catch(() => undefined)
      return turn
    },
    close: async () => {
      if (closed) return
      closed = true
      await closeTangoResources(scrcpy, adb)
    },
  }
}
