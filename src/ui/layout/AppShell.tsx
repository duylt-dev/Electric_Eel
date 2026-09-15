'use client'

import MenuIcon from '@mui/icons-material/Menu'
import MenuOpenIcon from '@mui/icons-material/MenuOpen'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { ColorSchemeToggle } from './ColorSchemeToggle'
import { ToolNav } from './ToolNav'
import { UserMenu } from './UserMenu'
import { toolGroups } from './toolRegistry'
import { useSidebarOpen } from './useSidebarOpen'
import { BRAND_NAME, BRAND_TAGLINE } from '../brand'
import { BrandMark } from '../components/BrandMark'
import { glass, m3, motion } from '../theme/m3Tokens'

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
 * Khung cố ý giữ rất ít chữ: nó chỉ nói *đang ở công cụ nào* — và đó là chữ
 * DUY NHẤT về vị trí trên trang, vì `<PageHeader>` của từng trang giờ chỉ còn
 * hàng nút. Nhờ vậy khung không cần biết gì về từng trang, mà mỗi trang vẫn tự
 * lo hành động của nó.
 *
 * Cột công cụ thu được (nút ở đầu header, nhớ qua `useSidebarOpen`): các công
 * cụ như mirror hay logcat cần bề ngang hơn là cần thấy danh sách công cụ. Khi
 * thu, brand dời lên header như ở màn hẹp, và nội dung được bỏ giới hạn bề
 * ngang — thu cột mà nội dung vẫn bị kẹp 1240px thì thu để làm gì. Chỉ md trở
 * lên mới có cột để thu; ở màn hẹp dải ngang vẫn luôn hiện.
 *
 * Cột thu bằng cách CO BỀ NGANG chứ không `display: none`: nội dung trượt
 * theo cột một cách liên tục, thay vì nhảy phắt sang trái. Bên trong cột chỉ
 * trượt và mờ đi, không co — chữ bị bóp trong lúc co trông như lỗi vẽ. Brand
 * trên header mờ vào sau khi cột đã đi được nửa đường, để không có lúc nào hai
 * brand cùng hiện. Giới hạn bề ngang nội dung chuyển từ px sang `100vw` để
 * trình duyệt nội suy được — `none` thì không.
 */
export function AppShell({ user, onSignOut, children }: AppShellProps) {
  const pathname = usePathname()
  const groups = toolGroups(user.isAdmin)
  const [sidebarOpen, toggleSidebar] = useSidebarOpen()
  const SidebarIcon = sidebarOpen ? MenuOpenIcon : MenuIcon

  const slide = `${motion.duration.slow}ms ${motion.spring}`
  const contentMaxWidth = sidebarOpen ? CONTENT_MAX_WIDTH : '100vw'

  const brand = (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 2.5, minWidth: 0 }}>
      <BrandMark size={34} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h5" sx={{ lineHeight: 1.1 }} noWrap>
          {BRAND_NAME}
        </Typography>
        <Typography variant="caption" sx={{ color: m3('onSurfaceVariant'), fontWeight: 500, opacity: 0.74 }} noWrap>
          {BRAND_TAGLINE}
        </Typography>
      </Box>
    </Stack>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'transparent' }}>
      <Box
        component="nav"
        aria-label="Công cụ"
        aria-hidden={!sidebarOpen}
        // `inert` để cột đã thu không còn nhận focus từ Tab — mắt không thấy thì
        // bàn phím cũng không được tới.
        inert={!sidebarOpen}
        sx={{
          display: { xs: 'none', md: 'block' },
          width: sidebarOpen ? SIDEBAR_WIDTH : 0,
          flexShrink: 0,
          overflow: 'hidden',
          position: 'sticky',
          top: 0,
          height: '100dvh',
          transition: `width ${slide}`,
          [motion.reduced]: { transition: 'none' },
          backgroundColor: glass.sidebar,
          backgroundImage: glass.highlight,
          borderRight: `1px solid ${glass.border}`,
          boxShadow: 'inset -1px 0 0 var(--glass-hairline), 14px 0 48px -44px rgb(0 0 0 / 0.58)',
          backdropFilter: glass.blurStrong,
          WebkitBackdropFilter: glass.blurStrong,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            px: 3.5,
            py: 5,
            width: SIDEBAR_WIDTH,
            height: '100%',
            opacity: sidebarOpen ? 1 : 0,
            transform: sidebarOpen ? 'none' : 'translateX(-24px)',
            transition: `opacity ${motion.duration.base}ms ${motion.standard}, transform ${slide}`,
            [motion.reduced]: { transition: 'none' },
          }}
        >
          <Box component={Link} href="/" sx={{ textDecoration: 'none', color: 'inherit', px: 1 }}>
            {brand}
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <ToolNav groups={groups} pathname={pathname} direction="column" />
          </Box>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Box
          component="header"
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            backgroundColor: glass.bar,
            backgroundImage: glass.highlight,
            borderBottom: `1px solid ${glass.border}`,
            boxShadow: 'inset 0 -1px 0 var(--glass-hairline)',
            backdropFilter: glass.blurStrong,
            WebkitBackdropFilter: glass.blurStrong,
          }}
        >
          <Stack
            direction="row"
            sx={{
              alignItems: 'center',
              gap: 3,
              px: { xs: 4, md: 8 },
              py: 2.5,
              maxWidth: contentMaxWidth,
              mx: 'auto',
              width: '100%',
              transition: `max-width ${slide}`,
              [motion.reduced]: { transition: 'none' },
            }}
          >
            <Tooltip title={sidebarOpen ? 'Thu cột công cụ' : 'Mở cột công cụ'}>
              <IconButton
                size="small"
                onClick={toggleSidebar}
                aria-label={sidebarOpen ? 'Thu cột công cụ' : 'Mở cột công cụ'}
                aria-pressed={sidebarOpen}
                sx={{ display: { xs: 'none', md: 'inline-flex' } }}
              >
                <SidebarIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Box
              sx={{
                minWidth: 0,
                display: { md: 'grid' },
                // Từ md: giữ chỗ trong luồng để nút và các mục bên phải không
                // nhảy; chỉ mờ + trượt. Bề ngang co về 0 qua grid để hàng bên
                // phải trôi theo cùng nhịp với cột.
                gridTemplateColumns: { md: sidebarOpen ? '0fr' : '1fr' },
                opacity: { md: sidebarOpen ? 0 : 1 },
                transform: { md: sidebarOpen ? 'translateX(-12px)' : 'none' },
                transition: {
                  md: `grid-template-columns ${slide}, transform ${slide}, opacity ${motion.duration.base}ms ${motion.standard} ${sidebarOpen ? 0 : motion.duration.fast}ms`,
                },
                [motion.reduced]: { transition: 'none' },
              }}
            >
              <Box sx={{ overflow: 'hidden', minWidth: 0 }}>{brand}</Box>
            </Box>
            <Box sx={{ flex: 1 }} />
            <ColorSchemeToggle />
            <UserMenu name={user.name} email={user.email} roleLabel={user.roleLabel} onSignOut={onSignOut} />
          </Stack>

          <Box
            sx={{
              display: { md: 'none' },
              px: 2,
              borderTop: `1px solid ${glass.border}`,
              backgroundColor: glass.bar,
              backdropFilter: glass.blurStrong,
              WebkitBackdropFilter: glass.blurStrong,
            }}
          >
            <ToolNav groups={groups} pathname={pathname} direction="row" />
          </Box>
        </Box>

        <Box
          component="main"
          sx={{
            flex: 1,
            minWidth: 0,
            width: '100%',
            maxWidth: contentMaxWidth,
            mx: 'auto',
            px: { xs: 4, md: 8 },
            pt: 7,
            transition: `max-width ${slide}`,
            [motion.reduced]: { transition: 'none' },
            pb: 16,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  )
}
