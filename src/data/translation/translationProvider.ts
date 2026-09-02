import { AppErrors, type Result, err, ok } from '../../core/result'

/**
 * Cấu hình nhà cung cấp mô hình cho công cụ dịch chuỗi.
 *
 * Tên biến giữ đúng như tool Python đang dùng (`TRANSLATION_PROVIDER`,
 * `OPENAI_MODEL`, `GEMINI_MODEL`…) để một người đã có sẵn `.env` của tool cũ
 * chép thẳng sang được, không phải dịch tên biến trong đầu.
 */
export type TranslationProviderName = 'openai' | 'gemini'

export interface TranslationProviderConfig {
  readonly provider: TranslationProviderName
  readonly model: string
  readonly apiKey: string
  readonly temperature: number
  readonly maxOutputTokens: number
  readonly timeoutMs: number
}

const numberFrom = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw.trim().length === 0) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** Cách đọc cờ bật/tắt của tool Python: mọi thứ trừ 0/false/no/rỗng là bật. */
export const truthy = (raw: string | undefined, fallback: boolean): boolean => {
  if (raw === undefined || raw.trim().length === 0) return fallback
  return !['0', 'false', 'no'].includes(raw.trim().toLowerCase())
}

export const DEFAULTS = {
  provider: 'openai' as TranslationProviderName,
  openaiModel: 'gpt-4o-mini',
  geminiModel: 'gemini-2.5-flash',
  openaiTemperature: 0.3,
  geminiTemperature: 0.1,
  openaiMaxTokens: 16000,
  geminiMaxTokens: 65536,
  timeoutSeconds: 360,
} as const

/**
 * Đọc cấu hình, hoặc nói rõ thiếu cái gì.
 *
 * Trả `Result` chứ không ném: thiếu khoá API là một tình huống bình thường
 * (máy dev vừa clone về), và câu trả lời đúng cho nó là một dòng chữ trên giao
 * diện chứ không phải một trang 500.
 */
export function readTranslationConfig(
  env: NodeJS.ProcessEnv = process.env,
): Result<TranslationProviderConfig> {
  const raw = (env.TRANSLATION_PROVIDER ?? DEFAULTS.provider).trim().toLowerCase()

  if (raw !== 'openai' && raw !== 'gemini') {
    return err(
      AppErrors.validation(
        `TRANSLATION_PROVIDER = "${raw}" không phải nhà cung cấp nào đang hỗ trợ. Đặt là "openai" hoặc "gemini".`,
      ),
    )
  }

  if (raw === 'openai') {
    const apiKey = env.OPENAI_API_KEY?.trim() ?? ''
    if (apiKey.length === 0) {
      return err(
        AppErrors.validation(
          'Chưa có OPENAI_API_KEY, nên chưa dịch được. Đặt biến đó trong .env rồi khởi động lại.',
        ),
      )
    }
    return ok({
      provider: 'openai',
      model: env.OPENAI_MODEL?.trim() ?? DEFAULTS.openaiModel,
      apiKey,
      temperature: numberFrom(env.OPENAI_TEMPERATURE, DEFAULTS.openaiTemperature),
      maxOutputTokens: numberFrom(env.OPENAI_MAX_TOKENS, DEFAULTS.openaiMaxTokens),
      timeoutMs: numberFrom(env.OPENAI_TIMEOUT, DEFAULTS.timeoutSeconds) * 1000,
    })
  }

  const apiKey = env.GEMINI_API_KEY?.trim() ?? ''
  if (apiKey.length === 0) {
    return err(
      AppErrors.validation(
        'Chưa có GEMINI_API_KEY, nên chưa dịch được. Đặt biến đó trong .env rồi khởi động lại.',
      ),
    )
  }
  return ok({
    provider: 'gemini',
    model: env.GEMINI_MODEL?.trim() ?? DEFAULTS.geminiModel,
    apiKey,
    temperature: numberFrom(env.GEMINI_TEMPERATURE, DEFAULTS.geminiTemperature),
    maxOutputTokens: numberFrom(env.GEMINI_MAX_OUTPUT_TOKENS, DEFAULTS.geminiMaxTokens),
    timeoutMs: numberFrom(env.GEMINI_TIMEOUT, DEFAULTS.timeoutSeconds) * 1000,
  })
}

/** Nhãn hiện lên giao diện: người dùng cần biết bản dịch do model nào tạo ra. */
export const describeProvider = (env: NodeJS.ProcessEnv = process.env): string => {
  const config = readTranslationConfig(env)
  return config.ok ? `${config.value.provider} · ${config.value.model}` : 'chưa cấu hình'
}

/** Các tuỳ chọn điều phối, đọc từ cùng bộ biến với tool Python. */
export interface TranslationRuntimeOptions {
  readonly chunkTokenLimit: number
  readonly chunkConcurrency: number
  readonly languageConcurrency: number
  readonly preferNumericEntities: boolean
  readonly escapeApostrophes: boolean
}

/**
 * Mặc định thấp hơn tool Python (100 ngôn ngữ song song) rất nhiều, và có lý do:
 * ở đó mỗi lần chạy là một người ngồi trước máy mình, còn ở đây nhiều người
 * dùng chung một hạn mức API. Thả 100 lượt gọi cùng lúc thì người bấm thứ hai
 * nhận về một loạt lỗi 429.
 */
export const readRuntimeOptions = (
  env: NodeJS.ProcessEnv = process.env,
): TranslationRuntimeOptions => ({
  chunkTokenLimit: numberFrom(env.CHUNK_TOKEN_LIMIT, 4000),
  chunkConcurrency: Math.max(1, numberFrom(env.CHUNK_CONCURRENCY, 4)),
  languageConcurrency: Math.max(1, numberFrom(env.MAX_CONCURRENT_TRANSLATIONS, 6)),
  preferNumericEntities: truthy(env.PREFER_NUMERIC_ENTITIES, false),
  escapeApostrophes: truthy(env.ESCAPE_APOSTROPHES, true),
})
