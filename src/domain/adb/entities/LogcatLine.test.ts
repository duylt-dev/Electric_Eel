import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { formatLogcatLine, parseLogcatLine } from './LogcatLine'

describe('parseLogcatLine', () => {
  it('tách được một dòng threadtime đầy đủ', () => {
    const line = parseLogcatLine('09-02 21:33:12.345  1234  1300 D OkHttp: --> GET https://a.b', 7)

    assert.equal(line?.seq, 7)
    assert.equal(line?.time, '09-02 21:33:12.345')
    assert.equal(line?.pid, 1234)
    assert.equal(line?.tid, 1300)
    assert.equal(line?.level, 'D')
    assert.equal(line?.tag, 'OkHttp')
    assert.equal(line?.message, '--> GET https://a.b')
  })

  it('giữ nguyên dấu hai chấm nằm trong nội dung', () => {
    const line = parseLogcatLine('09-02 21:33:12.345  1  1 E App: lỗi: không mở được tệp', 0)
    assert.equal(line?.tag, 'App')
    assert.equal(line?.message, 'lỗi: không mở được tệp')
  })

  it('đọc được tag có khoảng trắng', () => {
    const line = parseLogcatLine('09-02 21:33:12.345  1  1 W My Tag: gì đó', 0)
    assert.equal(line?.tag, 'My Tag')
  })

  it('bỏ qua dòng phân cách và dòng trống', () => {
    assert.equal(parseLogcatLine('--------- beginning of main', 0), null)
    assert.equal(parseLogcatLine('   ', 0), null)
  })

  it('giữ lại dòng không khớp định dạng thay vì vứt đi', () => {
    // Mất một khúc stack trace vì trình phân tích không hiểu là kiểu hỏng tệ nhất.
    const line = parseLogcatLine('\tat com.pion.Foo.bar(Foo.kt:42)', 3)
    assert.equal(line?.message, '\tat com.pion.Foo.bar(Foo.kt:42)')
    assert.equal(line?.tag, '')
    assert.equal(line?.time, '')
  })

  it('quy mức S về V để không sinh thêm một nhánh không ai vẽ', () => {
    assert.equal(parseLogcatLine('09-02 21:33:12.345  1  1 S T: x', 0)?.level, 'V')
  })
})

describe('formatLogcatLine', () => {
  it('dựng lại được dòng để ghi ra tệp', () => {
    const raw = '09-02 21:33:12.345  1234  1300 D OkHttp: hello'
    const line = parseLogcatLine(raw, 0)
    assert.ok(line !== null)
    assert.equal(formatLogcatLine(line), raw)
  })

  it('dòng không phân tích được thì xuất nguyên văn', () => {
    const line = parseLogcatLine('\tat Foo.bar()', 0)
    assert.ok(line !== null)
    assert.equal(formatLogcatLine(line), '\tat Foo.bar()')
  })
})
