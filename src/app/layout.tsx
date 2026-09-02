import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { BRAND_NAME } from '@/ui/brand'
import { fontVariables } from '@/ui/theme/fonts'
import { m3Dark, m3Light } from '@/ui/theme/generatedPalette'
import { ThemeRegistry } from '@/ui/theme/ThemeRegistry'

export const metadata: Metadata = {
  title: { default: BRAND_NAME, template: `%s · ${BRAND_NAME}` },
  description: 'Bộ công cụ nội bộ. Công cụ đầu tiên: chỉnh Firebase Remote Config bằng giao diện.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: m3Light.surface },
    { media: '(prefers-color-scheme: dark)', color: m3Dark.surface },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={fontVariables} suppressHydrationWarning>
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  )
}
