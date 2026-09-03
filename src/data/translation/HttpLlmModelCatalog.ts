import { AppErrors, type Result, err, ok } from '../../core/result'
import type { LlmProviderName } from '../../domain/translation/entities/LlmProvider'
import type { LlmModelCatalog } from '../../domain/translation/repositories/LlmModelCatalog'
import { GEMINI_BASE, OPENAI_BASE, authHeaders, describeFailure, mapProviderFailure, mapProviderThrow } from './llmHttp'

/**
 * Hỏi nhà cung cấp xem một khoá dùng được những model nào.
 *
 * Đây cũng chính là phép XÁC THỰC khoá: khoá sai thì lượt gọi này trả 401 ngay,
 * và nó không tiêu một token nào. Rẻ hơn hẳn cách xác thực bằng một lượt dịch
 * thử, và cho lại nhiều hơn — danh sách để người dùng chọn model.
 *
 * Hạn giờ ngắn (15 giây, không phải 360 giây như lúc dịch): người dùng đang
 * ngồi trước ô nhập chờ một dấu tích, chứ không phải chờ một mẻ dịch.
 */
const LIST_TIMEOUT_MS = 15_000

interface OpenAiModelList {
  data?: readonly { id?: string }[]
}

interface GeminiModelList {
  models?: readonly { name?: string; supportedGenerationMethods?: readonly string[] }[]
}

/**
 * Lọc danh sách của OpenAI xuống những model sinh văn bản theo lối trò chuyện.
 *
 * Phải lọc bằng TÊN, và đó là một phỏng đoán chứ không phải một luật: `/v1/models`
 * của OpenAI không nói model nào làm được việc gì. Cùng một danh sách có cả
 * embedding, whisper, tts và dall-e — đưa hết vào ô chọn thì người dùng chọn
 * được `text-embedding-3-small` rồi nhận một lỗi 400 khó hiểu ở lượt dịch.
 *
 * Phỏng đoán sai theo hướng nào cũng chịu được: lọc sót một model dùng được thì
 * vẫn còn ô "Khác…" để gõ tay; lọc nhầm một model không dùng được thì lỗi hiện
 * ra ngay ở lượt dịch đầu, kèm tên model.
 */
const CHAT_MODEL_PREFIXES = ['gpt-', 'o1', 'o3', 'o4', 'chatgpt-']
const NON_CHAT_MARKERS = [
  'embedding',
  'moderation',
  'whisper',
  'tts',
  'audio',
  'realtime',
  'transcribe',
  'image',
  'dall-e',
  'sora',
  'search',
  '-instruct',
]

const isOpenAiChatModel = (id: string): boolean =>
  CHAT_MODEL_PREFIXES.some((prefix) => id.startsWith(prefix)) &&
  !NON_CHAT_MARKERS.some((marker) => id.includes(marker))

export class HttpLlmModelCatalog implements LlmModelCatalog {
  async list(
    provider: LlmProviderName,
    apiKey: string,
    signal?: AbortSignal,
  ): Promise<Result<string[]>> {
    const timeout = AbortSignal.timeout(LIST_TIMEOUT_MS)
    const combined = signal !== undefined ? AbortSignal.any([signal, timeout]) : timeout

    try {
      const response = await fetch(
        provider === 'openai' ? `${OPENAI_BASE}/models` : `${GEMINI_BASE}/models?pageSize=200`,
        { method: 'GET', headers: authHeaders(provider, apiKey), signal: combined, cache: 'no-store' },
      )

      if (!response.ok) {
        return err(mapProviderFailure(response.status, provider, await describeFailure(response)))
      }

      const models =
        provider === 'openai'
          ? ((await response.json()) as OpenAiModelList).data
              ?.map((entry) => entry.id ?? '')
              .filter((id) => id.length > 0 && isOpenAiChatModel(id))
          : // Gemini nói thẳng model nào sinh nội dung được, nên ở đây là luật
            // chứ không phải phỏng đoán như bên OpenAI.
            ((await response.json()) as GeminiModelList).models
              ?.filter((entry) => entry.supportedGenerationMethods?.includes('generateContent') === true)
              .map((entry) => (entry.name ?? '').replace(/^models\//, ''))
              .filter((name) => name.length > 0)

      if (models === undefined || models.length === 0) {
        return err(
          AppErrors.upstream(
            'Khoá dùng được nhưng không có model dịch nào khả dụng. Kiểm tra lại quyền của khoá.',
          ),
        )
      }

      // Bỏ trùng rồi sắp xếp: danh sách của nhà cung cấp không có thứ tự nào
      // hữu ích, và một ô chọn xáo trộn giữa hai lần mở là một ô khó dùng.
      return ok([...new Set(models)].sort((left, right) => left.localeCompare(right)))
    } catch (thrown) {
      return err(
        mapProviderThrow(thrown, provider, {
          ...(signal !== undefined ? { userSignal: signal } : {}),
          timeout,
          timeoutMs: LIST_TIMEOUT_MS,
        }),
      )
    }
  }
}
