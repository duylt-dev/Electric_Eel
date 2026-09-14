import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { ScrcpyControlMessageWriter } from '@yume-chan/scrcpy'

import type { MirrorControlMessage } from '../../domain/device-mirror/entities/MirrorControlMessage'
import { applyControl } from './tangoControl'

/**
 * Writer giả ghi lại từng lời gọi theo thứ tự — chỉ những phương thức
 * `tangoControl.ts` thật sự dùng. Ép kiểu về `ScrcpyControlMessageWriter` ở
 * một chỗ (`asWriter`) thay vì hiện thực đủ vài chục phương thức của Tango.
 */
class RecordingWriter {
  readonly calls: { method: string; args: unknown[] }[] = []
  failWith: Error | null = null

  private record(method: string, ...args: unknown[]): Promise<void> {
    if (this.failWith !== null) return Promise.reject(this.failWith)
    this.calls.push({ method, args })
    return Promise.resolve()
  }

  injectTouch = (message: unknown) => this.record('injectTouch', message)
  injectScroll = (message: unknown) => this.record('injectScroll', message)
  injectKeyCode = (message: unknown) => this.record('injectKeyCode', message)
  injectText = (text: string) => this.record('injectText', text)
  setClipboard = (message: unknown) => this.record('setClipboard', message)
  backOrScreenOn = (action: unknown) => this.record('backOrScreenOn', action)
  setScreenPowerMode = (mode: unknown) => this.record('setScreenPowerMode', mode)
  rotateDevice = () => this.record('rotateDevice')
  expandNotificationPanel = () => this.record('expandNotificationPanel')
}

const asWriter = (recording: RecordingWriter): ScrcpyControlMessageWriter =>
  recording as unknown as ScrcpyControlMessageWriter

const SIZE = { width: 1080, height: 2400 }

describe('applyControl', () => {
  it('text ASCII → injectText; text có dấu → setClipboard(paste=true), KHÔNG injectText', async () => {
    const writer = new RecordingWriter()
    const result = await applyControl(asWriter(writer), () => SIZE, [
      { type: 'text', text: 'hello' },
      { type: 'text', text: 'Tiếng Việt' },
    ])

    assert.equal(result.ok, true)
    assert.deepEqual(
      writer.calls.map((call) => call.method),
      ['injectText', 'setClipboard'],
    )
    assert.deepEqual(writer.calls[1]?.args[0], { sequence: 0n, paste: true, content: 'Tiếng Việt' })
  })

  it('touch: toạ độ chuẩn hoá → điểm ảnh theo kích cỡ HIỆN TẠI; nhả tay thì pressure=0, buttons=0', async () => {
    const writer = new RecordingWriter()
    let size = SIZE
    const result = await applyControl(asWriter(writer), () => size, [
      { type: 'touch', action: 'down', pointer: 0, nx: 0.5, ny: 0.25, pressure: 1 },
      { type: 'touch', action: 'up', pointer: 0, nx: 0.5, ny: 0.25, pressure: 1 },
    ])
    assert.equal(result.ok, true)

    const down = writer.calls[0]?.args[0] as Record<string, unknown>
    assert.equal(down.pointerX, 540)
    assert.equal(down.pointerY, 600)
    assert.equal(down.videoWidth, 1080)
    assert.equal(down.pressure, 1)
    assert.equal(down.buttons, 1)

    const up = writer.calls[1]?.args[0] as Record<string, unknown>
    assert.equal(up.pressure, 0)
    assert.equal(up.buttons, 0)

    // Máy xoay giữa chừng: lô sau đọc kích cỡ mới qua hàm `size()`, không cache.
    size = { width: 2400, height: 1080 }
    await applyControl(asWriter(writer), () => size, [
      { type: 'touch', action: 'down', pointer: 0, nx: 0.5, ny: 0.5, pressure: 1 },
    ])
    const rotated = writer.calls[2]?.args[0] as Record<string, unknown>
    assert.equal(rotated.pointerX, 1200)
    assert.equal(rotated.videoWidth, 2400)
  })

  it('gửi TUẦN TỰ đúng thứ tự lô; mỗi loại thông điệp gọi đúng phương thức', async () => {
    const writer = new RecordingWriter()
    const batch: MirrorControlMessage[] = [
      { type: 'key', action: 'down', key: 'home' },
      { type: 'key', action: 'up', key: 'home' },
      { type: 'scroll', nx: 0.5, ny: 0.5, dx: 0, dy: -1 },
      { type: 'backOrScreenOn', action: 'down' },
      { type: 'displayPower', on: false },
      { type: 'rotate' },
      { type: 'expandNotifications' },
    ]
    const result = await applyControl(asWriter(writer), () => SIZE, batch)

    assert.equal(result.ok, true)
    assert.deepEqual(
      writer.calls.map((call) => call.method),
      [
        'injectKeyCode',
        'injectKeyCode',
        'injectScroll',
        'backOrScreenOn',
        'setScreenPowerMode',
        'rotateDevice',
        'expandNotificationPanel',
      ],
    )
    assert.equal((writer.calls[0]?.args[0] as Record<string, unknown>).keyCode, 3)
  })

  it('writer hỏng (socket điều khiển đứt) → upstream, không phải unknown', async () => {
    const writer = new RecordingWriter()
    writer.failWith = new Error('socket closed')
    const result = await applyControl(asWriter(writer), () => SIZE, [{ type: 'rotate' }])

    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.kind, 'upstream')
  })
})
