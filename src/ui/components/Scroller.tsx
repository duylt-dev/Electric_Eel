import Box from '@mui/material/Box'
import type { SxProps, Theme } from '@mui/material/styles'
import type { ReactNode } from 'react'

import { glass, m3Shape } from '../theme/m3Tokens'

/**
 * Hộp chứa nội dung rộng hơn bề ngang trang: bảng, sơ đồ, khối JSON.
 *
 * Cuộn ngang phải xảy ra *bên trong* hộp này, không phải ở cả trang. Một bảng
 * 12 cột làm cả trang trượt sang ngang thì thanh điều hướng và đầu trang cũng
 * trượt theo, và người dùng mất luôn điểm tựa để biết mình đang ở đâu.
 */
export function Scroller({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Box
      sx={[
        {
          overflowX: 'auto',
          border: `1px solid ${glass.border}`,
          borderRadius: `${m3Shape.large}px`,
          backgroundColor: glass.surface,
          backgroundImage: glass.highlight,
          boxShadow: glass.shadow,
          backdropFilter: glass.blur,
          WebkitBackdropFilter: glass.blur,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  )
}
