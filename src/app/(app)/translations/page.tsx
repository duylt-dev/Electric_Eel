import Alert from '@mui/material/Alert'
import type { Metadata } from 'next'

import { defaultTranslationSettings } from '@/domain/translation/entities/TranslationSettings'
import { serverContainer } from '@/di/server'
import { StringTranslatorRoot } from '@/features/string-translator/StringTranslatorRoot'
import { requireUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Dịch' }

/**
 * Cửa vào công cụ dịch chuỗi.
 *
 * Trang lo hai việc: kiểm quyền, và đọc sẵn cấu hình mô hình CỦA NGƯỜI ĐANG
 * ĐĂNG NHẬP. Đọc ở đây chứ không bằng một lượt gọi API sau khi màn hình đã hiện
 * — trang là Server Component nên nó chạm được DB trước khi HTML rời máy chủ,
 * và nhờ vậy ô chọn model không nháy một nhịp từ rỗng sang có.
 *
 * Khoá API không bao giờ rời máy chủ. Thứ đi xuống trình duyệt là nhà cung cấp,
 * model, và bốn ký tự cuối của khoá.
 *
 * ── Vì sao đọc hỏng KHÔNG chặn màn hình ──
 *
 * Cấu hình là thứ người dùng tự sửa được, và chỗ sửa nó nằm ngay trong màn hình
 * này. Trả về mỗi câu báo lỗi vì đọc hỏng là bịt luôn lối đó: người dùng thấy
 * "không đọc được cấu hình" và không có gì bấm được để cấu hình lại. Nên khi
 * đọc hỏng thì vẽ bằng cấu hình mặc định kèm một dải cảnh báo — panel gắn khoá
 * ghi qua Route Handler riêng, không phụ thuộc vào lượt đọc vừa hỏng này.
 */
export default async function TranslationsPage() {
  const user = await requireUser()
  if (!user.ok) {
    return <Alert severity="error">{user.error.message}</Alert>
  }

  const settings = await serverContainer.translation.settings.read(user.value.id)

  if (!settings.ok) {
    // Chi tiết kỹ thuật không đi xuống trình duyệt, nên không ghi ở đây thì nó
    // không xuất hiện ở đâu cả và lỗi trở thành thứ không chẩn đoán được.
    console.error(
      `[translations] ${settings.error.kind}: ${settings.error.message}`,
      settings.error.detail ?? settings.error.cause ?? '',
    )
  }

  return (
    <>
      {settings.ok ? null : (
        <Alert severity="warning" sx={{ mb: 6 }}>
          {settings.error.message} Màn hình đang hiện cấu hình mặc định — khoá đã lưu trước đó (nếu
          có) vẫn còn nguyên, dán lại khoá ở bước 1 là dùng tiếp được.
        </Alert>
      )}
      <StringTranslatorRoot settings={settings.ok ? settings.value : defaultTranslationSettings()} />
    </>
  )
}
