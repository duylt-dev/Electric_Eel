import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MirrorSessionRegistry } from './MirrorSessionRegistry'

describe('MirrorSessionRegistry', () => {
  it('đăng ký rồi tìm lại đúng chủ, kèm đúng handle đã truyền', () => {
    const registry = new MirrorSessionRegistry<string>()
    const registered = registry.register(
      { id: 'sess-1', serial: 'emulator-5554', userId: 'u1', startedAt: 1000 },
      'handle-1',
    )
    assert.equal(registered.ok, true)

    const found = registry.find('sess-1', 'u1')
    assert.equal(found.ok, true)
    if (found.ok) {
      assert.equal(found.value.handle, 'handle-1')
      assert.equal(found.value.serial, 'emulator-5554')
    }
  })

  it('trùng serial → conflict, kể cả khi id phiên khác nhau', () => {
    const registry = new MirrorSessionRegistry<string>()
    registry.register({ id: 'sess-1', serial: 'emulator-5554', userId: 'u1', startedAt: 1000 }, 'h1')

    const second = registry.register({ id: 'sess-2', serial: 'emulator-5554', userId: 'u2', startedAt: 2000 }, 'h2')
    assert.equal(second.ok, false)
    if (!second.ok) assert.equal(second.error.kind, 'conflict')
  })

  it('sai chủ → forbidden; phiên không tồn tại → notFound', () => {
    const registry = new MirrorSessionRegistry<string>()
    registry.register({ id: 'sess-1', serial: 'emulator-5554', userId: 'u1', startedAt: 1000 }, 'h1')

    const wrongOwner = registry.find('sess-1', 'u2')
    assert.equal(wrongOwner.ok, false)
    if (!wrongOwner.ok) assert.equal(wrongOwner.error.kind, 'forbidden')

    const notFound = registry.find('sess-missing', 'u1')
    assert.equal(notFound.ok, false)
    if (!notFound.ok) assert.equal(notFound.error.kind, 'notFound')
  })

  it('release rồi đăng ký lại cùng serial được, bySerial trả null sau khi release', () => {
    const registry = new MirrorSessionRegistry<string>()
    registry.register({ id: 'sess-1', serial: 'emulator-5554', userId: 'u1', startedAt: 1000 }, 'h1')
    registry.release('sess-1')

    assert.equal(registry.bySerial('emulator-5554'), null)

    const reRegistered = registry.register(
      { id: 'sess-2', serial: 'emulator-5554', userId: 'u1', startedAt: 2000 },
      'h2',
    )
    assert.equal(reRegistered.ok, true)
  })

  it('release một id không tồn tại thì không làm gì, không ném lỗi', () => {
    const registry = new MirrorSessionRegistry<string>()
    assert.doesNotThrow(() => registry.release('không-tồn-tại'))
  })

  it('bySerial trả về đúng phiên đang giữ serial đó, null nếu serial lạ', () => {
    const registry = new MirrorSessionRegistry<string>()
    registry.register({ id: 'sess-1', serial: 'emulator-5554', userId: 'u1', startedAt: 1000 }, 'h1')

    assert.equal(registry.bySerial('emulator-5554')?.id, 'sess-1')
    assert.equal(registry.bySerial('serial-lạ'), null)
  })
})
