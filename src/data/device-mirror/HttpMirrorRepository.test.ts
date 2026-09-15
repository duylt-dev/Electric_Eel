import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { MirrorControlMessage } from '../../domain/device-mirror/entities/MirrorControlMessage'
import { encodeMirrorEvent } from '../../domain/device-mirror/entities/mirrorFrameCodec'
import type { MirrorRequest } from '../../domain/device-mirror/entities/MirrorRequest'
import type { MirrorStreamEvent } from '../../domain/device-mirror/entities/MirrorStreamEvent'
import { HttpMirrorRepository } from './HttpMirrorRepository'

/**
 * Test PHẦN THUẦN của `HttpMirrorRepository` — không cần trình duyệt thật, chỉ
 * cần `fetch` giả (tiêm qua constructor) trả một `Response` dựng tay. Không
 * test được ở đây: hành vi thật của `AbortController` khi huỷ một `fetch`
 * đang bay (đó là việc của trình duyệt/runtime, không phải của lớp này) —
 * chỉ test PHẢN ỨNG của repository khi `signal` đã/đang huỷ.
 */

const REQUEST: MirrorRequest = { serial: 'RF8Y60B9NCZ', control: true }

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/** Cắt một mảng byte thành nhiều mẩu KHÔNG theo ranh giới message — mô phỏng
 *  TCP segment thật, cùng cách `spike-report.md` §4 đã kiểm bộ phân tách. */
function fragmentAt(bytes: Uint8Array, cutPoints: readonly number[]): Uint8Array[] {
  const parts: Uint8Array[] = []
  let start = 0
  for (const cut of cutPoints) {
    parts.push(bytes.slice(start, cut))
    start = cut
  }
  parts.push(bytes.slice(start))
  return parts
}

function streamOf(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

describe('HttpMirrorRepository.stream', () => {
  it('đọc khung cắt giữa nhiều mẩu, gọi onEvent đúng thứ tự, trả ok', async () => {
    const metaEvent: MirrorStreamEvent = {
      type: 'meta',
      sessionId: 's1',
      deviceName: 'SM-A165F',
      width: 664,
      height: 1440,
      codec: 'h264',
      control: true,
    }
    const videoEvent: MirrorStreamEvent = {
      type: 'video',
      packet: { type: 'frame', keyframe: true, pts: 12345n, data: new Uint8Array([1, 2, 3]) },
    }
    const bytes = concatBytes([encodeMirrorEvent(metaEvent), encodeMirrorEvent(videoEvent)])
    const chunks = fragmentAt(bytes, [2, 7, bytes.byteLength - 2]) // cắt giữa header và giữa payload

    const fetchImpl: typeof fetch = async () => new Response(streamOf(chunks), { status: 200 })
    const repo = new HttpMirrorRepository(fetchImpl)

    const received: MirrorStreamEvent[] = []
    const result = await repo.stream(REQUEST, (event) => received.push(event), new AbortController().signal)

    assert.equal(result.ok, true)
    assert.equal(received.length, 2)
    assert.equal(received[0]?.type, 'meta')
    assert.equal(received[1]?.type, 'video')
  })

  it('!response.ok → dịch lỗi qua toAppErrorFromResponse, giữ đúng kind/message', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { kind: 'forbidden', message: 'Không đủ quyền.' } }), { status: 403 })
    const repo = new HttpMirrorRepository(fetchImpl)

    const result = await repo.stream(REQUEST, () => {}, new AbortController().signal)

    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.error.kind, 'forbidden')
      assert.equal(result.error.message, 'Không đủ quyền.')
    }
  })

  it('response.body null → upstream', async () => {
    const fetchImpl: typeof fetch = async () => new Response(null, { status: 200 })
    const repo = new HttpMirrorRepository(fetchImpl)

    const result = await repo.stream(REQUEST, () => {}, new AbortController().signal)

    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.kind, 'upstream')
  })

  it('fetch ném khi signal đã huỷ → cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl: typeof fetch = async () => {
      throw new DOMException('Aborted', 'AbortError')
    }
    const repo = new HttpMirrorRepository(fetchImpl)

    const result = await repo.stream(REQUEST, () => {}, controller.signal)

    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.kind, 'cancelled')
  })

  it('sự kiện failed giữa luồng → vẫn gọi onEvent, rồi trả err theo đúng nội dung failed', async () => {
    const failedEvent: MirrorStreamEvent = { type: 'failed', kind: 'upstream', message: 'scrcpy-server chết.' }
    const fetchImpl: typeof fetch = async () => new Response(streamOf([encodeMirrorEvent(failedEvent)]), {
      status: 200,
    })
    const repo = new HttpMirrorRepository(fetchImpl)

    const received: MirrorStreamEvent[] = []
    const result = await repo.stream(REQUEST, (event) => received.push(event), new AbortController().signal)

    assert.equal(received.length, 1)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.error.kind, 'upstream')
      assert.equal(result.error.message, 'scrcpy-server chết.')
    }
  })
})

const down = (pointer: number): MirrorControlMessage => ({
  type: 'touch',
  action: 'down',
  pointer,
  nx: 0.5,
  ny: 0.5,
  pressure: 1,
})
const move = (pointer: number, nx: number): MirrorControlMessage => ({
  type: 'touch',
  action: 'move',
  pointer,
  nx,
  ny: 0.5,
  pressure: 1,
})
const up = (pointer: number): MirrorControlMessage => ({
  type: 'touch',
  action: 'up',
  pointer,
  nx: 0.5,
  ny: 0.5,
  pressure: 1,
})

/** Đọc `action`/`type` của một thông điệp để so sánh gọn trong assert. */
const label = (message: MirrorControlMessage): string => (message.type === 'touch' ? message.action : message.type)

describe('HttpMirrorRepository.sendControl', () => {
  it('gộp lô qua ControlOutbox, chỉ một fetch một lúc, giữ đúng thứ tự down→move→up', async () => {
    const calls: Array<{ sessionId: string; messages: MirrorControlMessage[] }> = []
    const fetchImpl: typeof fetch = async (_input, init) => {
      calls.push(JSON.parse(String(init?.body)) as { sessionId: string; messages: MirrorControlMessage[] })
      return new Response('{}', { status: 200 })
    }
    const repo = new HttpMirrorRepository(fetchImpl)
    const signal = new AbortController().signal

    // Bốn lời gọi LIÊN TIẾP không `await` xen giữa — mô phỏng kéo nhanh:
    // down, hai move (gộp), up. JS đơn luồng nên `down` đã bị lấy khỏi outbox
    // và bay đi (fetch #1) TRƯỚC KHI ba lời gọi sau kịp push vào outbox.
    const results = await Promise.all([
      repo.sendControl('s1', down(0), signal),
      repo.sendControl('s1', move(0, 1), signal),
      repo.sendControl('s1', move(0, 2), signal),
      repo.sendControl('s1', up(0), signal),
    ])

    assert.ok(results.every((result) => result.ok))
    assert.equal(calls.length, 2)
    const [firstCall, secondCall] = calls
    assert.ok(firstCall && secondCall)
    assert.deepEqual(firstCall.messages.map(label), ['down'])
    assert.deepEqual(secondCall.messages.map(label), ['move', 'up'])
    const mergedMove = secondCall.messages[0]
    assert.ok(mergedMove?.type === 'touch')
    if (mergedMove?.type === 'touch') assert.equal(mergedMove.nx, 2) // chỉ còn move CUỐI CÙNG
  })

  it('đổi sessionId → outbox cũ bị bỏ; lời gọi CHƯA gửi của phiên cũ nhận cancelled', async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { sessionId: string }
      calls.push(body.sessionId)
      return new Response('{}', { status: 200 })
    }
    const repo = new HttpMirrorRepository(fetchImpl)
    const signal = new AbortController().signal

    const results = await Promise.all([
      repo.sendControl('s1', down(0), signal), // lấy đi ngay, request #1 thật
      repo.sendControl('s1', move(0, 1), signal), // còn kẹt trong outbox s1 khi phiên đổi
      repo.sendControl('s2', down(1), signal), // đổi phiên ngay lập tức
    ])
    const [staleSent, staleQueued, freshSent] = results

    assert.equal(staleSent?.ok, true)
    assert.equal(staleQueued?.ok, false)
    if (staleQueued?.ok === false) assert.equal(staleQueued.error.kind, 'cancelled')
    assert.equal(freshSent?.ok, true)
    assert.deepEqual(calls, ['s1', 's2']) // move(0,1) của s1 không bao giờ được gửi
  })

  it('signal huỷ → xoá phần còn lại trong outbox, resolve cancelled cho lời gọi đang chờ', async () => {
    const fetchImpl: typeof fetch = async () => new Response('{}', { status: 200 })
    const repo = new HttpMirrorRepository(fetchImpl)
    const controller = new AbortController()

    const first = repo.sendControl('s1', down(0), controller.signal) // lấy đi ngay, đang bay thật
    const queued = repo.sendControl('s1', move(0, 1), controller.signal) // còn kẹt trong outbox
    controller.abort() // huỷ trước khi request đầu kịp resolve

    const [firstResult, queuedResult] = await Promise.all([first, queued])

    assert.equal(firstResult.ok, true) // request đầu đã bay đi thật, không lùi lại được
    assert.equal(queuedResult.ok, false)
    if (!queuedResult.ok) assert.equal(queuedResult.error.kind, 'cancelled')
  })

  it('signal đã huỷ TỪ TRƯỚC → cancelled ngay, không đụng tới outbox', async () => {
    const fetchImpl: typeof fetch = async () => new Response('{}', { status: 200 })
    const repo = new HttpMirrorRepository(fetchImpl)
    const controller = new AbortController()
    controller.abort()

    const result = await repo.sendControl('s1', down(0), controller.signal)

    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.kind, 'cancelled')
  })
})

describe('HttpMirrorRepository — fetch mặc định', () => {
  // Node (undici) không kiểm `this` của `fetch`, trình duyệt thì có: gọi
  // `window.fetch` với `this` là một object thường → `TypeError: Illegal
  // invocation`. Test này ghi lại `this` mà `fetch` toàn cục nhận được để
  // bắt đúng lỗi đó mà không cần trình duyệt. Thay `globalThis.fetch` chỉ
  // trong một test và trả lại ở `finally`; mỗi file test chạy trong tiến
  // trình riêng nên không đụng file khác.
  it('gọi fetch toàn cục với this là globalThis, không phải repository', async () => {
    const original = globalThis.fetch
    let receiver: unknown = null
    globalThis.fetch = async function (this: unknown) {
      receiver = this
      return new Response(streamOf([]), { status: 200 })
    }
    try {
      const repo = new HttpMirrorRepository()
      const result = await repo.stream(REQUEST, () => {}, new AbortController().signal)

      assert.equal(result.ok, true)
      assert.notEqual(receiver, repo)
      assert.equal(receiver, globalThis)
    } finally {
      globalThis.fetch = original
    }
  })
})
