import { Bricolage_Grotesque, JetBrains_Mono, Roboto_Flex } from 'next/font/google'

/**
 * Ba bộ chữ, ba vai trò khác nhau — đây là thứ tạo ra khác biệt lớn nhất giữa
 * "một trang MUI" và một sản phẩm có nhận dạng riêng.
 *
 *   display  tiêu đề. Bricolage Grotesque có bề ngang hẹp và các nét cắt chéo,
 *            nên một tiêu đề dài tiếng Việt vẫn nằm gọn một dòng.
 *   body     chữ đọc. Roboto Flex là bản biến thiên của Roboto — vẫn là chữ
 *            quen mắt của Android, nhưng chỉnh được độ đậm liên tục.
 *   mono     nhãn nhỏ, đầu bảng, mã, con số. Trong công cụ này số liệu và
 *            định danh (`ca-app-pub-…`, tên space) nhiều hơn văn xuôi, mà
 *            chữ đơn cách mới cho phép so sánh chúng theo cột.
 *
 * `subsets` phải có 'vietnamese', nếu không dấu tiếng Việt rơi về font dự
 * phòng và chữ sẽ nhảy phông ngay giữa câu. Thiếu subset thì `next build`
 * dừng — nên đây là ràng buộc được máy kiểm tra, không phải lời hứa.
 *
 * `next/font` tải phông lúc build rồi phục vụ từ cùng miền, nên không có lượt
 * đi ra fonts.googleapis.com lúc chạy và không có nháy chữ khi tải trang.
 */
export const displayFont = Bricolage_Grotesque({
  subsets: ['vietnamese', 'latin'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-display',
  fallback: ['Georgia', 'serif'],
})

export const bodyFont = Roboto_Flex({
  subsets: ['vietnamese', 'latin'],
  display: 'swap',
  variable: '--font-body',
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
})

export const monoFont = JetBrains_Mono({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-mono',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
})

/** Gắn lên <html> để ba biến CSS có mặt trước khi theme đọc tới chúng. */
export const fontVariables = [displayFont.variable, bodyFont.variable, monoFont.variable].join(' ')

export const DISPLAY_FONT_STACK = `var(--font-display), Georgia, serif`
export const BODY_FONT_STACK = `var(--font-body), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
export const MONO_FONT_STACK = `var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace`
