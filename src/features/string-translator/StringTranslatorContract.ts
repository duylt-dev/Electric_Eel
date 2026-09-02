import type { AppError } from '@/core/result'
import { DEFAULT_LANGUAGE_CODES } from '@/domain/translation/entities/LanguageCode'
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
  readonly selected: readonly string[]

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

export const initialStringTranslatorState: StringTranslatorState = {
  status: 'idle',
  fileName: null,
  xml: null,
  report: null,
  appName: '',
  selected: DEFAULT_LANGUAGE_CODES,
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

/** Bấm dịch được khi: có tệp, tệp không còn lỗi, đã chọn ngôn ngữ, chưa chạy. */
export const canTranslate = (state: StringTranslatorState): boolean =>
  state.xml !== null &&
  state.report?.acceptable === true &&
  state.selected.length > 0 &&
  state.status !== 'translating'

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
