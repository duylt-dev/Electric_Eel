import { AppErrors, type Result, err, ok } from '../../core/result'
import type { StringTranslator, TranslateChunkRequest } from '../../domain/translation/repositories/StringTranslator'
import { GEMINI_BASE, OPENAI_BASE, authHeaders, describeFailure, mapProviderFailure, mapProviderThrow } from './llmHttp'
import { describeModel } from './translationProvider'
import type { TranslationProviderConfig } from './translationProvider'

/**
 * Cổng ra mô hình ngôn ngữ, gọi thẳng REST của nhà cung cấp.
 *
 * Cấu hình được TIÊM VÀO qua hàm dựng chứ không đọc `process.env`. Đó là thay
 * đổi kéo theo việc mỗi người dùng mang khoá riêng: khoá và model chỉ biết
 * được sau khi đã biết ai đang gửi yêu cầu, nên chúng không thể là thứ đọc một
 * lần lúc dựng module. Mỗi lượt dịch dựng một adapter mới với đúng khoá của
 * người bấm nút.
 *
 * Đổi nhà cung cấp là thêm một nhánh trong `callProvider`, chứ không phải đổi
 * cả tầng.
 */

/**
 * Prompt dịch, dịch sát bản trong `chunk.py`.
 *
 * Khác hai chỗ:
 *
 *   · Kèm cả TÊN ngôn ngữ chứ không chỉ mã. Bản Python chỉ gửi mã ISO, mà `in`
 *     (Indonesia, mã cũ của Android) và `fil` (Philippines) là hai mã mô hình
 *     rất dễ đoán nhầm — đoán nhầm thì cả thư mục ra sai ngôn ngữ và không có
 *     gì báo.
 *   · Kèm mô tả app khi người dùng có viết. Tên app một mình thường không đủ:
 *     "Lumi" không nói lên đây là app đọc sách hay app đèn pin, mà hai thứ đó
 *     dịch khác nhau ở gần như mọi chuỗi. Không viết thì bỏ hẳn phần đó đi —
 *     một dòng "App description:" trống chỉ dạy mô hình rằng trường này vô nghĩa.
 */
const buildPrompt = (request: TranslateChunkRequest): string => {
  const description = request.appDescription.trim()
  const context =
    description.length === 0
      ? ''
      : `\n\nAbout the "${request.appName}" app (use this to pick the right sense of ambiguous words):\n${description}`

  return `You are a professional application translator. Translate this Android strings XML snippet to ${request.language.englishName} (Android resource code: ${request.language.code}) for the "${request.appName}" app.${context}

Rules:
1) Preserve ALL XML tags/attributes/structure EXACTLY.
2) Preserve entities like &appname; and &author;.
3) Only translate text nodes (and CDATA if present).
4) DO NOT alter or split any placeholders matching __U[0-9A-F]+__, __HEXU[0-9A-F]+__, or __DECU[0-9A-F]+__.
5) Preserve printf-style placeholders (%s, %1$s, %d), escaped quotes, and inline HTML-like markup.
6) Output ONLY XML (no explanations, no code fences).
7) Be concise in translations — UI strings must fit the same space as the source.

Snippet:
${request.xml}

Translated XML:`
}

interface OpenAiResponse {
  choices?: readonly { message?: { content?: string } }[]
}

interface GeminiResponse {
  candidates?: readonly { content?: { parts?: readonly { text?: string }[] } }[]
}

export class LlmStringTranslator implements StringTranslator {
  constructor(private readonly config: TranslationProviderConfig) {}

  get label(): string {
    return describeModel(this.config.provider, this.config.model)
  }

  async translateChunk(
    request: TranslateChunkRequest,
    signal?: AbortSignal,
  ): Promise<Result<string>> {
    // Hai nguồn dừng gộp làm một: người dùng bấm huỷ, và lượt gọi quá hạn. Thiếu
    // vế thứ hai thì một lượt gọi treo giữ luôn cả mẻ cho tới khi tiến trình chết.
    const timeout = AbortSignal.timeout(this.config.timeoutMs)
    const combined = signal !== undefined ? AbortSignal.any([signal, timeout]) : timeout

    try {
      return await this.callProvider(request, combined)
    } catch (thrown) {
      return err(
        mapProviderThrow(thrown, this.config.provider, {
          ...(signal !== undefined ? { userSignal: signal } : {}),
          timeout,
          timeoutMs: this.config.timeoutMs,
        }),
      )
    }
  }

  private async callProvider(
    request: TranslateChunkRequest,
    signal: AbortSignal,
  ): Promise<Result<string>> {
    const config = this.config
    const prompt = buildPrompt(request)

    if (config.provider === 'openai') {
      const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders('openai', config.apiKey) },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: config.temperature,
          max_tokens: config.maxOutputTokens,
        }),
        signal,
      })

      if (!response.ok) {
        return err(mapProviderFailure(response.status, 'openai', await describeFailure(response)))
      }

      const body = (await response.json()) as OpenAiResponse
      const content = body.choices?.[0]?.message?.content
      if (content === undefined || content.length === 0) {
        return err(AppErrors.upstream('OpenAI trả về phản hồi không có nội dung.'))
      }
      return ok(content)
    }

    const url = `${GEMINI_BASE}/models/${encodeURIComponent(config.model)}:generateContent`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders('gemini', config.apiKey) },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: config.temperature,
          maxOutputTokens: config.maxOutputTokens,
          // Tắt hẳn phần "suy nghĩ": ở đây nó chỉ ăn vào hạn mức token đầu ra
          // rồi làm bản dịch bị cắt cụt. Dịch chuỗi giao diện không cần suy luận.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal,
    })

    if (!response.ok) {
      return err(mapProviderFailure(response.status, 'gemini', await describeFailure(response)))
    }

    const body = (await response.json()) as GeminiResponse
    // Gemini trả nội dung thành nhiều mảnh; nối lại chứ đừng lấy mảnh đầu.
    const content = (body.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('')

    if (content.length === 0) {
      return err(
        AppErrors.upstream(
          'Gemini trả về phản hồi rỗng. Thường là do bộ lọc an toàn hoặc chạm trần token đầu ra.',
        ),
      )
    }
    return ok(content)
  }
}
