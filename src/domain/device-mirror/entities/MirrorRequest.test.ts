import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_MIRROR_QUALITY, normalizeMirrorRequest } from './MirrorRequest'

describe('normalizeMirrorRequest', () => {
  it('áp mặc định khi thiếu ba tham số chất lượng và `control`', () => {
    const result = normalizeMirrorRequest({ serial: 'emulator-5554' })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.value.maxSize, DEFAULT_MIRROR_QUALITY.maxSize)
      assert.equal(result.value.maxFps, DEFAULT_MIRROR_QUALITY.maxFps)
      assert.equal(result.value.bitRateMbps, DEFAULT_MIRROR_QUALITY.bitRateMbps)
      assert.equal(result.value.control, false)
    }
  })

  it('nhận giá trị hợp lệ trong enum, kể cả 0 = độ phân giải gốc', () => {
    const result = normalizeMirrorRequest({
      serial: 'R58M12ABCDE',
      maxSize: 0,
      maxFps: 30,
      bitRateMbps: 2,
      control: true,
    })
    assert.deepEqual(result, {
      ok: true,
      value: { serial: 'R58M12ABCDE', maxSize: 0, maxFps: 30, bitRateMbps: 2, control: true },
    })
  })

  it('từ chối serial không an toàn — chặn trước khi rơi vào dòng lệnh adb', () => {
    const result = normalizeMirrorRequest({ serial: '-danger' })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.kind, 'validation')
  })

  it('từ chối giá trị ngoài enum của cả ba tham số chất lượng', () => {
    for (const bad of [{ maxSize: 9999 }, { maxFps: 24 }, { bitRateMbps: 100 }]) {
      const result = normalizeMirrorRequest({ serial: 'emulator-5554', ...bad })
      assert.equal(result.ok, false, JSON.stringify(bad))
      if (!result.ok) assert.equal(result.error.kind, 'validation')
    }
  })

  it('từ chối raw không phải object, thiếu serial, hoặc `control` sai kiểu', () => {
    assert.equal(normalizeMirrorRequest(null).ok, false)
    assert.equal(normalizeMirrorRequest('emulator-5554').ok, false)
    assert.equal(normalizeMirrorRequest({}).ok, false)
    assert.equal(normalizeMirrorRequest({ serial: 'emulator-5554', control: 'yes' }).ok, false)
  })
})
