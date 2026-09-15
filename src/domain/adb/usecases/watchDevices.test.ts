import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AppErrors, type Result, err, ok } from '../../../core/result'
import type { DeviceWatchEvent } from '../entities/DeviceWatchEvent'
import type { AdbRunOutput, AdbShell } from '../repositories/AdbShell'
import { watchDevices } from './watchDevices'

const HEADER = 'List of devices attached\n'
const A = 'A\tdevice product:p model:M1 transport_id:1\n'
const B = 'B\tunauthorized transport_id:2\n'

/** Mỗi lượt `run` trả lần lượt từng kịch bản; hết kịch bản thì huỷ luồng. */
function shellPlaying(turns: Result<AdbRunOutput>[], controller: AbortController): AdbShell {
  let index = 0
  return {
    async run(): Promise<Result<AdbRunOutput>> {
      const turn = turns[index]
      index += 1
      if (turn === undefined) {
        controller.abort()
        return ok({ stdout: HEADER, stderr: '', code: 0 })
      }
      return turn
    },
    async stream() {
      return ok({ code: 0, stderr: '' })
    },
  }
}

const listing = (body: string): Result<AdbRunOutput> => ok({ stdout: HEADER + body, stderr: '', code: 0 })

describe('watchDevices', () => {
  it('chỉ báo khi danh sách đổi, kể cả về rỗng', async () => {
    const controller = new AbortController()
    const shell = shellPlaying(
      [listing(A), listing(A), listing(A + B), listing(''), listing('')],
      controller,
    )
    const events: DeviceWatchEvent[] = []

    await watchDevices(shell, (event) => events.push(event), controller.signal, { intervalMs: 1 })

    assert.deepEqual(
      events.map((event) => (event.type === 'devices' ? event.devices.map((d) => d.serial).join(',') : 'failed')),
      ['A', 'A,B', ''],
    )
  })

  it('lỗi một nhịp thì báo một lần rồi đi tiếp, lượt tốt sau đó vẫn về', async () => {
    const controller = new AbortController()
    const boom = err(AppErrors.upstream('adb lỡ nhịp'))
    const shell = shellPlaying([listing(A), boom, boom, listing(A + B)], controller)
    const events: DeviceWatchEvent[] = []

    await watchDevices(shell, (event) => events.push(event), controller.signal, { intervalMs: 1 })

    assert.deepEqual(
      events.map((event) => event.type),
      ['devices', 'failed', 'devices'],
    )
  })
})
