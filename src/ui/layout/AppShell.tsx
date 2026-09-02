'use client'

import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { ColorSchemeToggle } from './ColorSchemeToggle'
import { ToolNav } from './ToolNav'
import { UserMenu } from './UserMenu'
import { visibleTools } from './toolRegistry'
import { BRAND_NAME, BRAND_TAGLINE } from '../brand'
import { BrandMark } from '../components/BrandMark'
import { m3, m3Mono } from '../theme/m3Tokens'

const SIDEBAR_WIDTH = 236
const CONTENT_MAX_WIDTH = 1240

export interface AppShellProps {
  user: { name: string; email: string; roleLabel: string; isAdmin: boolean }
  onSignOut: () => void
  children: ReactNode
}

/**
 * Khung của supertool: cột bên trái liệt kê CÔNG CỤ, không phải màn hình.
 *
 * Đây là điều duy nhất quan trọng về bố cục này. Xếp theo màn hình thì thêm
 * công cụ thứ hai là phải sắp lại toàn bộ; xếp theo công cụ thì mỗi công cụ tự
 * lo phần điều hướng bên trong nó, và cái khung này không phải đổi nữa.
 *
 * Khung cố ý giữ rất ít chữ: nó chỉ nói *đang ở công cụ nào*. Tiêu đề, mô tả và
 * các con số của từng trang thuộc về `<PageHeader>` của chính trang đó — nhờ
 * vậy khung vẫn không cần biết gì về từng trang, mà mỗi trang vẫn nói được
 * những thứ chỉ nó biết (đang sửa app nào, còn bao nhiêu cảnh báo).
 */
export function AppShell({ user, onSignOut, children }: AppShellProps) {
  const pathname = usePathname()
  const tools = visibleTools(user.isAdmin)

  const brand = (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 2.5, minWidth: 0 }}>
      <BrandMark size={34} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h5" sx={{ lineHeight: 1.1 }} noWrap>
          {BRAND_NAME}
        </Typography>
        <Typography sx={{ ...m3Mono.columnHeader, color: m3('onSurfaceVariant') }} noWrap>
          {BRAND_TAGLINE}
        </Typography>
      </Box>
    </Stack>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: m3('surface') }}>
      <Box
        component="nav"
        aria-label="Công cụ"
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          gap: 6,
          px: 4,
          py: 6,
          position: 'sticky',
          top: 0,
          height: '100dvh',
          borderRight: `1px solid ${m3('outlineVariant')}`,
        }}
      >
        <Box component={Link} href="/" sx={{ textDecoration: 'none', color: 'inherit', px: 1 }}>
          {brand}
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ ...m3Mono.columnHeader, color: m3('onSurfaceVariant'), px: 3, mb: 2 }}>
            Công cụ
          </Typography>
          <ToolNav tools={tools} pathname={pathname} direction="column" />
        </Box>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Box
          component="header"
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            bgcolor: m3('surface'),
            borderBottom: `1px solid ${m3('outlineVariant')}`,
          }}
        >
          <Stack
            direction="row"
            sx={{
              alignItems: 'center',
              gap: 3,
              px: { xs: 4, md: 8 },
              py: 3,
              maxWidth: CONTENT_MAX_WIDTH,
              mx: 'auto',
              width: '100%',
            }}
          >
            <Box sx={{ display: { md: 'none' }, minWidth: 0 }}>{brand}</Box>
            <Box sx={{ flex: 1 }} />
            <ColorSchemeToggle />
            <UserMenu name={user.name} email={user.email} roleLabel={user.roleLabel} onSignOut={onSignOut} />
          </Stack>

          <Box
            sx={{
              display: { md: 'none' },
              px: 2,
              borderTop: `1px solid ${m3('outlineVariant')}`,
            }}
          >
            <ToolNav tools={tools} pathname={pathname} direction="row" />
          </Box>
        </Box>

        <Box
          component="main"
          sx={{
            flex: 1,
            minWidth: 0,
            width: '100%',
            maxWidth: CONTENT_MAX_WIDTH,
            mx: 'auto',
            px: { xs: 4, md: 8 },
            pt: 8,
            pb: 16,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  )
}
