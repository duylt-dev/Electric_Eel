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
  --glass-surface: rgb(255 255 255 / 0.68);
  --glass-surface-strong: rgb(255 255 255 / 0.82);
  --glass-surface-soft: rgb(255 255 255 / 0.48);
  --glass-bar: rgb(246 248 252 / 0.68);
  --glass-sidebar: rgb(238 242 248 / 0.58);
  --glass-control: rgb(255 255 255 / 0.48);
  --glass-selected: rgb(0 122 255 / 0.14);
  --glass-border: rgb(20 32 48 / 0.11);
  --glass-hairline: rgb(255 255 255 / 0.62);
  --glass-shadow: 0 1px 1px rgb(15 23 42 / 0.04), 0 18px 48px -34px rgb(15 23 42 / 0.34);
  --glass-highlight: linear-gradient(145deg, rgb(255 255 255 / 0.74), rgb(255 255 255 / 0.26) 42%, rgb(255 255 255 / 0.54));
  --glass-page-aura:
    radial-gradient(circle at 16% 8%, rgb(0 122 255 / 0.15), transparent 34rem),
    radial-gradient(circle at 92% 0%, rgb(88 86 214 / 0.13), transparent 30rem),
    radial-gradient(circle at 78% 78%, rgb(52 199 89 / 0.10), transparent 30rem),
    linear-gradient(145deg, #f7f9fc, #eef3f8 48%, #f9fbfd);
  color-scheme: light;
}
[data-mui-color-scheme="dark"] {
${declarations(m3Dark)}
  --glass-surface: rgb(25 28 32 / 0.58);
  --glass-surface-strong: rgb(31 34 38 / 0.76);
  --glass-surface-soft: rgb(25 28 32 / 0.38);
  --glass-bar: rgb(35 39 44 / 0.60);
  --glass-sidebar: rgb(38 42 48 / 0.52);
  --glass-control: rgb(255 255 255 / 0.07);
  --glass-selected: rgb(10 132 255 / 0.20);
  --glass-border: rgb(255 255 255 / 0.11);
  --glass-hairline: rgb(255 255 255 / 0.17);
  --glass-shadow: 0 1px 1px rgb(0 0 0 / 0.22), 0 24px 64px -38px rgb(0 0 0 / 0.92);
  --glass-highlight: linear-gradient(145deg, rgb(255 255 255 / 0.16), rgb(255 255 255 / 0.045) 46%, rgb(255 255 255 / 0.095));
  --glass-page-aura:
    radial-gradient(circle at 12% 0%, rgb(10 132 255 / 0.17), transparent 32rem),
    radial-gradient(circle at 95% 2%, rgb(94 92 230 / 0.14), transparent 30rem),
    radial-gradient(circle at 82% 78%, rgb(48 209 88 / 0.09), transparent 28rem),
    linear-gradient(145deg, #101418, #151b20 50%, #0d1115);
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-mui-color-scheme="light"]) {
${declarations(m3Dark)}
    --glass-surface: rgb(25 28 32 / 0.58);
    --glass-surface-strong: rgb(31 34 38 / 0.76);
    --glass-surface-soft: rgb(25 28 32 / 0.38);
    --glass-bar: rgb(35 39 44 / 0.60);
    --glass-sidebar: rgb(38 42 48 / 0.52);
    --glass-control: rgb(255 255 255 / 0.07);
    --glass-selected: rgb(10 132 255 / 0.20);
    --glass-border: rgb(255 255 255 / 0.11);
    --glass-hairline: rgb(255 255 255 / 0.17);
    --glass-shadow: 0 1px 1px rgb(0 0 0 / 0.22), 0 24px 64px -38px rgb(0 0 0 / 0.92);
    --glass-highlight: linear-gradient(145deg, rgb(255 255 255 / 0.16), rgb(255 255 255 / 0.045) 46%, rgb(255 255 255 / 0.095));
    --glass-page-aura:
      radial-gradient(circle at 12% 0%, rgb(10 132 255 / 0.17), transparent 32rem),
      radial-gradient(circle at 95% 2%, rgb(94 92 230 / 0.14), transparent 30rem),
      radial-gradient(circle at 82% 78%, rgb(48 209 88 / 0.09), transparent 28rem),
      linear-gradient(145deg, #101418, #151b20 50%, #0d1115);
    color-scheme: dark;
  }
}
`

export const glass = {
  surface: 'var(--glass-surface)',
  surfaceStrong: 'var(--glass-surface-strong)',
  surfaceSoft: 'var(--glass-surface-soft)',
  bar: 'var(--glass-bar)',
  sidebar: 'var(--glass-sidebar)',
  control: 'var(--glass-control)',
  selected: 'var(--glass-selected)',
  border: 'var(--glass-border)',
  hairline: 'var(--glass-hairline)',
  shadow: 'var(--glass-shadow)',
  highlight: 'var(--glass-highlight)',
  pageAura: 'var(--glass-page-aura)',
  blur: 'blur(22px) saturate(1.35)',
  blurStrong: 'blur(34px) saturate(1.5)',
} as const

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
 * Thang chữ UI theo tinh thần iOS/SF Pro. Giữ tên vai trò M3 để không phải đổi
 * các màn hình đang dùng theme MUI, nhưng số đo/weight đã được kéo về kiểu
 * system typography của Apple: chữ lớn nhẹ hơn, thân chữ gọn, nút rõ nhưng
 * không bị cảm giác Android label.
 */
export const m3Type = {
  displayLarge: { fontFamily: DISPLAY_FONT_STACK, fontSize: 'clamp(2.35rem, 5.4vw, 3.25rem)', lineHeight: 1.06, letterSpacing: 0, fontWeight: 650 },
  displayMedium: { fontFamily: DISPLAY_FONT_STACK, fontSize: 'clamp(1.95rem, 4.1vw, 2.7rem)', lineHeight: 1.08, letterSpacing: 0, fontWeight: 650 },
  displaySmall: { fontFamily: DISPLAY_FONT_STACK, fontSize: 'clamp(1.65rem, 3.2vw, 2.2rem)', lineHeight: 1.12, letterSpacing: 0, fontWeight: 650 },
  headlineLarge: { fontFamily: DISPLAY_FONT_STACK, fontSize: '1.9rem', lineHeight: 1.16, letterSpacing: 0, fontWeight: 650 },
  headlineMedium: { fontFamily: DISPLAY_FONT_STACK, fontSize: '1.55rem', lineHeight: 1.2, letterSpacing: 0, fontWeight: 650 },
  headlineSmall: { fontFamily: DISPLAY_FONT_STACK, fontSize: '1.3rem', lineHeight: 1.24, letterSpacing: 0, fontWeight: 600 },
  titleLarge: { fontFamily: DISPLAY_FONT_STACK, fontSize: '1.12rem', lineHeight: 1.28, letterSpacing: 0, fontWeight: 600 },
  titleMedium: { fontFamily: BODY_FONT_STACK, fontSize: '0.96rem', lineHeight: 1.36, letterSpacing: 0, fontWeight: 590 },
  titleSmall: { fontFamily: BODY_FONT_STACK, fontSize: '0.86rem', lineHeight: 1.34, letterSpacing: 0, fontWeight: 590 },
  bodyLarge: { fontFamily: BODY_FONT_STACK, fontSize: '0.98rem', lineHeight: 1.48, letterSpacing: 0, fontWeight: 400 },
  bodyMedium: { fontFamily: BODY_FONT_STACK, fontSize: '0.88rem', lineHeight: 1.44, letterSpacing: 0, fontWeight: 400 },
  bodySmall: { fontFamily: BODY_FONT_STACK, fontSize: '0.78rem', lineHeight: 1.38, letterSpacing: 0, fontWeight: 400 },
  labelLarge: { fontFamily: BODY_FONT_STACK, fontSize: '0.875rem', lineHeight: 1.25, letterSpacing: 0, fontWeight: 590 },
  labelMedium: { fontFamily: BODY_FONT_STACK, fontSize: '0.8rem', lineHeight: 1.24, letterSpacing: 0, fontWeight: 590 },
  labelSmall: { fontFamily: BODY_FONT_STACK, fontSize: '0.72rem', lineHeight: 1.22, letterSpacing: 0, fontWeight: 590 },
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
