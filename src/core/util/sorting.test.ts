import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { compareBoolean, compareText, sortItems, toggleSort } from './sorting'

describe('compareText', () => {
  it('xếp chữ có dấu theo bảng chữ cái tiếng Việt chứ không theo mã Unicode', () => {
    const sorted = ['Đóng', 'Dịch', 'Anh', 'ăn'].sort(compareText)
    assert.deepEqual(sorted, ['Anh', 'ăn', 'Dịch', 'Đóng'])
  })

  it('coi hoa và thường là một chữ', () => {
    assert.equal(compareText('abc', 'ABC'), 0)
  })

  it('so số bên trong chuỗi theo giá trị', () => {
    assert.ok(compareText('app 2', 'app 10') < 0)
  })
})

describe('compareBoolean', () => {
  it('false đứng trước true', () => {
    assert.ok(compareBoolean(false, true) < 0)
    assert.equal(compareBoolean(true, true), 0)
  })
})

describe('toggleSort', () => {
  it('bấm lại cột đang sắp xếp thì đảo chiều', () => {
    assert.deepEqual(toggleSort({ key: 'name', direction: 'asc' }, 'name'), { key: 'name', direction: 'desc' })
    assert.deepEqual(toggleSort({ key: 'name', direction: 'desc' }, 'name'), { key: 'name', direction: 'asc' })
  })

  it('bấm cột khác thì sang cột đó, tăng dần', () => {
    assert.deepEqual(toggleSort({ key: 'name', direction: 'desc' }, 'email'), { key: 'email', direction: 'asc' })
  })
})

describe('sortItems', () => {
  const items = [3, 1, 2]

  it('trả mảng mới, không đụng mảng gốc', () => {
    const sorted = sortItems(items, (a, b) => a - b)
    assert.deepEqual(sorted, [1, 2, 3])
    assert.deepEqual(items, [3, 1, 2])
  })

  it('giảm dần là đảo dấu của bộ so', () => {
    assert.deepEqual(sortItems(items, (a, b) => a - b, 'desc'), [3, 2, 1])
  })
})
