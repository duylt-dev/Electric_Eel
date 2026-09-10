import { HttpAdbRepository } from '@/data/adb/HttpAdbRepository'
import { HttpRemoteConfigRepository } from '@/data/remote-config/HttpRemoteConfigRepository'
import { HttpTranslationRepository } from '@/data/translation/HttpTranslationRepository'
import { HttpTranslationSettingsRepository } from '@/data/translation/HttpTranslationSettingsRepository'

/**
 * Composition root phía trình duyệt.
 *
 * Chỉ chứa những adapter nói chuyện qua HTTP. Không có Prisma, không có
 * credential, không có `server-only` — nếu một ngày file này lỡ import thứ gì
 * thuộc về server, build sẽ gãy ngay tại `server-only`.
 */
export const clientContainer = {
  remoteConfig: new HttpRemoteConfigRepository(),
  /** Cổng dịch chuỗi — gọi Route Handler, không bao giờ chạm tới khoá API. */
  translation: new HttpTranslationRepository(),
  /**
   * Cổng cấu hình mô hình. Khoá người dùng dán vào đi LÊN qua đây và không bao
   * giờ đi xuống lại — phản hồi chỉ mang bốn ký tự cuối.
   */
  translationSettings: new HttpTranslationSettingsRepository(),
  /** Cổng adb — gọi Route Handler; `adb` thật chạy ở máy chủ. */
  adb: new HttpAdbRepository(),
} as const

export type ClientContainer = typeof clientContainer
