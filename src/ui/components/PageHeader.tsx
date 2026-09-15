import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

import { m3 } from '../theme/m3Tokens'

/**
 * Đầu trang dùng chung cho mọi công cụ.
 *
 * Hai tầng, cố ý thấp:
 *
 *   eyebrow            đang ở đâu trong hệ thống — chữ đơn cách nhỏ, có vạch màu dẫn
 *   title · meta · actions   trang này là gì, vài con số đọc lướt, và nút — MỘT hàng
 *
 * Từng có tầng `subtitle` ("vì sao trang này tồn tại") và hàng meta riêng. Bỏ
 * cả hai: người dùng nội bộ vào một công cụ hàng chục lần mỗi ngày, đọc câu mô
 * tả đúng một lần rồi từ đó nó chỉ chiếm chỗ — ở màn logcat và mirror, ~80px
 * đầu trang là hai-ba dòng log hoặc một phần màn điện thoại. Việc *trang làm
 * gì* đã nói ở menu bên trái và ở chính nội dung phía dưới.
 *
 * Cố ý là chữ trần, KHÔNG bọc trong thẻ kính — bọc thêm viền + đệm là mất ngót
 * trăm pixel cho một cái hộp không chứa gì để thao tác.
 *
 * Nút trong `actions` nên là `size="small"`: hàng này đứng ngang tiêu đề, nút
 * cỡ thường cao hơn chữ tiêu đề và kéo cả hàng lên theo.
 */
export interface PageHeaderProps {
  eyebrow: string
  title: ReactNode
  /** Viên thông tin — thường là `<MetaChip>` / `<StatusChip>` — đứng ngay sau tiêu đề. */
  meta?: ReactNode
  /** Nút bấm, đẩy về mép phải của cùng hàng. Xuống dòng khi màn hình hẹp. */
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, meta, actions }: PageHeaderProps) {
  return (
    <Box component="header" sx={{ mb: 3 }}>
      <Typography
        component="p"
        variant="caption"
        sx={{
          color: m3('primary'),
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mb: 1,
          fontWeight: 650,
          // Vạch màu trước nhãn: đủ để mắt bám vào đầu trang mà không cần thêm
          // một khối màu lớn nào khác.
          '&::before': { content: '""', width: 30, height: 2, borderRadius: 999, backgroundColor: m3('primary'), flex: 'none' },
        }}
      >
        {eyebrow}
      </Typography>

      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', columnGap: 3, rowGap: 2 }}>
        {/* Vẫn là <h1> của trang (đọc màn hình), chỉ vẽ ở cỡ headline-small để
            đứng vừa một hàng với chip và nút. */}
        <Typography component="h1" variant="h4" sx={{ minWidth: 0, mr: 1 }}>
          {title}
        </Typography>

        {meta === undefined ? null : (
          <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
            {meta}
          </Stack>
        )}

        {actions === undefined ? null : (
          <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center', ml: 'auto' }}>
            {actions}
          </Stack>
        )}
      </Stack>
    </Box>
  )
}
