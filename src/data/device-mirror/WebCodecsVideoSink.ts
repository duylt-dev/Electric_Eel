import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy'
import { ScrcpyVideoCodecId } from '@yume-chan/scrcpy'
import { WebCodecsVideoDecoder, WebGLVideoFrameRenderer } from '@yume-chan/scrcpy-decoder-webcodecs'

import { type AppError, AppErrors, type Result, err, ok } from '../../core/result'
import type { MirrorVideoPacket } from '../../domain/device-mirror/entities/MirrorVideoPacket'
import type { MirrorVideoSink } from '../../domain/device-mirror/repositories/MirrorVideoSink'

/**
 * Hiện thực CHẠY TRÊN TRÌNH DUYỆT của `MirrorVideoSink`: bọc
 * `WebCodecsVideoDecoder` + `WebGLVideoFrameRenderer` của Tango (API đã kiểm ở
 * `spike-report.md` §1) lên một `<canvas>`.
 *
 * ─── Sink LƯỜI: hàm dựng không chạm DOM, `attach()` mới tạo canvas/decoder ───
 *
 * `'use client'` không có nghĩa là chỉ chạy trên trình duyệt — Next.js vẫn
 * render component đó trên máy chủ để dựng HTML lần đầu, và initializer của
 * `useState(() => …)` chạy trong lượt đó, nơi `document` không tồn tại. Nên
 * Root có thể dựng sink ngay trong `useState` (an toàn SSR), còn canvas và
 * decoder chỉ sinh ra khi Screen gắn `attach(container)` qua ref callback —
 * tức là chắc chắn đang ở trình duyệt.
 *
 * Cùng lý do đó, `dispose()` trả tài nguyên nhưng KHÔNG khoá sink: StrictMode
 * (dev) gỡ rồi gắn lại cùng một instance, và lần gắn lại đi đúng đường
 * `attach()` → dựng lại từ đầu. Instance thừa mà StrictMode vứt đi chưa từng
 * `attach` nên không giữ gì để rò.
 *
 * `isSupported` chỉ đọc `typeof globalThis.VideoDecoder` — trên Node là
 * `false`, trên trình duyệt là giá trị thật; đọc ở đâu cũng không ném.
 */
function toTangoPacket(packet: MirrorVideoPacket): ScrcpyMediaStreamPacket {
  return packet.type === 'config'
    ? { type: 'configuration', data: packet.data }
    : { type: 'data', keyframe: packet.keyframe, pts: packet.pts, data: packet.data }
}

const DECODER_FAILED = 'Trình duyệt không giải mã được luồng video từ máy (bộ giải mã H.264 báo lỗi).'

export class WebCodecsVideoSink implements MirrorVideoSink {
  readonly supported: boolean = WebCodecsVideoDecoder.isSupported

  private canvas: HTMLCanvasElement | null = null
  private decoder: WebCodecsVideoDecoder | null = null
  private writer: WritableStreamDefaultWriter<ScrcpyMediaStreamPacket> | null = null
  private readonly errorListeners = new Set<(error: AppError) => void>()
  /** Đã báo lỗi cho vòng đời decoder hiện tại — `attach()` lại sau `dispose()` sẽ đặt lại. */
  private failed = false

  /**
   * Gắn canvas vào `container`. Lần đầu (hoặc lần đầu sau `dispose()`) dựng
   * decoder; các lần sau chỉ gắn lại canvas nếu nó đang ở nơi khác.
   */
  attach(container: HTMLElement): void {
    if (!this.supported) return
    if (this.decoder === null) {
      this.canvas = document.createElement('canvas')
      this.decoder = new WebCodecsVideoDecoder({
        codec: ScrcpyVideoCodecId.H264,
        renderer: new WebGLVideoFrameRenderer(this.canvas),
      })
      // Giữ sẵn MỘT writer cho suốt vòng đời decoder thay vì `getWriter()` mỗi
      // lần `push` — một `WritableStream` chỉ cho một writer giữ khoá tại một
      // thời điểm, gọi lặp lại sẽ ném ngay từ lần `push` thứ hai.
      this.writer = this.decoder.writable.getWriter()
      this.failed = false
    }
    if (this.canvas !== null && this.canvas.parentElement !== container) container.appendChild(this.canvas)
  }

  push(packet: MirrorVideoPacket): void {
    if (this.writer === null || this.failed) return
    // Decoder hỏng → Tango `controller.error()` → mọi `write` sau đó reject.
    // Báo MỘT lần rồi thôi: khung hình tới 60 lần/giây, không phải 60 lỗi.
    this.writer.write(toTangoPacket(packet)).catch((thrown: unknown) => this.fail(thrown))
  }

  onError(listener: (error: AppError) => void): () => void {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  async snapshotPng(): Promise<Result<Uint8Array>> {
    if (this.decoder === null) {
      return err(AppErrors.validation('Trình duyệt này không hỗ trợ giải mã H.264 qua WebCodecs.'))
    }
    // `snapshot()` chụp thẳng `VideoFrame` cuối qua một `OffscreenCanvas`
    // riêng của Tango (`video/snapshot.js`) — không phụ thuộc renderer, nên
    // không cần bật `enableCapture` của `WebGLVideoFrameRenderer`.
    const blob = await this.decoder.snapshot()
    if (blob === undefined) {
      return err(AppErrors.validation('Chưa có khung hình nào để chụp.'))
    }
    return ok(new Uint8Array(await blob.arrayBuffer()))
  }

  /** Trả canvas, decoder, writer. `attach()` sau đó dựng lại được — xem đầu file. */
  dispose(): void {
    if (this.writer !== null) {
      try {
        // `releaseLock`, không `close`: `decoder.dispose()` ngay dưới dọn toàn bộ
        // pipeline bất kể trạng thái writer, còn `close()` trả về một `Promise`
        // có thể bị TỪ CHỐI nếu writable đã lỗi — dispose là đường thoát đồng
        // bộ, không nên phát sinh một rejection không ai bắt.
        this.writer.releaseLock()
      } catch (thrown) {
        console.warn('[WebCodecsVideoSink] đóng writer thất bại:', thrown)
      }
    }
    try {
      this.decoder?.dispose()
    } catch (thrown) {
      console.warn('[WebCodecsVideoSink] dispose decoder thất bại:', thrown)
    }
    this.canvas?.remove()
    this.canvas = null
    this.decoder = null
    this.writer = null
  }

  private fail(thrown: unknown): void {
    if (this.failed) return
    this.failed = true
    const error = AppErrors.upstream(DECODER_FAILED, { cause: thrown })
    for (const listener of this.errorListeners) listener(error)
  }
}
