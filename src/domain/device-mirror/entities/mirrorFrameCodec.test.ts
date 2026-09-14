import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MirrorFrameReader, encodeMirrorEvent } from './mirrorFrameCodec'
import type { MirrorStreamEvent } from './MirrorStreamEvent'

describe('encodeMirrorEvent + MirrorFrameReader', () => {
  it('round-trip từng loại sự kiện', () => {
    const events: MirrorStreamEvent[] = [
      {
        type: 'meta',
        sessionId: 's1',
        deviceName: 'SM-A165F',
        width: 664,
        height: 1440,
        codec: 'h264',
        control: true,
      },
      { type: 'video', packet: { type: 'config', data: new Uint8Array([1, 2, 3]) } },
      {
        type: 'video',
        packet: { type: 'frame', keyframe: true, pts: 399020160743n, data: new Uint8Array([9, 8, 7, 6]) },
      },
      { type: 'size', width: 664, height: 1440 },
      { type: 'failed', kind: 'upstream', message: 'lỗi', detail: 'chi tiết' },
    ]

    const reader = new MirrorFrameReader()
    for (const event of events) {
      const decoded = reader.push(encodeMirrorEvent(event))
      assert.deepEqual(decoded, [event])
    }
  })

  it('hai khung trong một mẩu byte', () => {
    const a = encodeMirrorEvent({ type: 'size', width: 100, height: 200 })
    const b = encodeMirrorEvent({ type: 'size', width: 300, height: 400 })
    const merged = new Uint8Array(a.byteLength + b.byteLength)
    merged.set(a, 0)
    merged.set(b, a.byteLength)

    const events = new MirrorFrameReader().push(merged)
    assert.deepEqual(events, [
      { type: 'size', width: 100, height: 200 },
      { type: 'size', width: 300, height: 400 },
    ])
  })

  it('một khung bị cắt ở giữa 4 byte độ dài', () => {
    const encoded = encodeMirrorEvent({ type: 'size', width: 664, height: 1440 })
    const reader = new MirrorFrameReader()

    assert.deepEqual(reader.push(encoded.slice(0, 2)), [])
    assert.deepEqual(reader.push(encoded.slice(2)), [{ type: 'size', width: 664, height: 1440 }])
  })

  it('một khung bị cắt ở giữa payload', () => {
    const packetEvent: MirrorStreamEvent = {
      type: 'video',
      packet: { type: 'frame', keyframe: false, pts: 100n, data: new Uint8Array([1, 2, 3, 4, 5]) },
    }
    const encoded = encodeMirrorEvent(packetEvent)
    const reader = new MirrorFrameReader()
    const cut = Math.floor(encoded.byteLength / 2)

    assert.deepEqual(reader.push(encoded.slice(0, cut)), [])
    assert.deepEqual(reader.push(encoded.slice(cut)), [packetEvent])
  })

  it('payload vượt trần 16 MiB: báo lỗi và bỏ đệm, không treo chờ mãi', () => {
    const huge = new Uint8Array(4)
    new DataView(huge.buffer).setUint32(0, 32 * 1024 * 1024, false) // khai 32 MiB, vượt trần
    const reader = new MirrorFrameReader()

    const events = reader.push(huge)
    assert.equal(events.length, 1)
    assert.equal(events[0]?.type, 'failed')
    if (events[0]?.type === 'failed') assert.equal(events[0].kind, 'unknown')

    // Đệm đã bị bỏ hết — một khung hợp lệ gửi ngay sau đó phải đọc bình
    // thường, không bị rác của message hỏng làm lệch các khung tới sau.
    const next = reader.push(encodeMirrorEvent({ type: 'size', width: 1, height: 1 }))
    assert.deepEqual(next, [{ type: 'size', width: 1, height: 1 }])
  })

  it('len = 0 (không có cả byte kind): báo lỗi thay vì ném RangeError', () => {
    const reader = new MirrorFrameReader()

    // Trước đây `push` NÉM ở đây (`getUint8(4)` ngoài biên DataView) — `push`
    // phải là hàm không bao giờ ném để adapter chỉ cần xử lý sự kiện `failed`.
    const events = reader.push(new Uint8Array([0, 0, 0, 0]))
    assert.equal(events.length, 1)
    assert.equal(events[0]?.type, 'failed')

    const next = reader.push(encodeMirrorEvent({ type: 'size', width: 2, height: 3 }))
    assert.deepEqual(next, [{ type: 'size', width: 2, height: 3 }])
  })
})
