/**
 * Cấu hình mô hình của MỘT người dùng — hình dạng dữ liệu đi qua dây.
 *
 * Để ở domain vì cả ba phía đều dùng chung: Route Handler đọc từ DB, adapter
 * HTTP đọc từ phản hồi, ViewModel giữ trong state. Mỗi bên tự khai một
 * interface trông giống nhau là cách chắc chắn nhất để chúng lệch nhau.
 *
 * ── Cái KHÔNG có ở đây, và vì sao ──
 *
 * Không có trường nào chứa khoá API. Kiểu này đi xuống trình duyệt, nên một
 * trường `apiKey` trong đây là một khoá nằm trong HTML của trang. Thứ duy nhất
 * đi xuống là `keyHint` — bốn ký tự cuối, đủ để nhận ra khoá, không đủ để dùng.
 */
import { LLM_PROVIDERS, LLM_PROVIDER_INFO } from './LlmProvider'
import type { LlmProviderName } from './LlmProvider'

/** Trạng thái khoá của một nhà cung cấp, nhìn từ trình duyệt. */
export interface ProviderCredentialSummary {
  readonly provider: LlmProviderName
  readonly hasKey: boolean
  /** Bốn ký tự cuối của khoá. Chuỗi rỗng khi chưa có khoá. */
  readonly keyHint: string
  readonly model: string
}

export interface TranslationSettings {
  /** Nhà cung cấp đang chọn. */
  readonly provider: LlmProviderName
  readonly appName: string
  readonly appDescription: string
  /** Đủ cả hai nhà cung cấp, kể cả cái chưa có khoá — màn hình cần vẽ cả hai. */
  readonly credentials: readonly ProviderCredentialSummary[]
}

/** Phần người dùng đổi được mà không phải là khoá. Mọi trường đều tuỳ chọn. */
export interface TranslationSettingsPatch {
  readonly provider?: LlmProviderName
  readonly model?: string
  readonly appName?: string
  readonly appDescription?: string
}

/** Kết quả một lượt gắn khoá: danh sách model mà chính khoá đó dùng được. */
export interface CredentialCheckResult {
  readonly provider: LlmProviderName
  readonly keyHint: string
  /** Model được chọn sau khi gắn khoá — model cũ nếu còn dùng được. */
  readonly model: string
  readonly models: readonly string[]
}

/** Trần độ dài, áp ở cả hai đầu. Prompt dài không làm bản dịch tốt hơn. */
export const MAX_APP_NAME_LENGTH = 80
export const MAX_APP_DESCRIPTION_LENGTH = 600

export const findCredential = (
  settings: TranslationSettings,
  provider: LlmProviderName,
): ProviderCredentialSummary | undefined =>
  settings.credentials.find((credential) => credential.provider === provider)

/** Nhà cung cấp đang chọn đã có khoá chưa. Chưa có thì mọi nút dịch đều vô nghĩa. */
export const isTranslationConfigured = (settings: TranslationSettings): boolean =>
  findCredential(settings, settings.provider)?.hasKey === true

/**
 * Cấu hình của một người chưa gắn gì cả.
 *
 * Có tên riêng vì hai chỗ cần đúng cùng một thứ: kho dữ liệu khi trong DB chưa
 * có hàng nào, và trang `/translations` khi lượt đọc DB hỏng. Trang PHẢI vẽ
 * được cái gì đó trong trường hợp thứ hai — dừng lại ở một câu báo lỗi là bịt
 * luôn lối duy nhất để gắn khoá, tức là người dùng nhìn thấy lỗi mà không có
 * cách nào tự thoát ra.
 */
export const defaultTranslationSettings = (): TranslationSettings => ({
  provider: 'openai',
  appName: '',
  appDescription: '',
  credentials: LLM_PROVIDERS.map((provider) => ({
    provider,
    hasKey: false,
    keyHint: '',
    model: LLM_PROVIDER_INFO[provider].defaultModel,
  })),
})
