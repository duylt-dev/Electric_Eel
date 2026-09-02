/**
 * SINH TỰ ĐỘNG — đừng sửa tay.
 *
 * Nguồn: scripts/generate-m3-palette.mjs
 * Sinh lại: pnpm gen:palette
 *
 * Màu nguồn của từng họ:
 *   primary   #2F8FE6
 *   secondary #304574
 *   tertiary  #1B7A4C
 *   warning   #9C5D00
 *   error     #B93A2E
 * Sắc xám: hue của primary, chroma 6 (mặt nền) và 12 (viền, chữ phụ).
 * Nền phụ hạ độ tươi xuống 12 (sáng) / 18 (tối).
 *
 * Tên vai trò lấy đúng theo hệ màu Material 3, nên một người quen làm Android
 * đọc là hiểu ngay: `surfaceContainerHigh` ở đây là `surfaceContainerHigh` ở kia.
 * Riêng họ `warning` là phần thêm: M3 không có vai trò cảnh báo, mà bộ luật
 * kiểm tra của công cụ này có ba mức — lỗi, cảnh báo, cần xác nhận — nên mức
 * giữa phải có màu riêng thay vì mượn tạm màu lỗi.
 *
 * Mọi cặp nền/chữ trong file này đã qua kiểm tra tương phản lúc sinh.
 */
export interface M3ColorScheme {
  primary: string
  onPrimary: string
  primaryContainer: string
  onPrimaryContainer: string
  secondary: string
  onSecondary: string
  secondaryContainer: string
  onSecondaryContainer: string
  tertiary: string
  onTertiary: string
  tertiaryContainer: string
  onTertiaryContainer: string
  warning: string
  onWarning: string
  warningContainer: string
  onWarningContainer: string
  error: string
  onError: string
  errorContainer: string
  onErrorContainer: string
  surface: string
  onSurface: string
  surfaceDim: string
  surfaceBright: string
  surfaceContainerLowest: string
  surfaceContainerLow: string
  surfaceContainer: string
  surfaceContainerHigh: string
  surfaceContainerHighest: string
  onSurfaceVariant: string
  outline: string
  outlineVariant: string
  inverseSurface: string
  inverseOnSurface: string
  inversePrimary: string
  scrim: string
  shadow: string
}

export const m3Light: M3ColorScheme = {
  primary: '#005c9e',
  onPrimary: '#ffffff',
  primaryContainer: '#e6eefd',
  onPrimaryContainer: '#003b68',
  secondary: '#445989',
  onSecondary: '#ffffff',
  secondaryContainer: '#eaedfe',
  onSecondaryContainer: '#223866',
  tertiary: '#00673d',
  onTertiary: '#ffffff',
  tertiaryContainer: '#e2f2e4',
  onTertiaryContainer: '#004325',
  warning: '#824d00',
  onWarning: '#ffffff',
  warningContainer: '#ffead9',
  onWarningContainer: '#553100',
  error: '#a62c22',
  onError: '#ffffff',
  errorContainer: '#ffe9e6',
  onErrorContainer: '#770606',
  surface: '#f5f6fc',
  onSurface: '#15181c',
  surfaceDim: '#d8dae0',
  surfaceBright: '#fdfcff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#fdfcff',
  surfaceContainer: '#eceef4',
  surfaceContainerHigh: '#e7e8ee',
  surfaceContainerHighest: '#e1e2e8',
  onSurfaceVariant: '#49515c',
  outline: '#757d89',
  outlineVariant: '#dee6f4',
  inverseSurface: '#292c31',
  inverseOnSurface: '#f2f3fa',
  inversePrimary: '#a0caff',
  scrim: '#000000',
  shadow: '#000000',
}

export const m3Dark: M3ColorScheme = {
  primary: '#7fbaff',
  onPrimary: '#002d52',
  primaryContainer: '#233143',
  onPrimaryContainer: '#c8dfff',
  secondary: '#a1b5eb',
  onSecondary: '#132a58',
  secondaryContainer: '#283044',
  onSecondaryContainer: '#d1dcff',
  tertiary: '#70c892',
  onTertiary: '#00341c',
  tertiaryContainer: '#1e3527',
  onTertiaryContainer: '#96f0b7',
  warning: '#f3a54d',
  onWarning: '#432500',
  warningContainer: '#422c14',
  onWarningContainer: '#ffd5ae',
  error: '#ff9b8e',
  onError: '#610002',
  errorContainer: '#462824',
  onErrorContainer: '#ffd3cc',
  surface: '#0e1115',
  onSurface: '#e7e8ee',
  surfaceDim: '#0e1115',
  surfaceBright: '#36393e',
  surfaceContainerLowest: '#080b0f',
  surfaceContainerLow: '#191c20',
  surfaceContainer: '#1f2226',
  surfaceContainerHigh: '#272a2f',
  surfaceContainerHighest: '#32353a',
  onSurfaceVariant: '#afb6c4',
  outline: '#848c99',
  outlineVariant: '#363e49',
  inverseSurface: '#e4e5eb',
  inverseOnSurface: '#292c31',
  inversePrimary: '#005c9e',
  scrim: '#000000',
  shadow: '#000000',
}
