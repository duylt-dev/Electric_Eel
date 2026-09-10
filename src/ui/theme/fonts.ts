/**
 * Liquid Glass đi với kiểu chữ hệ thống của Apple: SF Pro cho UI và SF Mono
 * cho số liệu/mã. Trên macOS/iOS trình duyệt sẽ lấy đúng system font; trên
 * Windows/Linux rơi về Segoe UI/Inter/Noto Sans để tiếng Việt vẫn sạch dấu.
 *
 * Không dùng `next/font/google` ở đây vì font tải ngoài làm giao diện giữ chất
 * Android/web hơn là cảm giác iOS. Apple không cấp SF Pro qua web font công
 * khai, nên cách đúng cho web app là ưu tiên system stack.
 */
const APPLE_TEXT_STACK = [
  '-apple-system',
  'BlinkMacSystemFont',
  '"SF Pro Text"',
  '"SF Pro Display"',
  '"Helvetica Neue"',
  '"Segoe UI"',
  'Inter',
  '"Noto Sans"',
  'Arial',
  'sans-serif',
].join(', ')

const APPLE_DISPLAY_STACK = [
  '-apple-system',
  'BlinkMacSystemFont',
  '"SF Pro Display"',
  '"SF Pro Text"',
  '"Helvetica Neue"',
  '"Segoe UI"',
  'Inter',
  '"Noto Sans"',
  'Arial',
  'sans-serif',
].join(', ')

const APPLE_MONO_STACK = [
  '"SFMono-Regular"',
  '"SF Mono"',
  'ui-monospace',
  'Menlo',
  'Monaco',
  'Consolas',
  '"Liberation Mono"',
  'monospace',
].join(', ')

/** Giữ export này để layout không cần biết theme đang dùng web font hay system font. */
export const fontVariables = ''

export const DISPLAY_FONT_STACK = APPLE_DISPLAY_STACK
export const BODY_FONT_STACK = APPLE_TEXT_STACK
export const MONO_FONT_STACK = APPLE_MONO_STACK
