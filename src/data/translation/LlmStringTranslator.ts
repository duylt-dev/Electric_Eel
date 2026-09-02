import { AppErrors, type Result, err, ok } from '../../core/result'
import type { StringTranslator, TranslateChunkRequest } from '../../domain/translation/repositories/StringTranslator'
import { describeProvider, readTranslationConfig } from './translationProvider'
import type { TranslationProviderConfig } from './translationProvider'

/**
 * Cổng ra mô hình ngôn ngữ, gọi thẳng REST của nhà cung cấp.
 *
 * Không dùng SDK của OpenAI hay Google: cái cần ở đây là ĐÚNG MỘT lượt gọi
 * "gửi một prompt, nhận một chuỗi". Hai SDK đó mang theo phần streaming, phần
 * gọi công cụ, phần đếm token và một cây phụ thuộc riêng — trả giá bằng dung
 * lượng và bằng việc phải nâng cấp theo chúng, đổi lại một thứ `fetch` làm
 * được trong ba mươi dòng.
 *
 * Cũng vì thế mà đổi nhà cung cấp là thêm một nhánh trong `callProvider`, chứ
 * không phải đổi cả tầng.
 */
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Prompt dịch, dịch sát bản trong `chunk.py`.
 *
 * Khác đúng một chỗ: kèm cả TÊN ngôn ngữ chứ không chỉ mã. Bản Python chỉ gửi
 * mã ISO, mà `in` (Indonesia, mã cũ của Android) và `fil` (Philippines) là hai
 * mã mô hình rất dễ đoán nhầm — đoán nhầm thì cả thư mục ra sai ngôn ngữ và
 * không có gì báo.
 */
const buildPrompt = (request: TranslateChunkRequest): string =>
  `You are a professional application translator. Translate this Android strings XML snippet to ${request.language.englishName} (Android resource code: ${request.language.code}) for the "${request.appName}" app.

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

interface OpenAiResponse {
  choices?: readonly { message?: { content?: string } }[]
}

interface GeminiResponse {
  candidates?: readonly { content?: { parts?: readonly { text?: string }[] } }[]
}

/** Quy lỗi HTTP của nhà cung cấp về loại lỗi trong miền. */
const mapFailure = (status: number, provider: string, detail: string) => {
  switch (status) {
    case 400:
      return AppErrors.validation(`${provider} từ chối yêu cầu: ${detail}`, { detail })
    case 401:
    case 403:
      return AppErrors.upstream(
        `${provider} từ chối khoá API. Kiểm tra lại khoá trong .env và hạn mức của tài khoản.`,
        { detail },
      )
    case 404:
      return AppErrors.notFound(`${provider} không có model này. Kiểm tra lại tên model.`, { detail })
    case 429:
      return AppErrors.upstream(`${provider} đang giới hạn tần suất. Thử lại sau ít phút.`, { detail })
    default:
      return AppErrors.upstream(`${provider} trả lỗi HTTP ${status}.`, { detail })
  }
}

const describeFailure = async (response: Response): Promise<string> => {
  const text = await response.text().catch(() => '')
  return text.length === 0 ? `HTTP ${response.status}` : text.slice(0, 500)
}

export class LlmStringTranslator implements StringTranslator {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  get label(): string {
    return describeProvider(this.env)
  }

  async translateChunk(
    request: TranslateChunkRequest,
    signal?: AbortSignal,
  ): Promise<Result<string>> {
    const config = readTranslationConfig(this.env)
    if (!config.ok) return config

    // Hai nguồn dừng gộp làm một: người dùng bấm huỷ, và lượt gọi quá hạn. Thiếu
    // vế thứ hai thì một lượt gọi treo giữ luôn cả mẻ cho tới khi tiến trình chết.
    const timeout = AbortSignal.timeout(config.value.timeoutMs)
    const combined =
      signal !== undefined ? AbortSignal.any([signal, timeout]) : timeout

    try {
      return await this.callProvider(config.value, request, combined)
    } catch (thrown) {
      if (signal?.aborted === true) return err(AppErrors.cancelled('Đã huỷ lượt dịch.'))
      if (timeout.aborted) {
        return err(
          AppErrors.network(
            `${config.value.provider} không trả lời trong ${Math.round(config.value.timeoutMs / 1000)} giây.`,
          ),
        )
      }
      return err(AppErrors.network(`Không gọi được tới ${config.value.provider}.`, { cause: thrown }))
    }
  }

  private async callProvider(
    config: TranslationProviderConfig,
    request: TranslateChunkRequest,
    signal: AbortSignal,
  ): Promise<Result<string>> {
    const prompt = buildPrompt(request)

    if (config.provider === 'openai') {
      const response = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: config.temperature,
          max_tokens: config.maxOutputTokens,
        }),
        signal,
      })

      if (!response.ok) return err(mapFailure(response.status, 'OpenAI', await describeFailure(response)))

      const body = (await response.json()) as OpenAiResponse
      const content = body.choices?.[0]?.message?.content
      if (content === undefined || content.length === 0) {
        return err(AppErrors.upstream('OpenAI trả về phản hồi không có nội dung.'))
      }
      return ok(content)
    }

    const url = `${GEMINI_URL}/${encodeURIComponent(config.model)}:generateContent`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
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

    if (!response.ok) return err(mapFailure(response.status, 'Gemini', await describeFailure(response)))

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
