import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { LogcatEvent } from '../entities/LogcatSession'
import { createFollowEventBatcher } from './batchFollowEvents'

describe('createFollowEventBatcher', () => {
  it('gom dòng tới trần rồi mới đẩy, và xả trước một mốc', () => {
    const sent: LogcatEvent[] = []
    const batcher = createFollowEventBatcher((event) => sent.push(event), { flushLines: 2, flushMs: 10_000 })

    batcher.emit({ type: 'line', line: 'a' })
    assert.deepEqual(sent, [])
    batcher.emit({ type: 'line', line: 'b' })
    assert.deepEqual(sent, [{ type: 'lines', lines: ['a', 'b'] }])

    batcher.emit({ type: 'line', line: 'c' })
    batcher.emit({ type: 'detached', pid: 7 })
    assert.deepEqual(sent.slice(1), [{ type: 'lines', lines: ['c'] }, { type: 'detached', pid: 7 }])

    batcher.stop()
  })

  it('stop xả phần còn lại đúng một lần', () => {
    const sent: LogcatEvent[] = []
    const batcher = createFollowEventBatcher((event) => sent.push(event), { flushLines: 100, flushMs: 10_000 })
    batcher.emit({ type: 'line', line: 'cuối' })
    batcher.stop()
    assert.deepEqual(sent, [{ type: 'lines', lines: ['cuối'] }])
  })
})
