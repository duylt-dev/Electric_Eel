import { BODY_FONT_STACK, DISPLAY_FONT_STACK, MONO_FONT_STACK } from './fonts'
import { m3Dark, m3Light } from './generatedPalette'
import type { M3ColorScheme } from './generatedPalette'

/**
 * Token Material 3 phát ra dưới dạng biến CSS.
 *
 * Vì sao tự phát biến CSS thay vì nhét hết vào palette của MUI: MUI chỉ có
 * khái niệm primary/secondary/background, không có hệ năm mức container của
 * M3. Nhồi chúng vào palette rồi trông chờ MUI sinh biến cho từng khoá là dựa
 * vào chi tiết cài đặt bên trong thư viện. Tự phát thì tên biến hiện nguyên
 * trong devtools, đổi chế độ sáng/tối chỉ là đổi một thuộc tính trên <html>,
 * và không có gì để hỏng khi MUI lên phiên bản mới.
 */
export type M3ColorRole = keyof M3ColorScheme

const cssName = (role: string): string => `--m3-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`

/** Dùng trong `sx`/`styled`: `color: m3('onSurfaceVariant')`. */
export const m3 = (role: M3ColorRole): string => `var(${cssName(role)})`

const declarations = (scheme: M3ColorScheme): string =>
  Object.entries(scheme)
    .map(([role, value]) => `  ${cssName(role)}: ${value};`)
    .join('\n')

/**
 * Bảng màu tối áp dụng theo hai đường: thuộc tính do MUI đặt khi người dùng
 * chọn tay, và `prefers-color-scheme` khi người dùng để mặc định theo hệ điều
 * hành. Thiếu vế thứ hai thì người để "theo hệ thống" luôn thấy giao diện sáng.
 */
export const m3GlobalCss = `
:root {
${declarations(m3Light)}
  color-scheme: light;
}
[data-mui-color-scheme="dark"] {
${declarations(m3Dark)}
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-mui-color-scheme="light"]) {
${declarations(m3Dark)}
    color-scheme: dark;
  }
}
`

/**
 * Bán kính bo góc theo M3. Con số nói lên vai trò: nút bấm bo tròn hẳn, thẻ
 * dùng md, hộp thoại dùng xl.
 */
export const m3Shape = {
  none: 0,
  extraSmall: 4,
  small: 8,
  medium: 12,
  large: 16,
  extraLarge: 28,
  full: 9999,
} as const

/**
 * Thang chữ M3. Giữ nguyên tên vai trò của M3 thay vì quy về h1..h6 của MUI —
 * người quen Android đọc `titleMedium` là biết ngay nó to bằng chừng nào.
 */
export const m3Type = {
  displayLarge: { fontFamily: DISPLAY_FONT_STACK, fontSize: 'clamp(2.5rem, 6vw, 3.5rem)', lineHeight: 1.03, letterSpacing: '-0.028em', fontWeight: 700 },
  displayMedium: { fontFamily: DISPLAY_FONT_STACK, fontSize: 'clamp(2rem, 4.5vw, 2.8rem)', lineHeight: 1.06, letterSpacing: '-0.025em', fontWeight: 700 },
  displaySmall: { fontFamily: DISPLAY_FONT_STACK, fontSize: 'clamp(1.7rem, 3.6vw, 2.25rem)', lineHeight: 1.1, letterSpacing: '-0.022em', fontWeight: 700 },
  headlineLarge: { fontFamily: DISPLAY_FONT_STACK, fontSize: '2rem', lineHeight: 1.14, letterSpacing: '-0.02em', fontWeight: 700 },
  headlineMedium: { fontFamily: DISPLAY_FONT_STACK, fontSize: '1.625rem', lineHeight: 1.18, letterSpacing: '-0.018em', fontWeight: 700 },
  headlineSmall: { fontFamily: DISPLAY_FONT_STACK, fontSize: '1.35rem', lineHeight: 1.22, letterSpacing: '-0.014em', fontWeight: 600 },
  titleLarge: { fontFamily: DISPLAY_FONT_STACK, fontSize: '1.16rem', lineHeight: 1.3, letterSpacing: '-0.012em', fontWeight: 600 },
  titleMedium: { fontFamily: BODY_FONT_STACK, fontSize: '0.975rem', lineHeight: 1.45, letterSpacing: 0, fontWeight: 600 },
  titleSmall: { fontFamily: BODY_FONT_STACK, fontSize: '0.875rem', lineHeight: 1.4, letterSpacing: 0, fontWeight: 600 },
  bodyLarge: { fontFamily: BODY_FONT_STACK, fontSize: '0.975rem', lineHeight: 1.6, letterSpacing: 0, fontWeight: 400 },
  bodyMedium: { fontFamily: BODY_FONT_STACK, fontSize: '0.875rem', lineHeight: 1.55, letterSpacing: 0, fontWeight: 400 },
  bodySmall: { fontFamily: BODY_FONT_STACK, fontSize: '0.8125rem', lineHeight: 1.5, letterSpacing: 0, fontWeight: 400 },
  labelLarge: { fontFamily: BODY_FONT_STACK, fontSize: '0.875rem', lineHeight: 1.3, letterSpacing: '0.005em', fontWeight: 600 },
  labelMedium: { fontFamily: BODY_FONT_STACK, fontSize: '0.8125rem', lineHeight: 1.3, letterSpacing: '0.01em', fontWeight: 600 },
  labelSmall: { fontFamily: BODY_FONT_STACK, fontSize: '0.75rem', lineHeight: 1.3, letterSpacing: '0.02em', fontWeight: 600 },
} as const

/**
 * Kiểu chữ đơn cách. Bốn vai trò này là chỗ chữ đơn cách thật sự có ích, không
 * phải để trang trí:
 *
 *   eyebrow       nhãn nhỏ trên tiêu đề — viết hoa, giãn chữ, đọc như một cái nhãn
 *   columnHeader  đầu cột bảng — không bao giờ dài bằng nội dung bên dưới nó
 *   chip          mức độ, trạng thái — luôn cùng bề rộng nên xếp thành cột thẳng
 *   data          mã và số — `tabular-nums` để các chữ số thẳng hàng theo cột
 */
export const m3Mono = {
  eyebrow: {
    fontFamily: MONO_FONT_STACK,
    fontSize: '0.72rem',
    lineHeight: 1.4,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
    fontWeight: 500,
  },
  columnHeader: {
    fontFamily: MONO_FONT_STACK,
    fontSize: '0.66rem',
    lineHeight: 1.4,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    fontWeight: 400,
  },
  chip: {
    fontFamily: MONO_FONT_STACK,
    fontSize: '0.66rem',
    lineHeight: 1.5,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    fontWeight: 500,
  },
  data: {
    fontFamily: MONO_FONT_STACK,
    fontSize: '0.8125rem',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: 0,
  },
} as const

/**
 * Độ nổi. Hai lớp: một vệt sát mép để cạnh không bị nhoè, và một quầng rộng
 * kéo lên trên (`-12px` trở đi) để bóng loang xuống dưới chứ không bao quanh.
 * Bóng một lớp ở bán kính lớn trông như tấm thẻ đang trôi; hai lớp thì trông
 * như tấm thẻ đang nằm.
 */
export const m3Elevation = [
  'none',
  '0 1px 2px rgb(21 24 28 / 0.05), 0 6px 18px -12px rgb(21 24 28 / 0.16)',
  '0 1px 2px rgb(21 24 28 / 0.06), 0 8px 24px -12px rgb(21 24 28 / 0.20)',
  '0 2px 4px rgb(21 24 28 / 0.06), 0 14px 32px -14px rgb(21 24 28 / 0.24)',
  '0 4px 8px rgb(21 24 28 / 0.07), 0 20px 44px -16px rgb(21 24 28 / 0.28)',
  '0 8px 16px rgb(21 24 28 / 0.08), 0 28px 60px -18px rgb(21 24 28 / 0.32)',
] as const

/** Lớp trạng thái M3: độ mờ phủ lên khi rê chuột, khi focus, khi nhấn. */
export const m3State = { hover: 0.08, focus: 0.1, pressed: 0.1, dragged: 0.16 } as const

/**
 * Phát lại các stack chữ ở đây để mọi nơi trong app chỉ nhập từ một cửa duy
 * nhất. Dùng `MONO_FONT_STACK` chứ đừng viết `fontFamily: 'monospace'`: từ khoá
 * đó lấy phông đơn cách mặc định của hệ điều hành, nên trên máy khác trông là
 * một phông khác — và trên macOS thì nó không có `tabular-nums`.
 */
export { BODY_FONT_STACK, DISPLAY_FONT_STACK, MONO_FONT_STACK } from './fonts'
