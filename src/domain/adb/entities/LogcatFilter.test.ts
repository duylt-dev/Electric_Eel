import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  ALL_LEVELS,
  DEFAULT_LOGCAT_FILTER,
  countByLevel,
  filterLines,
  isDefaultFilter,
  matchesFilter,
  toggleLevel,
} from './LogcatFilter'
import type { LogcatLine } from './LogcatLine'

const line = (level: LogcatLine['level'], tag: string, message: string, seq = 0): LogcatLine => ({
  seq,
  time: '09-02 21:33:12.345',
  pid: 1,
  tid: 1,
  level,
  tag,
  message,
})

const LINES: readonly LogcatLine[] = [
  line('D', 'OkHttp', 'GET /users', 0),
  line('E', 'AdMob', 'no fill', 1),
  line('I', 'Firebase', 'config fetched', 2),
]

describe('matchesFilter', () => {
  it('lọc theo mức', () => {
    assert.equal(matchesFilter(LINES[0]!, { ...DEFAULT_LOGCAT_FILTER, levels: ['E'] }), false)
    assert.equal(matchesFilter(LINES[1]!, { ...DEFAULT_LOGCAT_FILTER, levels: ['E'] }), true)
  })

  it('lọc theo tag, không phân biệt hoa thường', () => {
    assert.equal(matchesFilter(LINES[0]!, { ...DEFAULT_LOGCAT_FILTER, tag: 'okhttp' }), true)
    assert.equal(matchesFilter(LINES[1]!, { ...DEFAULT_LOGCAT_FILTER, tag: 'okhttp' }), false)
  })

  it('ô tìm khớp cả nội dung lẫn tag', () => {
    assert.equal(matchesFilter(LINES[1]!, { ...DEFAULT_LOGCAT_FILTER, query: 'admob' }), true)
    assert.equal(matchesFilter(LINES[0]!, { ...DEFAULT_LOGCAT_FILTER, query: '/users' }), true)
    assert.equal(matchesFilter(LINES[2]!, { ...DEFAULT_LOGCAT_FILTER, query: '/users' }), false)
  })

  it('không mức nào được chọn thì không dòng nào hiện', () => {
    // Rỗng nghĩa là không hiện gì — không phải hiện tất cả.
    assert.deepEqual(filterLines(LINES, { ...DEFAULT_LOGCAT_FILTER, levels: [] }), [])
  })
})

describe('toggleLevel', () => {
  it('bỏ rồi bật lại vẫn giữ đúng thứ tự chuẩn', () => {
    const without = toggleLevel(DEFAULT_LOGCAT_FILTER, 'D')
    assert.deepEqual(without.levels, ['V', 'I', 'W', 'E', 'F'])

    const back = toggleLevel(without, 'D')
    assert.deepEqual(back.levels, [...ALL_LEVELS])
  })
})

describe('isDefaultFilter', () => {
  it('nhận ra bộ lọc chưa ai đụng vào', () => {
    assert.equal(isDefaultFilter(DEFAULT_LOGCAT_FILTER), true)
    assert.equal(isDefaultFilter({ ...DEFAULT_LOGCAT_FILTER, query: 'x' }), false)
    assert.equal(isDefaultFilter(toggleLevel(DEFAULT_LOGCAT_FILTER, 'V')), false)
  })
})

describe('countByLevel', () => {
  it('đếm đủ sáu mức, kể cả mức không có dòng nào', () => {
    assert.deepEqual(countByLevel(LINES), { V: 0, D: 1, I: 1, W: 0, E: 1, F: 0 })
  })
})
