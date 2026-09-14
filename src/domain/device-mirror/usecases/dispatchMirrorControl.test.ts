import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ok } from '../../../core/result'
import { MirrorSessionRegistry } from '../MirrorSessionRegistry'
import type { MirrorDeviceSession } from '../repositories/MirrorDeviceGateway'
import { dispatchMirrorControl } from './dispatchMirrorControl'

function fakeSession(onControl: (messages: unknown) => void): MirrorDeviceSession {
  return {
    meta: { deviceName: 'fake', width: 664, height: 1440 },
    packets: () => (async function* () {})(),
    onSize: () => () => {},
    control: async (messages) => {
      onControl(messages)
      return ok(undefined)
    },
    close: async () => {},
  }
}

describe('dispatchMirrorControl', () => {
  it('phiên hợp lệ + batch hợp lệ → gọi handle.control, trả về số thông điệp', async () => {
    const registry = new MirrorSessionRegistry<MirrorDeviceSession>()
    let received: unknown = null
    registry.register(
      { id: 'sess-1', serial: 'emulator-5554', userId: 'u1', startedAt: 0 },
      fakeSession((messages) => {
        received = messages
      }),
    )

    const result = await dispatchMirrorControl({ registry }, 'sess-1', 'u1', [{ type: 'rotate' }])

    assert.deepEqual(result, { ok: true, value: 1 })
    assert.deepEqual(received, [{ type: 'rotate' }])
  })

  it('batch sai: KHÔNG gọi handle.control, trả lỗi validation', async () => {
    const registry = new MirrorSessionRegistry<MirrorDeviceSession>()
    let called = false
    registry.register(
      { id: 'sess-1', serial: 'emulator-5554', userId: 'u1', startedAt: 0 },
      fakeSession(() => {
        called = true
      }),
    )

    const result = await dispatchMirrorControl({ registry }, 'sess-1', 'u1', [{ type: 'not-a-real-type' }])

    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.kind, 'validation')
    assert.equal(called, false)
  })

  it('phiên không tồn tại hoặc sai chủ: KHÔNG kiểm batch, trả lỗi tương ứng', async () => {
    const registry = new MirrorSessionRegistry<MirrorDeviceSession>()
    registry.register({ id: 'sess-1', serial: 'emulator-5554', userId: 'u1', startedAt: 0 }, fakeSession(() => {}))

    const notFound = await dispatchMirrorControl({ registry }, 'sess-missing', 'u1', [])
    assert.equal(notFound.ok, false)
    if (!notFound.ok) assert.equal(notFound.error.kind, 'notFound')

    const forbidden = await dispatchMirrorControl({ registry }, 'sess-1', 'u2', [])
    assert.equal(forbidden.ok, false)
    if (!forbidden.ok) assert.equal(forbidden.error.kind, 'forbidden')
  })

  it('batch rỗng: trả 0, không gọi handle.control', async () => {
    const registry = new MirrorSessionRegistry<MirrorDeviceSession>()
    let called = false
    registry.register(
      { id: 'sess-1', serial: 'emulator-5554', userId: 'u1', startedAt: 0 },
      fakeSession(() => {
        called = true
      }),
    )

    const result = await dispatchMirrorControl({ registry }, 'sess-1', 'u1', [])
    assert.deepEqual(result, { ok: true, value: 0 })
    assert.equal(called, false)
  })
})
