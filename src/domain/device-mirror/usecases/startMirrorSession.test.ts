import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ok } from '../../../core/result'
import type { MirrorRequest } from '../entities/MirrorRequest'
import { MirrorSessionRegistry } from '../MirrorSessionRegistry'
import type { MirrorDeviceGateway, MirrorDeviceSession } from '../repositories/MirrorDeviceGateway'
import { startMirrorSession } from './startMirrorSession'

const request: MirrorRequest = { serial: 'emulator-5554', control: true }

function fakeSession(closed: { value: boolean }): MirrorDeviceSession {
  return {
    meta: { deviceName: 'fake', width: 664, height: 1440 },
    packets: () => (async function* () {})(),
    onSize: () => () => {},
    control: async () => ok(undefined),
    close: async () => {
      closed.value = true
    },
  }
}

describe('startMirrorSession', () => {
  it('đăng ký phiên mới khi serial chưa bận', async () => {
    const registry = new MirrorSessionRegistry<MirrorDeviceSession>()
    const closed = { value: false }
    const gateway: MirrorDeviceGateway = { start: async () => ok(fakeSession(closed)) }

    const result = await startMirrorSession(
      { gateway, registry },
      request,
      'u1',
      () => 'sess-1',
      new AbortController().signal,
    )

    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.value.id, 'sess-1')
    assert.equal(closed.value, false)
    assert.notEqual(registry.bySerial('emulator-5554'), null)
  })

  it('serial đang bận bởi CHÍNH người này: đóng phiên cũ, mở phiên mới (đổi chất lượng, tab cũ chết)', async () => {
    const registry = new MirrorSessionRegistry<MirrorDeviceSession>()
    const oldClosed = { value: false }
    registry.register({ id: 'sess-0', serial: 'emulator-5554', userId: 'u1', startedAt: 0 }, fakeSession(oldClosed))
    const newClosed = { value: false }
    const gateway: MirrorDeviceGateway = { start: async () => ok(fakeSession(newClosed)) }

    const result = await startMirrorSession(
      { gateway, registry },
      request,
      'u1',
      () => 'sess-1',
      new AbortController().signal,
    )

    assert.equal(result.ok, true)
    assert.equal(oldClosed.value, true)
    assert.equal(newClosed.value, false)
    assert.equal(registry.bySerial('emulator-5554')?.id, 'sess-1')
    // Route cũ `release('sess-0')` tới trễ — không được xoá chỉ mục của phiên mới.
    registry.release('sess-0')
    assert.equal(registry.bySerial('emulator-5554')?.id, 'sess-1')
  })

  it('serial đang bận bởi người KHÁC: trả lỗi conflict, KHÔNG gọi gateway.start', async () => {
    const registry = new MirrorSessionRegistry<MirrorDeviceSession>()
    registry.register(
      { id: 'sess-0', serial: 'emulator-5554', userId: 'u0', startedAt: 0 },
      fakeSession({ value: false }),
    )
    let gatewayCalled = false
    const gateway: MirrorDeviceGateway = {
      start: async () => {
        gatewayCalled = true
        return ok(fakeSession({ value: false }))
      },
    }

    const result = await startMirrorSession(
      { gateway, registry },
      request,
      'u1',
      () => 'sess-1',
      new AbortController().signal,
    )

    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.kind, 'conflict')
    assert.equal(gatewayCalled, false)
  })

  it('register hỏng vì một cuộc đua thật (hai lời gọi đan xen) → đóng phiên vừa mở của chính nó', async () => {
    const registry = new MirrorSessionRegistry<MirrorDeviceSession>()
    const closedA = { value: false }
    const closedB = { value: false }

    // Gateway của lời gọi A cố tình treo tới khi được "thả" — mô phỏng đúng
    // khe hở giữa lúc A đã qua bySerial() (thấy trống) và lúc A gọi register(),
    // đủ để lời gọi B chen vào và chiếm serial trước.
    let releaseA: () => void = () => {}
    const gatewayA: MirrorDeviceGateway = {
      start: () =>
        new Promise((resolve) => {
          releaseA = () => resolve(ok(fakeSession(closedA)))
        }),
    }
    const gatewayB: MirrorDeviceGateway = { start: async () => ok(fakeSession(closedB)) }

    const callA = startMirrorSession(
      { gateway: gatewayA, registry },
      request,
      'u1',
      () => 'sess-A',
      new AbortController().signal,
    )
    await Promise.resolve() // nhường lượt cho A chạy tới bySerial() rồi treo ở gateway.start()

    const resultB = await startMirrorSession(
      { gateway: gatewayB, registry },
      request,
      'u2',
      () => 'sess-B',
      new AbortController().signal,
    )
    assert.equal(resultB.ok, true) // B chiếm serial trước, không biết gì về A

    releaseA() // giờ mới cho A xong gateway.start()
    const resultA = await callA

    assert.equal(resultA.ok, false)
    if (!resultA.ok) assert.equal(resultA.error.kind, 'conflict')
    assert.equal(closedA.value, true) // A phải tự đóng phiên vừa mở của mình
    assert.equal(closedB.value, false) // B không bị ảnh hưởng
  })
})
