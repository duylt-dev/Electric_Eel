import { HttpRemoteConfigRepository } from '@/data/remote-config/HttpRemoteConfigRepository'
import { HttpTranslationRepository } from '@/data/translation/HttpTranslationRepository'

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
} as const

export type ClientContainer = typeof clientContainer
