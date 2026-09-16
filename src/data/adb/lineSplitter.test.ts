import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { LineSplitter } from './lineSplitter'

describe('LineSplitter', () => {
  it('ghép dòng bị chẻ đôi giữa hai mẩu', () => {
    const lines: string[] = []
    const splitter = new LineSplitter((line) => lines.push(line))
    splitter.push('I/Tag: một dò')
    splitter.push('ng\nI/Tag: hai\n')
    assert.deepEqual(lines, ['I/Tag: một dòng', 'I/Tag: hai'])
  })

  it('flush đẩy nốt dòng dở dang khi nguồn đóng', () => {
    const lines: string[] = []
    const splitter = new LineSplitter((line) => lines.push(line))
    splitter.push('không có xuống dòng')
    assert.deepEqual(lines, [])
    splitter.flush()
    assert.deepEqual(lines, ['không có xuống dòng'])
    splitter.flush()
    assert.deepEqual(lines, ['không có xuống dòng'])
  })

  it('không giữ vô hạn một mẩu không có xuống dòng', () => {
    const lines: string[] = []
    const splitter = new LineSplitter((line) => lines.push(line))
    splitter.push('x'.repeat(LineSplitter.MAX_PARTIAL + 1))
    assert.equal(lines.length, 1)
  })
})
