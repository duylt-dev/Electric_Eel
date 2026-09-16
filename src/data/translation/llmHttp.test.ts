import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { mapProviderFailure, readFailure, toChunkError } from './llmHttp'

const response = (status: number, body: string, headers: Record<string, string> = {}): Response =>
  new Response(body, { status, headers })

describe('readFailure', () => {
  it('đọc retryDelay trong thân lỗi 429 của Gemini', async () => {
    const body = JSON.stringify({
      error: {
        code: 429,
        message: 'You exceeded your current quota',
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' }],
      },
    })
    const failure = await readFailure(response(429, body))
    assert.equal(failure.retryAfterMs, 37_000)
    assert.ok(failure.detail.includes('exceeded'))
  })

  it('đọc "try again in 20s" của OpenAI, kể cả đơn vị ms', async () => {
    assert.equal(
      (await readFailure(response(429, '{"error":{"message":"Please try again in 20s."}}'))).retryAfterMs,
      20_000,
    )
    assert.equal(
      (await readFailure(response(429, '{"error":{"message":"Please try again in 350ms."}}'))).retryAfterMs,
      350,
    )
  })

  it('tiêu đề Retry-After dạng giây được ưu tiên', async () => {
    const failure = await readFailure(response(503, '<html>busy</html>', { 'retry-after': '5' }))
    assert.equal(failure.retryAfterMs, 5_000)
  })

  it('không có gợi ý thì không bịa ra', async () => {
    const failure = await readFailure(response(500, ''))
    assert.equal(failure.retryAfterMs, undefined)
    assert.equal(failure.detail, 'HTTP 500')
  })
})

describe('toChunkError', () => {
  it('429 và 5xx là tạm thời, mang theo khoảng chờ', () => {
    const error = toChunkError(mapProviderFailure(429, 'gemini', 'x'), 429, { detail: 'x', retryAfterMs: 1000 })
    assert.equal(error.transient, true)
    assert.equal(error.retryAfterMs, 1000)
    assert.equal(toChunkError(mapProviderFailure(503, 'gemini', 'x'), 503, { detail: 'x' }).transient, true)
  })

  it('khoá sai, model không có thì không tạm thời', () => {
    assert.equal(toChunkError(mapProviderFailure(401, 'openai', 'x'), 401, { detail: 'x' }).transient, undefined)
    assert.equal(toChunkError(mapProviderFailure(404, 'openai', 'x'), 404, { detail: 'x' }).transient, undefined)
  })
})
