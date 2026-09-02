import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

import { m3, m3Mono } from '../theme/m3Tokens'

/**
 * Đầu trang dùng chung cho mọi công cụ.
 *
 * Bốn tầng, đọc từ trên xuống theo đúng thứ tự người ta cần:
 *
 *   eyebrow   đang ở đâu trong hệ thống — chữ đơn cách nhỏ, có một vạch màu dẫn
 *   title     trang này là gì — chữ tiêu đề, cỡ lớn
 *   subtitle  vì sao nó tồn tại — một câu, không quá 60 ký tự một dòng
 *   meta      những con số đọc lướt là biết — hàng viên thông tin
 *
 * Gom thành một component thay vì mỗi trang tự dựng: thêm công cụ thứ hai thì
 * nó giống công cụ thứ nhất mà không ai phải nhớ khoảng cách bao nhiêu, và sửa
 * bố cục đầu trang là sửa một chỗ.
 */
export interface PageHeaderProps {
  eyebrow: string
  title: ReactNode
  subtitle?: ReactNode
  /** Hàng viên thông tin — thường là `<MetaChip>`. */
  meta?: ReactNode
  /** Nút bấm nằm bên phải tiêu đề. Xuống dòng khi màn hình hẹp. */
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, subtitle, meta, actions }: PageHeaderProps) {
  return (
    <Box
      component="header"
      sx={{ pb: 6, mb: 7, borderBottom: `1px solid ${m3('outlineVariant')}` }}
    >
      <Typography
        component="p"
        sx={{
          ...m3Mono.eyebrow,
          color: m3('primary'),
          display: 'flex',
          alignItems: 'center',
          gap: 2.5,
          mb: 3,
          // Vạch màu trước nhãn: đủ để mắt bám vào đầu trang mà không cần thêm
          // một khối màu lớn nào khác.
          '&::before': { content: '""', width: 26, height: 2, backgroundColor: m3('primary'), flex: 'none' },
        }}
      >
        {eyebrow}
      </Typography>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        sx={{ alignItems: { md: 'flex-end' }, justifyContent: 'space-between', gap: 4 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h1" sx={{ mb: subtitle === undefined ? 0 : 2 }}>
            {title}
          </Typography>
          {subtitle === undefined ? null : (
            <Typography sx={{ color: m3('onSurfaceVariant'), maxWidth: '60ch', fontSize: '1.05rem' }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions === undefined ? null : (
          <Stack direction="row" sx={{ gap: 2, flexShrink: 0, alignItems: 'center' }}>
            {actions}
          </Stack>
        )}
      </Stack>

      {meta === undefined ? null : (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2, mt: 5 }}>
          {meta}
        </Stack>
      )}
    </Box>
  )
}
