import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MIRROR_KEYCODES } from './MirrorControlMessage'
import { validateControlBatch } from './validateMirrorControlBatch'

describe('validateControlBatch', () => {
  it('nhận một lô hợp lệ với đủ tám loại thông điệp', () => {
    const result = validateControlBatch([
      { type: 'touch', action: 'down', pointer: 0, nx: 0.5, ny: 0.5, pressure: 1 },
      { type: 'scroll', nx: 0.2, ny: 0.3, dx: -0.5, dy: 0.5 },
      { type: 'key', action: 'down', key: 'back' },
      { type: 'text', text: 'hello' },
      { type: 'backOrScreenOn', action: 'up' },
      { type: 'displayPower', on: true },
      { type: 'rotate' },
      { type: 'expandNotifications' },
    ])
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.value.length, 8)
  })

  it('từ chối khi raw không phải mảng', () => {
    assert.equal(validateControlBatch('not-array').ok, false)
    assert.equal(validateControlBatch(null).ok, false)
  })

  it('giới hạn tối đa 64 thông điệp mỗi lô, nhưng đúng 64 vẫn hợp lệ', () => {
    const tooMany = Array.from({ length: 65 }, () => ({ type: 'rotate' }))
    const overLimit = validateControlBatch(tooMany)
    assert.equal(overLimit.ok, false)
    if (!overLimit.ok) assert.equal(overLimit.error.kind, 'validation')

    const exactly64 = Array.from({ length: 64 }, () => ({ type: 'rotate' }))
    assert.equal(validateControlBatch(exactly64).ok, true)
  })

  it('từ chối NaN/Infinity trong toạ độ chạm', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = validateControlBatch([
        { type: 'touch', action: 'move', pointer: 0, nx: bad, ny: 0.5, pressure: 1 },
      ])
      assert.equal(result.ok, false, String(bad))
    }
  })

  it('từ chối toạ độ âm ngoài [0,1] và pointer âm', () => {
    assert.equal(
      validateControlBatch([{ type: 'touch', action: 'move', pointer: 0, nx: -0.1, ny: 0.5, pressure: 1 }]).ok,
      false,
    )
    assert.equal(
      validateControlBatch([{ type: 'touch', action: 'move', pointer: -1, nx: 0.5, ny: 0.5, pressure: 1 }]).ok,
      false,
    )
  })

  it('từ chối khoá lạ không nằm trong MIRROR_KEYCODES', () => {
    const result = validateControlBatch([{ type: 'key', action: 'down', key: 'ctrlAltDelete' }])
    assert.equal(result.ok, false)
    assert.equal('ctrlAltDelete' in MIRROR_KEYCODES, false)
  })

  it('từ chối text vượt 300 ký tự, chấp nhận đúng 300', () => {
    const overLimit = validateControlBatch([{ type: 'text', text: 'a'.repeat(301) }])
    assert.equal(overLimit.ok, false)
    if (!overLimit.ok) assert.equal(overLimit.error.kind, 'validation')

    assert.equal(validateControlBatch([{ type: 'text', text: 'a'.repeat(300) }]).ok, true)
  })

  it('lọc ký tự điều khiển khỏi text nhưng giữ lại dòng mới', () => {
    const escape = String.fromCharCode(27) // ESC — ký tự điều khiển điển hình
    const tab = String.fromCharCode(9)
    const result = validateControlBatch([{ type: 'text', text: `a${escape}b${tab}c\nd` }])

    assert.equal(result.ok, true)
    if (result.ok) {
      const message = result.value[0]
      assert.equal(message?.type, 'text')
      if (message?.type === 'text') assert.equal(message.text, 'abc\nd')
    }
  })
})
