import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { mapWithLimit } from './concurrency'

describe('mapWithLimit', () => {
  it('giữ thứ tự theo đầu vào, không theo thứ tự hoàn thành', async () => {
    const result = await mapWithLimit([30, 10, 20], 3, async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay))
      return delay
    })
    assert.deepEqual(result, [30, 10, 20])
  })

  it('không bao giờ chạy quá số việc cho phép cùng lúc', async () => {
    let running = 0
    let peak = 0

    await mapWithLimit(Array.from({ length: 20 }, (_, index) => index), 3, async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 1))
      running -= 1
      return null
    })

    assert.equal(peak, 3)
  })

  it('chạy hết mọi phần tử', async () => {
    const result = await mapWithLimit([1, 2, 3, 4, 5], 2, (value) => Promise.resolve(value * 2))
    assert.deepEqual(result, [2, 4, 6, 8, 10])
  })

  it('mảng rỗng thì không chạy gì', async () => {
    assert.deepEqual(await mapWithLimit([], 4, () => Promise.reject(new Error('không được gọi'))), [])
  })
})
