import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { PAGE_SIZE, clampPage, pageCount, pageRange, pageSlice } from './paging'

const items = Array.from({ length: 132 }, (_, index) => index + 1)

describe('pageCount', () => {
  it('làm tròn lên', () => {
    assert.equal(pageCount(132), 6)
    assert.equal(pageCount(50), 2)
    assert.equal(pageCount(51), 3)
  })

  it('danh sách rỗng vẫn là một trang', () => {
    assert.equal(pageCount(0), 1)
  })
})

describe('clampPage', () => {
  it('kéo về khoảng hợp lệ', () => {
    assert.equal(clampPage(0, 6), 1)
    assert.equal(clampPage(9, 6), 6)
    assert.equal(clampPage(3, 6), 3)
  })

  it('không có trang nào thì vẫn đứng ở trang 1', () => {
    assert.equal(clampPage(4, 0), 1)
  })
})

describe('pageSlice', () => {
  it('cắt đúng 25 mục mỗi trang', () => {
    assert.equal(PAGE_SIZE, 25)
    assert.deepEqual(pageSlice(items, 1).slice(0, 2), [1, 2])
    assert.equal(pageSlice(items, 1).length, 25)
    assert.deepEqual(pageSlice(items, 2)[0], 26)
  })

  it('trang cuối lấy phần dư', () => {
    const last = pageSlice(items, 6)
    assert.equal(last.length, 7)
    assert.equal(last[last.length - 1], 132)
  })

  it('trang ngoài khoảng trả về trang cuối, không phải mảng rỗng', () => {
    assert.deepEqual(pageSlice(items, 99), pageSlice(items, 6))
  })
})

describe('pageRange', () => {
  it('đếm từ 1 và bao gồm cả hai đầu', () => {
    assert.deepEqual(pageRange(1, 132), { from: 1, to: 25, total: 132 })
    assert.deepEqual(pageRange(2, 132), { from: 26, to: 50, total: 132 })
    assert.deepEqual(pageRange(6, 132), { from: 126, to: 132, total: 132 })
  })

  it('danh sách rỗng không có mục nào', () => {
    assert.deepEqual(pageRange(1, 0), { from: 0, to: 0, total: 0 })
  })
})
