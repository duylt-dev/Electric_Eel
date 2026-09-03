import { LLM_PROVIDER_INFO } from '../../domain/translation/entities/LlmProvider'
import type { LlmProviderName } from '../../domain/translation/entities/LlmProvider'

/**
 * Phần cấu hình của công cụ dịch còn nằm ở BIẾN MÔI TRƯỜNG.
 *
 * ── Cái gì đã rời khỏi đây, và vì sao ──
 *
 * Khoá API và model từng đọc ở file này (`OPENAI_API_KEY`, `OPENAI_MODEL`,
 * `TRANSLATION_PROVIDER`…). Chúng chuyển vào cơ sở dữ liệu, theo từng người
 * dùng, vì hạn mức và hoá đơn của nhà cung cấp tính theo khoá: một khoá dùng
 * chung nghĩa là một người dịch cả trăm ngôn ngữ thì cả nhóm cùng nhận 429, và
 * không ai truy được phần chi phí nào là của ai.
 *
 * ── Cái gì Ở LẠI, và vì sao ──
 *
 * Những số vặn cho vừa máy chủ, không phải lựa chọn của người dùng: nhiệt độ,
 * trần token, hạn giờ, mức chạy song song. Chúng giống nhau cho mọi người dùng
 * trên cùng một cài đặt, nên chỗ đúng của chúng vẫn là `.env`.
 */

/** Số vặn cho một nhà cung cấp. Khoá và model KHÔNG nằm ở đây. */
export interface ProviderTuning {
  readonly temperature: number
  readonly maxOutputTokens: number
  readonly timeoutMs: number
}

/** Cấu hình đủ để chạy một lượt gọi: số vặn từ `.env` + khoá/model của người dùng. */
export interface TranslationProviderConfig extends ProviderTuning {
  readonly provider: LlmProviderName
  readonly model: string
  readonly apiKey: string
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
  openaiTemperature: 0.3,
  geminiTemperature: 0.1,
  openaiMaxTokens: 16000,
  geminiMaxTokens: 65536,
  timeoutSeconds: 360,
} as const

/**
 * Số vặn của một nhà cung cấp.
 *
 * Không trả `Result`: mọi biến ở đây đều có mặc định dùng được, nên không có
 * tình huống "thiếu cấu hình" nào để báo. Thứ duy nhất thiếu được là khoá API,
 * mà khoá thì không còn đọc ở đây nữa.
 */
export function readProviderTuning(
  provider: LlmProviderName,
  env: NodeJS.ProcessEnv = process.env,
): ProviderTuning {
  if (provider === 'openai') {
    return {
      temperature: numberFrom(env.OPENAI_TEMPERATURE, DEFAULTS.openaiTemperature),
      maxOutputTokens: numberFrom(env.OPENAI_MAX_TOKENS, DEFAULTS.openaiMaxTokens),
      timeoutMs: numberFrom(env.OPENAI_TIMEOUT, DEFAULTS.timeoutSeconds) * 1000,
    }
  }

  return {
    temperature: numberFrom(env.GEMINI_TEMPERATURE, DEFAULTS.geminiTemperature),
    maxOutputTokens: numberFrom(env.GEMINI_MAX_OUTPUT_TOKENS, DEFAULTS.geminiMaxTokens),
    timeoutMs: numberFrom(env.GEMINI_TIMEOUT, DEFAULTS.timeoutSeconds) * 1000,
  }
}

/** Ghép khoá và model của người dùng với số vặn của máy chủ. */
export const buildProviderConfig = (
  provider: LlmProviderName,
  apiKey: string,
  model: string,
  env: NodeJS.ProcessEnv = process.env,
): TranslationProviderConfig => ({
  provider,
  apiKey,
  model: model.trim().length === 0 ? LLM_PROVIDER_INFO[provider].defaultModel : model.trim(),
  ...readProviderTuning(provider, env),
})

/** Nhãn hiện lên giao diện: người dùng cần biết bản dịch do model nào tạo ra. */
export const describeModel = (provider: LlmProviderName, model: string): string =>
  `${LLM_PROVIDER_INFO[provider].label} · ${model}`

/** Các tuỳ chọn điều phối, đọc từ cùng bộ biến với tool Python. */
export interface TranslationRuntimeOptions {
  readonly chunkTokenLimit: number
  readonly chunkConcurrency: number
  readonly languageConcurrency: number
  readonly preferNumericEntities: boolean
  readonly escapeApostrophes: boolean
}

/**
 * Mặc định thấp hơn tool Python (100 ngôn ngữ song song) rất nhiều.
 *
 * Lý do cũ là "nhiều người dùng chung một hạn mức". Nay mỗi người mang khoá
 * riêng nên vế đó không còn, nhưng trần vẫn giữ: hạn mức của MỘT khoá cá nhân
 * ở bậc thấp nhất còn dễ chạm hơn hạn mức của cả nhóm, và 100 lượt gọi song
 * song từ một khoá mới là cách chắc chắn nhất để chạm nó.
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
