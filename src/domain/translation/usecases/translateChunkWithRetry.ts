/**
 * Gọi mô hình cho MỘT mẻ, có giữ nhịp và thử lại có chờ.
 *
 * Tách khỏi `translateStringsFile` vì chính sách thử lại là thứ hay phải chỉnh
 * nhất trong cả luồng dịch, và nó có ba nhánh đủ khác nhau để không nên nằm
 * lẫn với việc ghép tệp:
 *
 *   · Lỗi TẠM THỜI (429, 5xx, mất mạng): chờ rồi gọi lại, tối đa
 *     `MAX_TRANSIENT_ATTEMPTS` lần. Chờ bao lâu thì nghe nhà cung cấp trước —
 *     Gemini trả kèm `retryDelay`, OpenAI trả `Retry-After` — không nói thì
 *     tăng dần theo cấp số nhân, có ngẫu nhiên để 28 ngôn ngữ cùng hỏng một
 *     lúc không cùng tỉnh dậy một lúc.
 *   · Mô hình trả RỖNG hoặc lỗi không rõ: gọi lại đúng một lần, ngay. Rỗng
 *     thường là bộ lọc an toàn nhảy ngẫu nhiên; lần hai hay qua.
 *   · Khoá sai, model không có, huỷ: không thử lại. Gọi thêm chỉ tốn thêm.
 *
 * Trước MỖI lượt gọi đều xin `pacer` một chỗ. Và khi nhà cung cấp bảo "chờ N
 * giây", báo cho `pacer` giữ cả những lượt khác lại — một khoá bị giới hạn
 * là giới hạn cho mọi ngôn ngữ, không riêng ngôn ngữ vừa hỏng.
 */
import type { RatePacer } from '../../../core/util/ratePacer'
import { protectSpecials, restorePlaceholders } from '../entities/GlyphMask'
import type { LanguageOption } from '../entities/LanguageCode'
import { stripCodeFences } from '../entities/XmlText'
import type { StringTranslator } from '../repositories/StringTranslator'

/** Tổng số lượt gọi cho một lỗi tạm thời, tính cả lần đầu. */
export const MAX_TRANSIENT_ATTEMPTS = 5
/** Số lượt gọi cho lỗi không phải tạm thời, tính cả lần đầu. */
const PLAIN_ATTEMPTS = 2
const BASE_BACKOFF_MS = 2_000
/** Trần cho cả khoảng tự tính lẫn khoảng nhà cung cấp yêu cầu. */
const MAX_BACKOFF_MS = 90_000

/** Một lần chờ trước khi gọi lại — để giao diện nói được vì sao đang đứng. */
export interface RetryWait {
  readonly code: string
  readonly waitMs: number
  readonly attempt: number
  readonly attempts: number
  readonly reason: string
}

export interface ChunkRetryDeps {
  readonly translator: StringTranslator
  readonly pacer: RatePacer
  /** Tiêm được để test không ngồi chờ thật. */
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<boolean>
  readonly onRetryWait?: (wait: RetryWait) => void
}

export interface ChunkRetryInput {
  readonly appName: string
  readonly appDescription: string
  readonly preferNumericEntities: boolean
}

/**
 * Một mẻ đã dịch xong, hoặc lý do nó hỏng.
 *
 * `null` chứ không phải chuỗi rỗng: chuỗi rỗng là một mẻ dịch ra không có gì,
 * còn `null` là một mẻ chưa bao giờ về tới nơi. Hai thứ đó dẫn tới hai thông
 * báo khác nhau cho người dùng.
 */
export type ChunkResult = { readonly xml: string } | { readonly xml: null; readonly reason: string }

const CANCELLED: ChunkResult = { xml: null, reason: 'Đã huỷ.' }

/** Khoảng chờ tự tính khi nhà cung cấp không nói: 2s, 4s, 8s… nhân 0.5–1.5. */
const backoffMs = (attempt: number): number =>
  Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempt - 1)) * (0.5 + Math.random())

export async function translateChunkWithRetry(
  deps: ChunkRetryDeps,
  chunk: string,
  language: LanguageOption,
  input: ChunkRetryInput,
  signal: AbortSignal | undefined,
): Promise<ChunkResult> {
  const { masked, masking } = protectSpecials(chunk, input.preferNumericEntities)
  let lastReason = 'Không rõ nguyên nhân.'
  let attempts = PLAIN_ATTEMPTS

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (signal?.aborted === true) return CANCELLED
    if (!(await deps.pacer.acquire(signal))) return CANCELLED

    const translated = await deps.translator.translateChunk(
      { xml: masked, language, appName: input.appName, appDescription: input.appDescription },
      signal,
    )

    if (translated.ok) {
      const cleaned = stripCodeFences(translated.value)
      if (cleaned.trim().length > 0) return { xml: restorePlaceholders(cleaned, masking) }
      lastReason = 'Mô hình trả về nội dung rỗng.'
      continue
    }

    // Huỷ không phải lỗi để thử lại — người dùng đã bỏ đi.
    if (translated.error.kind === 'cancelled') return CANCELLED
    lastReason = translated.error.message
    if (translated.error.transient !== true) continue

    // Lỗi tạm thời được nhiều lượt hơn, nhưng đã nâng rồi thì không nâng nữa.
    attempts = MAX_TRANSIENT_ATTEMPTS
    if (attempt >= attempts) break

    const waitMs = Math.min(MAX_BACKOFF_MS, translated.error.retryAfterMs ?? backoffMs(attempt))
    if (translated.error.retryAfterMs !== undefined) deps.pacer.hold(waitMs)
    deps.onRetryWait?.({ code: language.code, waitMs, attempt, attempts, reason: lastReason })
    if (!(await deps.sleep(waitMs, signal))) return CANCELLED
  }

  return { xml: null, reason: lastReason }
}
