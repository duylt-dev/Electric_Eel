import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

import { m3 } from '../theme/m3Tokens'

/**
 * Tiêu đề của một mục bên trong trang — nhỏ hơn `<PageHeader>` một bậc.
 *
 * `hint` là chỗ nói *hậu quả*, không phải chỗ nhắc lại tiêu đề. "Tài khoản" thì
 * ai cũng đọc được; thứ người ta cần biết là khoá một tài khoản thì người đó
 * mất quyền ở đâu.
 */
export interface SectionHeadingProps {
  title: ReactNode
  hint?: ReactNode
  actions?: ReactNode
}

export function SectionHeading({ title, hint, actions }: SectionHeadingProps) {
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 4,
        mb: 4,
        pb: 3,
        borderBottom: `1px solid ${m3('outlineVariant')}`,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h4">{title}</Typography>
        {hint === undefined ? null : (
          <Typography variant="body2" sx={{ color: m3('onSurfaceVariant'), mt: 1, maxWidth: '68ch' }}>
            {hint}
          </Typography>
        )}
      </Box>
      {actions === undefined ? null : <Box sx={{ flexShrink: 0 }}>{actions}</Box>}
    </Stack>
  )
}
