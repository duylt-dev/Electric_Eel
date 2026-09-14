import type { MirrorStreamEvent } from './MirrorStreamEvent'
import {
  KIND_CONFIG,
  KIND_FAILED,
  KIND_FRAME,
  KIND_META,
  KIND_SIZE,
  decodeMessage,
  encodeFailed,
  encodeFramePayload,
  encodeMeta,
  encodeSizePayload,
  failedEvent,
} from './mirrorFramePayloads'

/**
 * Framing nhị phân giữa server và trình duyệt cho một phiên mirror:
 * `[u32 BE len][u8 kind][payload]`. `len` đếm luôn byte `kind` — cùng quy ước
 * route tạm của phase 01 đã dùng (`src/app/api/adb/mirror/spike/route.ts`),
 * ở đây domain hoá thành một hàm mã hoá + một class đọc có trạng thái. Việc mã
 * hoá/giải mã PAYLOAD của từng `kind` nằm ở `mirrorFramePayloads.ts` (tách ra
 * chỉ để giữ mỗi file dưới 200 dòng), file này giữ phần "khung" chung.
 *
 *   kind 1  meta     JSON utf8 của nhánh `{ type: 'meta', ... }`
 *   kind 2  config   payload = `packet.data` nguyên văn (gói configuration)
 *   kind 3  frame    payload = `[u8 flags][u64 BE pts][data]`; bit 0 của
 *                    flags = keyframe, bảy bit còn lại để dành, luôn 0
 *   kind 4  size     payload = `[u16 BE width][u16 BE height]`
 *   kind 5  failed   JSON utf8 của nhánh `{ type: 'failed', ... }`
 *
 * KHÔNG dùng JSON cho `video`: `pts` là `bigint`, và `JSON.stringify` NÉM lỗi
 * ngay khi gặp bigint — không trả về chuỗi sai, mà dừng cả hàm gọi nó. Đây là
 * lý do `encodeMirrorEvent` phải là đường DUY NHẤT đưa `MirrorStreamEvent` ra
 * dây: ai đó lỡ `JSON.stringify(event)` để debug sẽ thấy lỗi ngay tại chỗ,
 * thay vì một object bị nuốt mất field `pts` trong im lặng.
 */

/**
 * Trần payload một khung.
 *
 * Khung hình lớn nhất đo được trên máy thật (spike, `maxSize:1440`) là
 * 24–38 KB (keyframe). 16 MiB rộng hơn hàng trăm lần — đủ chỗ cho một khung
 * bất thường mà vẫn chặn được kịch bản `len` hỏng (bug phía gửi, hoặc cố ý)
 * khiến bộ đệm ở `MirrorFrameReader` phình vô hạn trong lúc chờ đủ byte cho
 * một message không bao giờ tới đủ.
 */
const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024

function makeFrame(kind: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + 1 + payload.byteLength)
  new DataView(out.buffer).setUint32(0, 1 + payload.byteLength, false)
  out[4] = kind
  out.set(payload, 5)
  return out
}

export function encodeMirrorEvent(event: MirrorStreamEvent): Uint8Array {
  switch (event.type) {
    case 'meta':
      return makeFrame(KIND_META, encodeMeta(event))
    case 'video':
      return event.packet.type === 'config'
        ? makeFrame(KIND_CONFIG, event.packet.data)
        : makeFrame(KIND_FRAME, encodeFramePayload(event.packet.keyframe, event.packet.pts, event.packet.data))
    case 'size':
      return makeFrame(KIND_SIZE, encodeSizePayload(event.width, event.height))
    case 'failed':
      return makeFrame(KIND_FAILED, encodeFailed(event))
  }
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength)
  out.set(a, 0)
  out.set(b, a.byteLength)
  return out
}

/**
 * Tách khung từ một luồng byte đến theo mẩu bất kỳ — TCP không giữ ranh giới
 * message. Giữ trạng thái giữa các lần `push` để một message bị cắt ngang, ở
 * giữa 4 byte độ dài hoặc ở giữa payload, vẫn ghép lại đúng khi mẩu sau tới,
 * thay vì rơi mất hoặc đọc sai byte.
 */
export class MirrorFrameReader {
  // Chú thích kiểu tường minh: để suy luận từ `new Uint8Array(0)`, TS khoá
  // field này vào `Uint8Array<ArrayBuffer>` — hẹp hơn kiểu trả về của
  // `.slice()`/`concatBytes()` (`Uint8Array<ArrayBufferLike>`) và gãy ở mỗi
  // lần gán lại bên dưới. Cùng vướng mắc TS đã gặp ở trang tạm phase 01
  // (`src/app/(app)/mirror/spike/page.tsx`).
  private buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0)

  push(chunk: Uint8Array): MirrorStreamEvent[] {
    this.buffer = concatBytes(this.buffer, chunk)
    const events: MirrorStreamEvent[] = []

    for (;;) {
      if (this.buffer.byteLength < 4) break
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength)
      const len = view.getUint32(0, false)

      if (len > MAX_PAYLOAD_BYTES || len < 1) {
        // `len` hỏng hoặc cố ý phá: KHÔNG đợi phần còn thiếu (có thể không bao
        // giờ tới đủ), báo lỗi và bỏ HẾT đệm — ghép tiếp dữ liệu tới sau vào
        // một message đã biết là hỏng chỉ sinh ra rác nối tiếp rác. `len < 1`
        // cũng là hỏng: byte `kind` luôn nằm trong `len`, nên khung hợp lệ
        // ngắn nhất là 1 — không kiểm thì `getUint8(4)` ném `RangeError`.
        events.push(
          failedEvent(len < 1 ? 'Khung rỗng.' : `Khung vượt trần ${String(MAX_PAYLOAD_BYTES)} byte.`),
        )
        this.buffer = new Uint8Array(0)
        break
      }
      if (this.buffer.byteLength < 4 + len) break // chưa đủ byte, chờ mẩu sau

      const kind = view.getUint8(4)
      const payload = this.buffer.slice(5, 4 + len)
      this.buffer = this.buffer.slice(4 + len)
      events.push(decodeMessage(kind, payload))
    }

    return events
  }
}
