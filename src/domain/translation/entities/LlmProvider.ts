/**
 * Nhà cung cấp mô hình ngôn ngữ, nhìn từ tầng miền.
 *
 * Trước đây nhà cung cấp và model là biến môi trường — một khoá dùng chung cho
 * cả nhóm. Nay mỗi người tự mang khoá của mình, nên "đang dùng nhà cung cấp
 * nào" trở thành dữ liệu của người dùng chứ không còn là cấu hình của máy chủ.
 *
 * File này là hàm thuần, không chạm mạng và không chạm DB, nên cả trình duyệt
 * lẫn máy chủ đều dùng chung được — và test được mà không cần dựng gì.
 */
export type LlmProviderName = 'openai' | 'gemini'

export const LLM_PROVIDERS: readonly LlmProviderName[] = ['openai', 'gemini']

export const isLlmProvider = (value: unknown): value is LlmProviderName =>
  typeof value === 'string' && (LLM_PROVIDERS as readonly string[]).includes(value)

export interface LlmProviderInfo {
  readonly name: LlmProviderName
  /** Nhãn hiện trên giao diện. */
  readonly label: string
  /** Model dùng khi người dùng chưa chọn gì. */
  readonly defaultModel: string
  /** Nơi lấy khoá — người dùng cần biết đi đâu để tạo. */
  readonly keyUrl: string
  /** Tiền tố khoá, chỉ để bắt lỗi dán nhầm ô. Không phải phép xác thực. */
  readonly keyPrefix: string
}

export const LLM_PROVIDER_INFO: Readonly<Record<LlmProviderName, LlmProviderInfo>> = {
  openai: {
    name: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-',
  },
  gemini: {
    name: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPrefix: 'AIza',
  },
}

/** Số ký tự cuối được giữ lại để nhận diện khoá. */
export const KEY_HINT_LENGTH = 4

/**
 * Bốn ký tự cuối của khoá.
 *
 * Bốn ký tự không dựng lại được khoá, nhưng đủ để một người có hai khoá biết
 * mình đang dùng cái nào — mà không phải giải mã bản mã để hiển thị.
 */
export const keyHintOf = (apiKey: string): string => apiKey.trim().slice(-KEY_HINT_LENGTH)

/** Chuỗi vẽ lên ô nhập cho một khoá đã lưu. */
export const maskedKey = (hint: string): string => `${'•'.repeat(8)}${hint}`

/**
 * Soi nhanh hình dạng khoá TRƯỚC khi tốn một lượt gọi mạng.
 *
 * Cố ý dễ dãi: chỉ bắt những lỗi không thể nào đúng — ô rỗng, có khoảng trắng
 * giữa chuỗi (dấu hiệu dán nhầm cả câu), quá ngắn. Sai tiền tố chỉ là CẢNH BÁO
 * chứ không chặn, vì tiền tố khoá là thứ nhà cung cấp đổi được bất cứ lúc nào
 * và chặn theo nó nghĩa là chặn nhầm một khoá thật.
 *
 * Phép xác thực thật là gọi thử danh sách model bằng chính khoá đó.
 */
export function inspectApiKeyShape(
  provider: LlmProviderName,
  apiKey: string,
): { readonly ok: boolean; readonly message?: string } {
  const trimmed = apiKey.trim()

  if (trimmed.length === 0) return { ok: false, message: 'Chưa nhập khoá API.' }
  if (/\s/.test(trimmed)) {
    return { ok: false, message: 'Khoá có khoảng trắng ở giữa — nhiều khả năng dán dư chữ.' }
  }
  if (trimmed.length < 20) {
    return { ok: false, message: 'Khoá quá ngắn so với khoá thật của nhà cung cấp.' }
  }
  if (!trimmed.startsWith(LLM_PROVIDER_INFO[provider].keyPrefix)) {
    return {
      ok: true,
      message: `Khoá của ${LLM_PROVIDER_INFO[provider].label} thường bắt đầu bằng "${LLM_PROVIDER_INFO[provider].keyPrefix}". Vẫn thử được, nhưng kiểm lại xem có dán nhầm ô không.`,
    }
  }
  return { ok: true }
}
