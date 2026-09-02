import { redirect } from 'next/navigation'

import { GLOBAL_ROLE_LABEL } from '@/domain/identity/entities/Permission'
import { MetaChip } from '@/ui/components/MetaChip'
import { PageHeader } from '@/ui/components/PageHeader'
import { SectionHeading } from '@/ui/components/SectionHeading'
import { currentUser } from '@/lib/session'
import { PasswordForm } from './PasswordForm'

export default async function AccountPage() {
  const user = await currentUser()
  if (user === null) redirect('/login')

  return (
    <>
      <PageHeader
        eyebrow="Tài khoản"
        title={user.name}
        subtitle="Thông tin tài khoản nội bộ của bạn và chỗ đổi mật khẩu."
        meta={
          <>
            <MetaChip label="email">{user.email}</MetaChip>
            <MetaChip label="quyền">{GLOBAL_ROLE_LABEL[user.role]}</MetaChip>
          </>
        }
      />

      <SectionHeading
        title="Đổi mật khẩu"
        hint="Đổi xong, mọi thiết bị đang đăng nhập vẫn dùng được phiên cũ cho tới khi phiên đó hết hạn — tối đa tám tiếng."
      />

      <PasswordForm />
    </>
  )
}
