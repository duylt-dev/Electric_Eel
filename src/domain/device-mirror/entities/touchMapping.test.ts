import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isAsciiText, toDevicePoint } from './touchMapping'

describe('toDevicePoint', () => {
  // Kích cỡ thật đo được trên máy thử ở spike (maxSize=1440): 664×1440 (portrait).
  const size = { width: 664, height: 1440 }

  it('nhân toạ độ chuẩn hoá với kích cỡ THẬT của video, không phải kích cỡ danh nghĩa', () => {
    assert.deepEqual(toDevicePoint({ nx: 0.5, ny: 0.5 }, size), { x: 332, y: 720 })
  })

  it('kẹp về đúng biên khi nx/ny chạm đúng 0 hoặc 1', () => {
    assert.deepEqual(toDevicePoint({ nx: 0, ny: 0 }, size), { x: 0, y: 0 })
    assert.deepEqual(toDevicePoint({ nx: 1, ny: 1 }, size), { x: size.width - 1, y: size.height - 1 })
  })

  it('kẹp cả khi toạ độ lỡ vượt [0,1]', () => {
    assert.deepEqual(toDevicePoint({ nx: 1.2, ny: -0.2 }, size), { x: size.width - 1, y: 0 })
  })
})

describe('isAsciiText', () => {
  it('nhận chuỗi ASCII thuần — đi đường injectText', () => {
    assert.equal(isAsciiText('Hello World 123'), true)
  })

  it('từ chối chuỗi có dấu tiếng Việt — phải đi đường clipboard-paste', () => {
    assert.equal(isAsciiText('Xin chào'), false)
  })
})
