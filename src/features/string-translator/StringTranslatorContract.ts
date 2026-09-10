import type { AppError } from '@/core/result'
import { DEFAULT_LANGUAGE_CODES } from '@/domain/translation/entities/LanguageCode'
import { LLM_PROVIDERS, LLM_PROVIDER_INFO } from '@/domain/translation/entities/LlmProvider'
import type { LlmProviderName } from '@/domain/translation/entities/LlmProvider'
import type {
  ProviderCredentialSummary,
  TranslationSettings,
} from '@/domain/translation/entities/TranslationSettings'
import type { LanguageFailure, TranslatedArchive } from '@/domain/translation/entities/TranslationJob'
import type { StringsReport } from '@/domain/translation/validation/StringsReport'

/**
 * Hợp đồng của màn Dịch.
 *
 * State, Intent và Effect nằm ở đây và CHỈ ở đây. Đọc một file này là biết màn
 * hình có những trạng thái nào, nhận những yêu cầu nào, phát ra những việc gì.
 *
 *   State  — thứ màn hình vẽ ra. Dữ liệu thuần: không hàm, không đối tượng lớp.
 *   Intent — mọi thứ có thể yêu cầu ViewModel làm. Đường vào duy nhất.
 *   Effect — việc xảy ra một lần: thông báo, tải tệp về.
 */

// ─── State ──────────────────────────────────────────────────────────────────

export type TranslatorStatus =
  /** Chưa chọn tệp. */
  | 'idle'
  /** Đã có tệp và đã soi xong. Nút dịch bấm được nếu không còn lỗi. */
  | 'ready'
  | 'translating'
  /** Đã có tệp zip, chờ người dùng bấm tải về. */
  | 'done'
  | 'failed'

/** Một ngôn ngữ đã chạy xong — kể cả khi chạy xong nghĩa là hỏng. */
export interface LanguageProgress {
  readonly code: string
  readonly ok: boolean
  readonly message?: string
}

/**
 * Phần cấu hình mô hình trong state.
 *
 * Gom thành một nhóm con thay vì rải phẳng vào `StringTranslatorState`: nó có
 * vòng đời riêng (nạp một lần từ máy chủ, đổi độc lập với tệp đang dịch) và
 * gom lại thì đọc một chỗ là thấy hết những gì màn cấu hình cần.
 *
 * `keyDraft` chỉ giữ khoá người dùng ĐANG GÕ. Khoá đã lưu không bao giờ nằm ở
 * đây — thứ duy nhất quay xuống trình duyệt là bốn ký tự cuối trong `keyHint`.
 */
export interface ModelSettingsState {
  readonly provider: LlmProviderName
  /** Đủ cả hai nhà cung cấp, kể cả cái chưa có khoá. */
  readonly credentials: readonly ProviderCredentialSummary[]
  /** Danh sách model lấy từ nhà cung cấp. Rỗng nghĩa là chưa nạp. */
  readonly models: readonly string[]
  /** Danh sách trong `models` là của nhà cung cấp nào. Đổi bên thì phải nạp lại. */
  readonly modelsFor: LlmProviderName | null
  readonly keyDraft: string
  readonly checkingKey: boolean
  readonly loadingModels: boolean
  /** Lời nhắc dưới ô nhập khoá: cảnh báo hình dạng, hoặc lỗi nhà cung cấp trả về. */
  readonly keyNotice: string | null
}

export interface StringTranslatorState {
  readonly status: TranslatorStatus
  readonly fileName: string | null
  /**
   * Nội dung tệp gốc. Giữ trong state vì lượt dịch gửi lại chính nội dung này,
   * và vì người dùng có thể đổi danh sách ngôn ngữ rồi chạy lại mà không phải
   * chọn tệp lần nữa.
   */
  readonly xml: string | null
  readonly report: StringsReport | null

  readonly appName: string
  /**
   * Mô tả app, đi vào prompt cùng tên app.
   *
   * Nằm trong state chứ không phải chỉ trong ô nhập vì lượt dịch gửi lại chính
   * giá trị này, và vì nó được ghi xuống máy chủ khi người dùng rời ô nhập.
   */
  readonly appDescription: string
  readonly selected: readonly string[]

  readonly settings: ModelSettingsState

  /** Số ngôn ngữ của lượt đang chạy — chốt lúc bấm dịch, không đổi giữa chừng. */
  readonly running: number
  readonly finished: readonly LanguageProgress[]

  /**
   * Tệp zip đã dựng xong, dạng base64.
   *
   * Giữ base64 chứ không giữ `Blob`: state là dữ liệu thuần, và một `Blob`
   * trong state là một đối tượng có vòng đời riêng nằm lẫn vào nơi lẽ ra chỉ
   * chứa giá trị. Việc dựng `Blob` và mở hộp thoại lưu tệp là chuyện của màn
   * hình, xảy ra đúng lúc người dùng bấm.
   */
  readonly archive: TranslatedArchive | null
  readonly failed: readonly LanguageFailure[]
  readonly error: AppError | null
}

/** Cấu hình khi máy chủ chưa kịp nói gì — người chưa từng gắn khoá nào. */
export const initialModelSettingsState: ModelSettingsState = {
  provider: 'openai',
  credentials: LLM_PROVIDERS.map((provider) => ({
    provider,
    hasKey: false,
    keyHint: '',
    model: LLM_PROVIDER_INFO[provider].defaultModel,
  })),
  models: [],
  modelsFor: null,
  keyDraft: '',
  checkingKey: false,
  loadingModels: false,
  keyNotice: null,
}

export const initialStringTranslatorState: StringTranslatorState = {
  status: 'idle',
  fileName: null,
  xml: null,
  report: null,
  appName: '',
  appDescription: '',
  selected: DEFAULT_LANGUAGE_CODES,
  settings: initialModelSettingsState,
  running: 0,
  finished: [],
  archive: null,
  failed: [],
  error: null,
}

// ─── Intent ─────────────────────────────────────────────────────────────────

export type StringTranslatorIntent =
  | { type: 'FilePicked'; fileName: string; content: string }
  | { type: 'FileCleared' }
  | { type: 'AppNameChanged'; value: string }
  | { type: 'AppDescriptionChanged'; value: string }
  /** Người dùng rời ô nhập — ghi tên và mô tả app xuống máy chủ. */
  | { type: 'AppContextCommitted' }
  | { type: 'ProviderChanged'; provider: LlmProviderName }
  | { type: 'ModelChanged'; model: string }
  /** Mở ô chọn model, hoặc bấm nút nạp lại danh sách. */
  | { type: 'ModelListRequested' }
  | { type: 'ApiKeyDraftChanged'; value: string }
  | { type: 'ApiKeySubmitted' }
  | { type: 'LanguageToggled'; code: string }
  | { type: 'AllLanguagesToggled'; value: boolean }
  | { type: 'TranslateRequested' }
  | { type: 'TranslationCancelled' }
  | { type: 'DownloadRequested' }

// ─── Effect ─────────────────────────────────────────────────────────────────

export type StringTranslatorEffect =
  | { type: 'ShowMessage'; severity: 'success' | 'error' | 'info'; message: string }
  /** Trình duyệt lưu tệp về thư mục Tải xuống. */
  | { type: 'DownloadArchive'; fileName: string; base64: string }

// ─── Dẫn xuất từ state ──────────────────────────────────────────────────────
//
// Để ở đây thay vì tính trong component: đây là quy tắc, không phải cách trình
// bày, và cần kiểm thử được mà không cần render gì.

/** Khoá và model của nhà cung cấp đang chọn. Luôn có, kể cả khi chưa gắn khoá. */
export const activeCredential = (settings: ModelSettingsState): ProviderCredentialSummary =>
  settings.credentials.find((credential) => credential.provider === settings.provider) ?? {
    provider: settings.provider,
    hasKey: false,
    keyHint: '',
    model: LLM_PROVIDER_INFO[settings.provider].defaultModel,
  }

/** Đã gắn khoá cho nhà cung cấp đang chọn chưa. Chưa thì nút dịch vô nghĩa. */
export const isConfigured = (state: StringTranslatorState): boolean =>
  activeCredential(state.settings).hasKey

/** Nhãn "OpenAI · gpt-4o-mini" hiện ở đầu trang. */
export const providerLabel = (settings: ModelSettingsState): string => {
  const credential = activeCredential(settings)
  return credential.hasKey
    ? `${LLM_PROVIDER_INFO[settings.provider].label} · ${credential.model}`
    : 'chưa gắn khoá'
}

/**
 * Bấm dịch được khi: có tệp, tệp không còn lỗi, đã chọn ngôn ngữ, chưa chạy,
 * VÀ đã gắn khoá.
 *
 * Vế cuối nằm ở đây chứ không phải một cờ `configured` truyền từ trang xuống:
 * khoá gắn được ngay trên màn hình này, nên điều kiện đó đổi giữa chừng và
 * phải đọc từ state chứ không phải từ props chụp lúc dựng trang.
 */
export const canTranslate = (state: StringTranslatorState): boolean =>
  state.xml !== null &&
  state.report?.acceptable === true &&
  state.selected.length > 0 &&
  state.status !== 'translating' &&
  isConfigured(state)

/** Tỷ lệ hoàn thành, 0–1. Dùng cho thanh tiến độ. */
export const progressRatio = (state: StringTranslatorState): number =>
  state.running === 0 ? 0 : Math.min(1, state.finished.length / state.running)

export const isLanguageSelected = (state: StringTranslatorState, code: string): boolean =>
  state.selected.includes(code)

/**
 * Kích thước tệp zip cho người đọc.
 *
 * Dừng ở KB/MB: một tệp chuỗi không bao giờ tới GB, và một hàm biết đọc đơn vị
 * mà không bao giờ dùng tới chỉ là thêm một nhánh không ai kiểm thử.
 */
export const formatBytes = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** Nạp cấu hình máy chủ gửi xuống vào nhóm state tương ứng. */
export const applySettings = (
  current: ModelSettingsState,
  settings: TranslationSettings,
): ModelSettingsState => ({
  ...current,
  provider: settings.provider,
  credentials: settings.credentials,
  // Danh sách model của nhà cung cấp cũ không nói gì về nhà cung cấp mới, nên
  // đổi bên là bỏ danh sách đi. Giữ lại thì ô chọn hiện model của OpenAI trong
  // lúc đang cấu hình Gemini.
  ...(settings.provider === current.modelsFor ? {} : { models: [], modelsFor: null }),
})
