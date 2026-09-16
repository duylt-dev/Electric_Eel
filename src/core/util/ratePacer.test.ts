import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createRatePacer } from './ratePacer'

/** Ghi lại các khoảng chờ được yêu cầu thay vì ngủ thật. */
const recordingSleep = () => {
  const waits: number[] = []
  const sleep = (ms: number): Promise<boolean> => {
    waits.push(ms)
    return Promise.resolve(true)
  }
  return { waits, sleep }
}

describe('createRatePacer', () => {
  it('không giữ nhịp khi perMinute là 0', async () => {
    const { waits, sleep } = recordingSleep()
    const pacer = createRatePacer(0, sleep)
    for (let i = 0; i < 5; i += 1) assert.equal(await pacer.acquire(), true)
    assert.deepEqual(waits, [])
  })

  it('lượt đầu đi ngay, các lượt sau cách nhau đúng 60000 / perMinute', async () => {
    const { waits, sleep } = recordingSleep()
    const pacer = createRatePacer(6, sleep)

    await pacer.acquire()
    await pacer.acquire()
    await pacer.acquire()

    assert.equal(waits.length, 2)
    // Khoảng chờ sát 10 giây và 20 giây; cho phép lệch vài mili giây do đồng hồ thật.
    assert.ok(Math.abs((waits[0] ?? 0) - 10_000) < 50)
    assert.ok(Math.abs((waits[1] ?? 0) - 20_000) < 50)
  })

  it('hold đẩy lùi lượt kế tiếp ít nhất bằng khoảng được yêu cầu', async () => {
    const { waits, sleep } = recordingSleep()
    const pacer = createRatePacer(60, sleep)

    await pacer.acquire()
    pacer.hold(30_000)
    await pacer.acquire()

    assert.ok((waits[0] ?? 0) >= 29_900, `phải chờ gần 30 giây, nhận ${waits[0]}`)
  })

  it('bị huỷ trong lúc chờ thì trả false', async () => {
    const pacer = createRatePacer(60, () => Promise.resolve(false))
    await pacer.acquire()
    assert.equal(await pacer.acquire(), false)
  })
})
