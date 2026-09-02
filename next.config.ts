import type { NextConfig } from 'next'

const isDevelopment = process.env.NODE_ENV !== 'production'

/**
 * Content-Security-Policy.
 *
 * `'unsafe-inline'` cho script là một nhượng bộ có ý thức, không phải sơ suất:
 * bỏ được nó đòi hỏi gắn nonce cho từng thẻ script Next tự chèn, mà nonce thì
 * phải sinh trong middleware — tức là dựng một tầng middleware cho một dự án
 * đã cố tình không có tầng đó (xem `LLM.md` §7). Ngay cả khi giữ nhượng bộ này,
 * chính sách vẫn chặn được thứ đáng chặn nhất: nạp mã từ máy chủ bên ngoài.
 *
 * `style-src 'unsafe-inline'` thì bắt buộc — Emotion, tức là MUI, chèn thẻ
 * style ngay trong lúc chạy.
 *
 * Dòng có sức nặng nhất ở đây là `frame-ancestors 'none'`. Trang này có nút đẩy
 * cấu hình lên production của app thật, nên để nó nhúng được vào iframe của
 * trang khác là mời người ta dựng một nút publish vô hình.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  // next/font tự lưu phông vào cùng gốc, nên không cần mở cho Google Fonts.
  "font-src 'self' data:",
  // Trình duyệt chỉ gọi Route Handler của chính trang này; mọi lệnh gọi
  // Firebase đều chạy phía server. Ở dev cần thêm websocket cho hot reload.
  `connect-src 'self'${isDevelopment ? ' ws: wss:' : ''}`,
  "manifest-src 'self'",
  ...(isDevelopment ? [] : ['upgrade-insecure-requests']),
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  // Thừa so với `frame-ancestors` ở trình duyệt hiện đại, nhưng vẫn giữ: đây
  // là hàng rào chống nhúng iframe duy nhất mà trình duyệt cũ hiểu được.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Slug của app và tên project Firebase nằm trên URL, nên đừng để chúng đi
  // theo Referer sang trang ngoài.
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16 tự sinh AGENTS.md. File đó ở đây do GitNexus quản lý, nên tắt để
  // hai bên không ghi đè lẫn nhau.
  agentRules: false,
  experimental: {
    optimizePackageImports: ['@mui/material', '@mui/icons-material'],
  },
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        ...securityHeaders,
        // HSTS chỉ ở production: bật ở dev thì trình duyệt ghi nhớ và từ đó ép
        // https cho cả localhost, kể cả sau khi đã gỡ header đi.
        ...(isDevelopment
          ? []
          : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
      ],
    },
  ],
}

export default nextConfig
