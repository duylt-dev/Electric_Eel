/**
 * Danh sách ngôn ngữ đích của công cụ dịch chuỗi.
 *
 * Mã ở đây là HẬU TỐ THƯ MỤC của Android (`values-vi`), không phải mã ISO 639-1
 * thuần. Hai chỗ lệch nhau và cả hai đều cố ý:
 *
 *   · `in` là Indonesia. Android giữ mã cũ của ISO 639 (`in`), không dùng `id`.
 *   · `fil` là tiếng Philippines, mã ba ký tự.
 *
 * Vì hai chỗ đó, prompt gửi cho mô hình mang theo cả `englishName` chứ không
 * chỉ mã: hỏi một mô hình "dịch sang ngôn ngữ có mã `in`" là mời nó đoán, và
 * đoán sai thì cả thư mục `values-in` ra sai ngôn ngữ mà không có gì báo.
 */
export interface LanguageOption {
  /** Hậu tố thư mục: `values-{code}`. */
  readonly code: string
  /** Tên tiếng Việt, hiển thị trong danh sách chọn. */
  readonly label: string
  /** Tên tiếng Anh, đưa vào prompt để mô hình không phải suy từ mã. */
  readonly englishName: string
}

/**
 * Bộ mặc định — đúng bằng `SUPPORTED_LANGUAGES` của tool Python đang dùng, giữ
 * nguyên thứ tự để hai bên đối chiếu được với nhau.
 */
export const SUPPORTED_LANGUAGES: readonly LanguageOption[] = [
  { code: 'ar', label: 'Ả Rập', englishName: 'Arabic' },
  { code: 'bn', label: 'Bengali', englishName: 'Bengali' },
  { code: 'cs', label: 'Séc', englishName: 'Czech' },
  { code: 'de', label: 'Đức', englishName: 'German' },
  { code: 'el', label: 'Hy Lạp', englishName: 'Greek' },
  { code: 'es', label: 'Tây Ban Nha', englishName: 'Spanish' },
  { code: 'fa', label: 'Ba Tư', englishName: 'Persian' },
  { code: 'fi', label: 'Phần Lan', englishName: 'Finnish' },
  { code: 'fil', label: 'Philippines', englishName: 'Filipino' },
  { code: 'fr', label: 'Pháp', englishName: 'French' },
  { code: 'hi', label: 'Hindi', englishName: 'Hindi' },
  { code: 'hr', label: 'Croatia', englishName: 'Croatian' },
  { code: 'in', label: 'Indonesia', englishName: 'Indonesian' },
  { code: 'it', label: 'Ý', englishName: 'Italian' },
  { code: 'ja', label: 'Nhật', englishName: 'Japanese' },
  { code: 'ko', label: 'Hàn', englishName: 'Korean' },
  { code: 'ms', label: 'Mã Lai', englishName: 'Malay' },
  { code: 'nl', label: 'Hà Lan', englishName: 'Dutch' },
  { code: 'pl', label: 'Ba Lan', englishName: 'Polish' },
  { code: 'pt', label: 'Bồ Đào Nha', englishName: 'Portuguese' },
  { code: 'ru', label: 'Nga', englishName: 'Russian' },
  { code: 'sk', label: 'Slovakia', englishName: 'Slovak' },
  { code: 'sr', label: 'Serbia', englishName: 'Serbian' },
  { code: 'sv', label: 'Thuỵ Điển', englishName: 'Swedish' },
  { code: 'th', label: 'Thái', englishName: 'Thai' },
  { code: 'tr', label: 'Thổ Nhĩ Kỳ', englishName: 'Turkish' },
  { code: 'vi', label: 'Việt', englishName: 'Vietnamese' },
  { code: 'zh', label: 'Trung', englishName: 'Chinese (Simplified)' },
]

const BY_CODE = new Map(SUPPORTED_LANGUAGES.map((language) => [language.code, language]))

export const findLanguage = (code: string): LanguageOption | undefined => BY_CODE.get(code)

export const isSupportedLanguage = (code: string): boolean => BY_CODE.has(code)

/** Thư mục tài nguyên tương ứng trong dự án Android. */
export const valuesDirectory = (code: string): string => `values-${code}`

export const DEFAULT_LANGUAGE_CODES: readonly string[] = SUPPORTED_LANGUAGES.map(
  (language) => language.code,
)
