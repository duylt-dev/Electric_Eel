import Alert from '@mui/material/Alert'
import type { Metadata } from 'next'

import { serverContainer } from '@/di/server'
import { StringTranslatorRoot } from '@/features/string-translator/StringTranslatorRoot'
import { requireUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Dịch' }

/**
 * Cửa vào công cụ dịch chuỗi.
 *
 * Trang chỉ lo hai việc: kiểm quyền, và cho màn hình biết mô hình nào đang được
 * cấu hình. Trạng thái cấu hình đọc ở đây chứ không đọc bằng một lượt gọi API
 * lúc màn hình đã hiện — thiếu khoá API là thứ người dùng cần biết TRƯỚC khi
 * mất công chọn tệp, không phải sau khi bấm nút dịch.
 *
 * Khoá API không bao giờ rời máy chủ: chỉ có nhãn "nhà cung cấp · model" đi
 * xuống trình duyệt.
 */
export default async function TranslationsPage() {
  const user = await requireUser()
  if (!user.ok) {
    return <Alert severity="error">{user.error.message}</Alert>
  }

  const config = serverContainer.translation.config()

  return (
    <StringTranslatorRoot
      providerLabel={config.ok ? `${config.value.provider} · ${config.value.model}` : 'chưa cấu hình'}
      configured={config.ok}
      {...(config.ok ? {} : { configurationHint: config.error.message })}
    />
  )
}
