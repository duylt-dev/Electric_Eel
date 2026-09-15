import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { normalizePointer, wheelToScroll } from './pointerToTouch'

const rect = { left: 100, top: 50, width: 400, height: 800 }

describe('normalizePointer', () => {
  it('bốn góc canvas ra đúng 0/1', () => {
    assert.deepEqual(normalizePointer({ clientX: 100, clientY: 50 }, rect), { nx: 0, ny: 0 })
    assert.deepEqual(normalizePointer({ clientX: 500, clientY: 50 }, rect), { nx: 1, ny: 0 })
    assert.deepEqual(normalizePointer({ clientX: 100, clientY: 850 }, rect), { nx: 0, ny: 1 })
    assert.deepEqual(normalizePointer({ clientX: 500, clientY: 850 }, rect), { nx: 1, ny: 1 })
  })

  it('điểm giữa ra 0.5/0.5', () => {
    assert.deepEqual(normalizePointer({ clientX: 300, clientY: 450 }, rect), { nx: 0.5, ny: 0.5 })
  })

  it('ngoài biên thì kẹp về mép, không âm và không quá 1', () => {
    assert.deepEqual(normalizePointer({ clientX: -20, clientY: 2000 }, rect), { nx: 0, ny: 1 })
  })

  it('khung rỗng không sinh NaN', () => {
    assert.deepEqual(normalizePointer({ clientX: 10, clientY: 10 }, { left: 0, top: 0, width: 0, height: 0 }), {
      nx: 0,
      ny: 0,
    })
  })
})

describe('wheelToScroll', () => {
  it('một nấc lăn xuống (deltaY = 100) là dy = -1 theo quy ước Android', () => {
    assert.deepEqual(wheelToScroll(0, 100), { dx: 0, dy: -1 })
  })

  it('lăn lên là dy dương; ngang giữ nguyên chiều', () => {
    assert.deepEqual(wheelToScroll(50, -100), { dx: 0.5, dy: 1 })
  })

  it('kẹp về [-1, 1] với trackpad lăn mạnh', () => {
    assert.deepEqual(wheelToScroll(-900, 900), { dx: -1, dy: -1 })
  })
})
