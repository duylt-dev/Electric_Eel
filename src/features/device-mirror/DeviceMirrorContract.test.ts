import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  canControl,
  initialDeviceMirrorState,
  knownFrameSize,
  qualityLabel,
  snapshotFileName,
} from './DeviceMirrorContract'

describe('knownFrameSize', () => {
  it('0×0 (meta trước khi Tango đọc SPS) là chưa biết → null', () => {
    assert.equal(knownFrameSize(0, 0), null)
    assert.equal(knownFrameSize(1080, 0), null)
  })

  it('có kích cỡ thật thì trả đúng cặp số', () => {
    assert.deepEqual(knownFrameSize(1080, 2400), { width: 1080, height: 2400 })
  })
})

describe('snapshotFileName', () => {
  it('định dạng mirror-<serial>-YYYYMMDD-HHMM.png', () => {
    // Tháng đếm từ 0 trong `Date`: tháng 9 là index 8.
    const at = new Date(2026, 8, 13, 9, 5)
    assert.equal(snapshotFileName('RF8Y60B9NCZ', at), 'mirror-RF8Y60B9NCZ-20260913-0905.png')
  })

  it('đệm số 0 cho giờ/phút một chữ số', () => {
    const at = new Date(2026, 0, 3, 1, 2)
    assert.equal(snapshotFileName('emulator-5554', at), 'mirror-emulator-5554-20260103-0102.png')
  })
})

describe('canControl', () => {
  const streaming = {
    ...initialDeviceMirrorState('RF8Y60B9NCZ'),
    status: 'streaming' as const,
    sessionId: 's1',
    controlEnabled: true,
  }

  it('đủ ba điều kiện (streaming + bật điều khiển + có phiên) thì cho điều khiển', () => {
    assert.equal(canControl(streaming), true)
  })

  it('chưa bật điều khiển thì không cho', () => {
    assert.equal(canControl({ ...streaming, controlEnabled: false }), false)
  })

  it('chưa có phiên (sessionId null) thì không cho', () => {
    assert.equal(canControl({ ...streaming, sessionId: null }), false)
  })

  it('chưa streaming (ví dụ đang connecting) thì không cho dù các cờ khác đã bật', () => {
    assert.equal(canControl({ ...streaming, status: 'connecting' }), false)
  })
})

describe('qualityLabel', () => {
  it('maxSize 0 hiện "Gốc" thay vì "0p"', () => {
    assert.equal(qualityLabel({ maxSize: 0, maxFps: 60, bitRateMbps: 8 }), 'Gốc · 60fps · 8Mbps')
  })

  it('maxSize khác 0 hiện <n>p', () => {
    assert.equal(qualityLabel({ maxSize: 1440, maxFps: 30, bitRateMbps: 4 }), '1440p · 30fps · 4Mbps')
  })
})
