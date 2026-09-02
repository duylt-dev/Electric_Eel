import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { GLOBAL_ROLE_LABEL } from '@/domain/identity/entities/Permission'
import { signOut } from '@/lib/auth'
import { currentUser } from '@/lib/session'
import { ShellFrame } from './ShellFrame'

/**
 * Cửa vào khu vực đã đăng nhập.
 *
 * Kiểm tra phiên ở layout chứ không ở middleware: middleware chạy trên edge
 * runtime, nơi Prisma và bcrypt đều không dùng được. Kiểm ở đây thì mọi trang
 * nằm dưới nhóm route này đều được che, và không có đường vòng nào bỏ sót.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser()
  if (user === null) redirect('/login')

  const signOutAction = async () => {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  return (
    <ShellFrame
      user={{
        name: user.name,
        email: user.email,
        roleLabel: GLOBAL_ROLE_LABEL[user.role],
        isAdmin: user.role === 'ADMIN',
      }}
      onSignOut={signOutAction}
    >
      {children}
    </ShellFrame>
  )
}
