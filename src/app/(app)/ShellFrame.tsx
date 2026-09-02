'use client'

import type { ReactNode } from 'react'

import { AppShell } from '@/ui/layout/AppShell'

/**
 * Cầu nối giữa layout phía server và khung phía trình duyệt.
 *
 * `onSignOut` là một server action được truyền xuống component client. Nhờ vậy
 * việc đăng xuất vẫn chạy trên server (nơi xoá được cookie phiên) mà nút bấm
 * vẫn nằm trong khung client, không phải kéo thêm next-auth/react vào bundle.
 */
export function ShellFrame({
  user,
  onSignOut,
  children,
}: {
  user: { name: string; email: string; roleLabel: string; isAdmin: boolean }
  onSignOut: () => Promise<void>
  children: ReactNode
}) {
  return (
    <AppShell user={user} onSignOut={() => void onSignOut()}>
      {children}
    </AppShell>
  )
}
