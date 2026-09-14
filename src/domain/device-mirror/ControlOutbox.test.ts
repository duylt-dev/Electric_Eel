import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ControlOutbox } from './ControlOutbox'
import type { MirrorControlMessage } from './entities/MirrorControlMessage'

const move = (pointer: number, nx: number): MirrorControlMessage => ({
  type: 'touch',
  action: 'move',
  pointer,
  nx,
  ny: 0.5,
  pressure: 1,
})
const down = (pointer: number): MirrorControlMessage => ({
  type: 'touch',
  action: 'down',
  pointer,
  nx: 0.5,
  ny: 0.5,
  pressure: 1,
})
const up = (pointer: number): MirrorControlMessage => ({
  type: 'touch',
  action: 'up',
  pointer,
  nx: 0.5,
  ny: 0.5,
  pressure: 1,
})

/** Chỉ dùng trong test: đọc field của một thông điệp touch, báo lỗi rõ ràng nếu sai hình dạng. */
function touchField<K extends 'action' | 'nx'>(message: MirrorControlMessage | undefined, key: K) {
  assert.ok(message?.type === 'touch', `mong đợi thông điệp touch, nhận ${JSON.stringify(message)}`)
  return message[key]
}

describe('ControlOutbox', () => {
  it('kịch bản kéo: down, 10 move, up → chỉ còn 3 thông điệp', () => {
    const outbox = new ControlOutbox()
    outbox.push(down(0))
    for (let i = 0; i < 10; i++) outbox.push(move(0, i))
    outbox.push(up(0))

    const taken = outbox.take()
    assert.equal(taken.length, 3)
    assert.equal(touchField(taken[0], 'action'), 'down')
    assert.equal(touchField(taken[1], 'action'), 'move')
    assert.equal(touchField(taken[1], 'nx'), 9) // chỉ còn move CUỐI CÙNG
    assert.equal(touchField(taken[2], 'action'), 'up')
    assert.equal(outbox.size, 0)
  })

  it('hai pointer đan xen: mỗi pointer gộp move của riêng nó, không lẫn nhau', () => {
    const outbox = new ControlOutbox()
    outbox.push(down(0))
    outbox.push(down(1))
    for (let i = 0; i < 5; i++) {
      outbox.push(move(0, i))
      outbox.push(move(1, i + 100))
    }

    const taken = outbox.take()
    assert.equal(taken.length, 4) // down0, down1, move0(cuối), move1(cuối)

    const move0 = taken.find((m) => m.type === 'touch' && m.action === 'move' && m.pointer === 0)
    const move1 = taken.find((m) => m.type === 'touch' && m.action === 'move' && m.pointer === 1)
    assert.equal(touchField(move0, 'nx'), 4)
    assert.equal(touchField(move1, 'nx'), 104)
  })

  it('move sau up không bị gộp với move trước up — hai cú chạm riêng biệt', () => {
    const outbox = new ControlOutbox()
    outbox.push(down(0))
    outbox.push(move(0, 1))
    outbox.push(move(0, 2)) // gộp với move(0,1) → còn move(0,2)
    outbox.push(up(0))
    outbox.push(move(0, 99)) // cú chạm MỚI, dù trùng pointer id — không được gộp ngược về move(0,2)

    const taken = outbox.take()
    assert.equal(taken.length, 4) // down, move(2), up, move(99)
    assert.equal(touchField(taken[1], 'nx'), 2)
    assert.equal(touchField(taken[2], 'action'), 'up')
    assert.equal(touchField(taken[3], 'nx'), 99)
  })

  it('take(max) chỉ lấy đúng số lượng yêu cầu, phần còn lại vẫn gộp đúng ở lượt sau', () => {
    const outbox = new ControlOutbox()
    outbox.push(down(0))
    outbox.push(move(0, 1))

    const firstBatch = outbox.take(1)
    assert.equal(firstBatch.length, 1)
    assert.equal(outbox.size, 1)

    // move mới vẫn phải gộp đúng vào move còn lại trong hàng đợi, không tạo
    // thêm một bản ghi move thứ hai.
    outbox.push(move(0, 2))
    const secondBatch = outbox.take()
    assert.equal(secondBatch.length, 1)
    assert.equal(touchField(secondBatch[0], 'nx'), 2)
  })
})
