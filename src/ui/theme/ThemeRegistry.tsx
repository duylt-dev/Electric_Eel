'use client'

import CssBaseline from '@mui/material/CssBaseline'
import GlobalStyles from '@mui/material/GlobalStyles'
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript'
import { ThemeProvider } from '@mui/material/styles'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import type { ReactNode } from 'react'

import { m3GlobalCss } from './m3Tokens'
import { appTheme } from './theme'

/**
 * Bọc toàn ứng dụng: cache CSS cho App Router, theme, và bộ biến màu M3.
 *
 * `InitColorSchemeScript` chạy trước khi trang vẽ lần đầu để đặt chế độ
 * sáng/tối đã lưu. Không có nó, người dùng chế độ tối sẽ thấy một nháy trắng
 * mỗi lần tải trang.
 */
export function ThemeRegistry({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: 'mui', enableCssLayer: true }}>
      <ThemeProvider theme={appTheme} defaultMode="system">
        <InitColorSchemeScript attribute="data-mui-color-scheme" defaultMode="system" />
        <CssBaseline />
        <GlobalStyles styles={m3GlobalCss} />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  )
}
