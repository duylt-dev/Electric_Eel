import Stack from '@mui/material/Stack'
import type { ReactNode } from 'react'

/**
 * Đầu trang dùng chung: MỘT hàng nút thu gọn, dồn về mép phải. Không có gì khác.
 *
 * Từng có eyebrow, tiêu đề lớn, subtitle, hàng meta, dãy chip số liệu. Bỏ hết
 * dần: người dùng nội bộ vào một công cụ hàng chục lần mỗi ngày, mọi chữ mô
 * tả chỉ đọc đúng một lần rồi từ đó chiếm chỗ — ở màn logcat và mirror, mỗi
 * dòng đầu trang là một dòng log hoặc một phần màn điện thoại. Trang đang ở
 * đâu đã có menu bên trái nói; trang làm gì thì nội dung phía dưới nói.
 *
 * Trang không có nút thì KHÔNG dùng component này — không có gì để vẽ.
 *
 * Nút nên là `<IconButton size="small">` bọc `<Tooltip>`: hàng này chỉ cao
 * bằng một nút nhỏ; nút có chữ kéo cả hàng lên theo. Giữ nút có chữ cho đúng
 * một hành động chính của trang (ví dụ "Đẩy lên" ở editor config).
 */
export interface PageHeaderProps {
  children: ReactNode
}

export function PageHeader({ children }: PageHeaderProps) {
  return (
    <Stack component="header" direction="row" sx={{ gap: 1, alignItems: 'center', justifyContent: 'flex-end', mb: 2 }}>
      {children}
    </Stack>
  )
}
