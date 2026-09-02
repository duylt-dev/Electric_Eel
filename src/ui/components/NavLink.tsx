'use client'

import Button from '@mui/material/Button'
import type { ButtonProps } from '@mui/material/Button'
import CardActionArea from '@mui/material/CardActionArea'
import type { CardActionAreaProps } from '@mui/material/CardActionArea'
import NextLink from 'next/link'
import type { ReactNode } from 'react'

/**
 * Nút và vùng bấm có điều hướng, dùng được từ Server Component.
 *
 * ─── Vì sao cần lớp bọc này ───
 *
 * Viết `<Button component={Link}>` ngay trong một Server Component sẽ hỏng lúc
 * chạy: `Link` là một HÀM, mà hàm thì không truyền qua ranh giới server →
 * client được. React báo lỗi "Functions cannot be passed directly to Client
 * Components", và trang trả về 500.
 *
 * Lỗi này chỉ lộ ra khi nhánh đó thật sự được vẽ, nên một bảng đang rỗng sẽ
 * giấu nó cho tới lúc có dữ liệu — đúng kiểu lỗi chạy được ở máy mình rồi hỏng
 * khi có người dùng thật.
 *
 * Ở đây `href` là một CHUỖI, tuần tự hoá được. Việc nối với `next/link` xảy ra
 * hẳn bên phía trình duyệt.
 */
// Kiểu props của MUI là đa hình theo phần tử gốc. Phải nói rõ gốc là
// `next/link`, nếu không mọi trình xử lý sự kiện vẫn mang kiểu
// HTMLButtonElement trong khi phần tử thật là thẻ <a> — và hai kiểu ấy chọi
// nhau ở mọi lời gọi.
type LinkButtonProps = Omit<ButtonProps<typeof NextLink>, 'component'> & {
  href: string
  children: ReactNode
}

export function LinkButton({ href, children, ...buttonProps }: LinkButtonProps) {
  return (
    <Button {...buttonProps} component={NextLink} href={href}>
      {children}
    </Button>
  )
}

type LinkCardActionProps = Omit<CardActionAreaProps<typeof NextLink>, 'component'> & {
  href: string
  children: ReactNode
}

export function LinkCardAction({ href, children, ...actionProps }: LinkCardActionProps) {
  return (
    <CardActionArea {...actionProps} component={NextLink} href={href}>
      {children}
    </CardActionArea>
  )
}
