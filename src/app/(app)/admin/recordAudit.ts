import 'server-only'

import { serverContainer } from '@/di/server'
import { requestInfo } from '@/lib/requestInfo'

/**
 * Ghi nhật ký kèm nguồn gốc request, dùng chung cho mọi server action quản trị.
 *
 * Nằm ở module thường chứ không trong file `'use server'`: file đó chỉ được
 * export hàm async dành cho trình duyệt gọi, mà đây là hàm nội bộ. Gom lại một
 * chỗ để không có thao tác quản trị nào bị bỏ sót phần IP — thiếu IP thì nhật
 * ký chỉ nói ai làm, không nói làm từ đâu.
 */
export const recordAudit = async (
  entry: Parameters<typeof serverContainer.audit.record>[0],
): Promise<void> => {
  const { ipAddress, userAgent } = await requestInfo()
  await serverContainer.audit.record({ ...entry, ipAddress, userAgent })
}
