import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MIRROR_QUALITY, normalizeMirrorRequest } from './MirrorRequest'

describe('MIRROR_QUALITY', () => {
  it('cố định ở mức cao nhất: độ phân giải gốc, fps không chặn, 12 Mbps', () => {
    assert.deepEqual(MIRROR_QUALITY, { maxSize: 0, maxFps: 0, bitRateMbps: 12 })
  })
})

describe('normalizeMirrorRequest', () => {
  it('chỉ giữ serial và control — tham số chất lượng gửi kèm bị BỎ QUA, không lọt xuống gateway', () => {
    const result = normalizeMirrorRequest({ serial: 'emulator-5554', maxSize: 9999, maxFps: 1, bitRateMbps: 100 })
    assert.deepEqual(result, { ok: true, value: { serial: 'emulator-5554', control: false } })
  })

  it('nhận control: true', () => {
    const result = normalizeMirrorRequest({ serial: 'R58M12ABCDE', control: true })
    assert.deepEqual(result, { ok: true, value: { serial: 'R58M12ABCDE', control: true } })
  })

  it('từ chối serial không an toàn — chặn trước khi rơi vào dòng lệnh adb', () => {
    const result = normalizeMirrorRequest({ serial: '-danger' })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.kind, 'validation')
  })

  it('từ chối raw không phải object, thiếu serial, hoặc `control` sai kiểu', () => {
    assert.equal(normalizeMirrorRequest(null).ok, false)
    assert.equal(normalizeMirrorRequest('emulator-5554').ok, false)
    assert.equal(normalizeMirrorRequest({}).ok, false)
    assert.equal(normalizeMirrorRequest({ serial: 'emulator-5554', control: 'yes' }).ok, false)
  })
})
