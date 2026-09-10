import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_LOGCAT_FILTER } from '@/domain/adb/entities/LogcatFilter'
import type { LogLevel, LogcatLine } from '@/domain/adb/entities/LogcatLine'
import { initialAdbLogcatState, visibleLines } from './AdbLogcatContract'

const line = (level: LogcatLine['level'], tag: string, message: string, seq: number): LogcatLine => ({
  seq,
  time: '09-10 17:41:13.818',
  pid: 1,
  tid: 1,
  level,
  tag,
  message,
})

describe('visibleLines', () => {
  it('lọc theo mức và tag, nhưng không lọc theo query tìm kiếm', () => {
    const state = {
      ...initialAdbLogcatState('RF8Y60B9NCZ', 'co.rbxclothesmaker'),
      lines: [
        line('D', 'TESTERADSEVENT', 'start load AdmobNativeAd', 0),
        line('I', 'Firebase', 'config fetched', 1),
        line('E', 'TESTERADSEVENT', 'no fill', 2),
      ],
      filter: {
        ...DEFAULT_LOGCAT_FILTER,
        levels: ['D', 'E'] satisfies readonly LogLevel[],
        tag: 'TESTER',
        query: 'AdmobNativeAd',
      },
    }

    assert.deepEqual(
      visibleLines(state).map((entry) => entry.seq),
      [0, 2],
    )
  })
})
