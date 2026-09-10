import Box from '@mui/material/Box'
import type { ReactNode } from 'react'

import { glass, m3, m3Shape } from '../theme/m3Tokens'

/**
 * Viên thông tin trên đầu trang: một nhãn mờ và một giá trị rõ, nằm trong một
 * viên bo tròn hẳn.
 *
 * Cặp nhãn–giá trị đặt cạnh nhau trong cùng một viên thay vì hai dòng riêng, để
 * một hàng có thể chứa năm sáu con số mà vẫn đọc được từ trái sang phải mà
 * không cần dò cột.
 */
export interface MetaChipProps {
  label: string
  children: ReactNode
}

export function MetaChip({ label, children }: MetaChipProps) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 1.5,
        borderRadius: `${m3Shape.full}px`,
        border: `1px solid ${glass.border}`,
        backgroundColor: glass.control,
        backdropFilter: glass.blur,
        WebkitBackdropFilter: glass.blur,
        color: m3('onSurfaceVariant'),
        fontSize: '0.78rem',
        lineHeight: 1.35,
        fontWeight: 500,
        paddingInline: '11px',
        paddingBlock: '4px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      <Box component="span" sx={{ color: m3('onSurface'), fontWeight: 700 }}>
        {children}
      </Box>
    </Box>
  )
}
