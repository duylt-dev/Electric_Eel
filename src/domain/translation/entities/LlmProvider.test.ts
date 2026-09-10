import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  LLM_PROVIDERS,
  inspectApiKeyShape,
  isLlmProvider,
  keyHintOf,
  maskedKey,
} from './LlmProvider'

describe('isLlmProvider', () => {
  it('nhận đúng hai nhà cung cấp đang hỗ trợ', () => {
    assert.deepEqual([...LLM_PROVIDERS], ['openai', 'gemini'])
    assert.equal(isLlmProvider('openai'), true)
    assert.equal(isLlmProvider('gemini'), true)
  })

  it('từ chối mọi thứ khác, kể cả thứ không phải chuỗi', () => {
    for (const value of ['anthropic', 'OPENAI', '', null, undefined, 7, {}]) {
      assert.equal(isLlmProvider(value), false, `${String(value)} lẽ ra không hợp lệ`)
    }
  })
})

describe('keyHintOf và maskedKey', () => {
  it('giữ đúng bốn ký tự cuối', () => {
    assert.equal(keyHintOf('sk-proj-abcdefgh3f9a'), '3f9a')
    assert.equal(maskedKey(keyHintOf('sk-proj-abcdefgh3f9a')), '••••••••3f9a')
  })

  it('bỏ khoảng trắng thừa trước khi cắt — khoá dán từ clipboard hay dính \\n', () => {
    assert.equal(keyHintOf('  sk-proj-abcdefgh3f9a\n'), '3f9a')
  })

  it('không ném khi khoá ngắn hơn bốn ký tự', () => {
    assert.equal(keyHintOf('ab'), 'ab')
  })
})

describe('inspectApiKeyShape', () => {
  it('cho qua một khoá đúng hình dạng, không kèm lời nhắc nào', () => {
    const shape = inspectApiKeyShape('openai', 'sk-proj-0123456789abcdefghij')
    assert.equal(shape.ok, true)
    assert.equal(shape.message, undefined)
  })

  it('chặn ô rỗng, khoá quá ngắn, và khoá có khoảng trắng ở giữa', () => {
    assert.equal(inspectApiKeyShape('openai', '   ').ok, false)
    assert.equal(inspectApiKeyShape('openai', 'sk-short').ok, false)
    assert.equal(inspectApiKeyShape('openai', 'sk-proj-0123 456789abcdefghij').ok, false)
  })

  it('sai tiền tố chỉ CẢNH BÁO chứ không chặn', () => {
    // Tiền tố là thứ nhà cung cấp đổi được bất cứ lúc nào. Chặn theo nó nghĩa
    // là một ngày nào đó chặn nhầm một khoá thật, và người dùng không có đường
    // nào đi tiếp. Lượt gọi xác thực thật mới là bên có quyền nói không.
    const shape = inspectApiKeyShape('gemini', 'sk-proj-0123456789abcdefghij')
    assert.equal(shape.ok, true)
    assert.match(shape.message ?? '', /AIza/)
  })
})
