import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { TranslationSettings } from '@/domain/translation/entities/TranslationSettings'
import type { StringsReport } from '@/domain/translation/validation/StringsReport'
import {
  activeCredential,
  applySettings,
  canTranslate,
  initialModelSettingsState,
  initialStringTranslatorState,
  isConfigured,
  providerLabel,
} from './StringTranslatorContract'
import type { ModelSettingsState, StringTranslatorState } from './StringTranslatorContract'

const withKey = (
  provider: 'openai' | 'gemini',
  model: string,
  base: ModelSettingsState = initialModelSettingsState,
): ModelSettingsState => ({
  ...base,
  provider,
  credentials: base.credentials.map((credential) =>
    credential.provider === provider
      ? { ...credential, hasKey: true, keyHint: '3f9a', model }
      : credential,
  ),
})

const acceptableReport = { acceptable: true } as StringsReport

const readyState = (settings: ModelSettingsState): StringTranslatorState => ({
  ...initialStringTranslatorState,
  status: 'ready',
  xml: '<resources/>',
  report: acceptableReport,
  selected: ['vi'],
  settings,
})

describe('activeCredential', () => {
  it('trả về khoá của nhà cung cấp đang chọn', () => {
    const settings = withKey('gemini', 'gemini-2.5-flash')
    assert.equal(activeCredential(settings).provider, 'gemini')
    assert.equal(activeCredential(settings).model, 'gemini-2.5-flash')
  })

  it('vẫn trả về một bản ghi khi danh sách rỗng, chứ không undefined', () => {
    const settings: ModelSettingsState = { ...initialModelSettingsState, credentials: [] }
    assert.equal(activeCredential(settings).hasKey, false)
    assert.equal(activeCredential(settings).provider, 'openai')
  })
})

describe('isConfigured và providerLabel', () => {
  it('chưa gắn khoá thì chưa cấu hình, và nhãn nói đúng như vậy', () => {
    assert.equal(isConfigured(initialStringTranslatorState), false)
    assert.equal(providerLabel(initialModelSettingsState), 'chưa gắn khoá')
  })

  it('gắn khoá xong thì nhãn mang tên nhà cung cấp và model', () => {
    const settings = withKey('openai', 'gpt-4o-mini')
    assert.equal(providerLabel(settings), 'OpenAI · gpt-4o-mini')
  })

  it('khoá của bên KIA không làm bên đang chọn thành đã cấu hình', () => {
    // Có khoá OpenAI rồi chuyển sang Gemini là một trạng thái thật và dễ gặp.
    // Nhầm ở đây nghĩa là nút dịch bấm được rồi hỏng ở máy chủ.
    const settings: ModelSettingsState = { ...withKey('openai', 'gpt-4o-mini'), provider: 'gemini' }
    assert.equal(isConfigured({ ...initialStringTranslatorState, settings }), false)
  })
})

describe('canTranslate', () => {
  it('đủ tệp, đủ ngôn ngữ và đã gắn khoá thì bấm được', () => {
    assert.equal(canTranslate(readyState(withKey('openai', 'gpt-4o-mini'))), true)
  })

  it('chưa gắn khoá thì không bấm được dù tệp và ngôn ngữ đã đủ', () => {
    assert.equal(canTranslate(readyState(initialModelSettingsState)), false)
  })

  it('đang chạy thì không bấm được lần nữa', () => {
    const state = readyState(withKey('openai', 'gpt-4o-mini'))
    assert.equal(canTranslate({ ...state, status: 'translating' }), false)
  })
})

describe('applySettings', () => {
  const settings: TranslationSettings = {
    provider: 'gemini',
    appName: 'BloodSugar',
    appDescription: 'App theo dõi đường huyết.',
    credentials: [
      { provider: 'openai', hasKey: true, keyHint: '3f9a', model: 'gpt-4o-mini' },
      { provider: 'gemini', hasKey: true, keyHint: 'aa11', model: 'gemini-2.5-flash' },
    ],
  }

  it('đổi nhà cung cấp thì BỎ danh sách model của bên cũ', () => {
    // Giữ lại thì ô chọn hiện model của OpenAI trong lúc đang cấu hình Gemini.
    const current: ModelSettingsState = {
      ...initialModelSettingsState,
      models: ['gpt-4o-mini', 'gpt-4o'],
      modelsFor: 'openai',
    }
    const next = applySettings(current, settings)
    assert.equal(next.provider, 'gemini')
    assert.deepEqual(next.models, [])
    assert.equal(next.modelsFor, null)
  })

  it('cùng nhà cung cấp thì giữ nguyên danh sách đã nạp', () => {
    const current: ModelSettingsState = {
      ...initialModelSettingsState,
      provider: 'gemini',
      models: ['gemini-2.5-flash'],
      modelsFor: 'gemini',
    }
    const next = applySettings(current, settings)
    assert.deepEqual(next.models, ['gemini-2.5-flash'])
    assert.equal(next.modelsFor, 'gemini')
  })
})
