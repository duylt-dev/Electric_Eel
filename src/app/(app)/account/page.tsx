import { redirect } from 'next/navigation'

import { SectionHeading } from '@/ui/components/SectionHeading'
import { currentUser } from '@/lib/session'
import { PasswordForm } from './PasswordForm'

export default async function AccountPage() {
  const user = await currentUser()
  if (user === null) redirect('/login')

  return (
    <>
      <SectionHeading
        title="Đổi mật khẩu"
        hint="Đổi xong, mọi thiết bị đang đăng nhập vẫn dùng được phiên cũ cho tới khi phiên đó hết hạn — tối đa tám tiếng."
      />

      <PasswordForm />
    </>
  )
}
