import 'server-only'

import { ProcessAdbShell } from '@/data/adb/ProcessAdbShell'
import { readAdbSettings } from '@/data/adb/adbSettings'
import { PrismaAppDirectory } from '@/data/db/PrismaAppDirectory'
import { PrismaAuditLog } from '@/data/db/PrismaAuditLog'
import { PrismaRateLimit } from '@/data/db/PrismaRateLimit'
import { PrismaTranslationSettings } from '@/data/db/PrismaTranslationSettings'
import { PrismaUserRepository } from '@/data/db/PrismaUserRepository'
import { FirebaseRemoteConfigRepository } from '@/data/remote-config/FirebaseRemoteConfigRepository'
import { HttpLlmModelCatalog } from '@/data/translation/HttpLlmModelCatalog'
import { LlmStringTranslator } from '@/data/translation/LlmStringTranslator'
import { buildProviderConfig, readRuntimeOptions } from '@/data/translation/translationProvider'
import type { LlmProviderName } from '@/domain/translation/entities/LlmProvider'

/**
 * Composition root phía server: nơi DUY NHẤT được phép nối cổng ở domain với
 * hiện thực cụ thể ở data.
 *
 * Không có container DI nào ở đây, và đó là chủ ý. Với chừng này thành phần,
 * một container chỉ thêm một tầng gián tiếp và làm mất khả năng kiểm tra kiểu
 * tĩnh. Cái làm nên tính "tiêm phụ thuộc" là hướng phụ thuộc — use case nhận
 * cổng qua tham số — chứ không phải sự tồn tại của một khung DI.
 *
 * `server-only` khiến build gãy nếu file này bị import từ component client.
 * Nó nắm đường vào DB và khoá giải mã credential; rò xuống trình duyệt là hỏng
 * hết, nên chặn bằng công cụ chứ không bằng lời dặn.
 */
const appDirectory = new PrismaAppDirectory()

export const serverContainer = {
  appDirectory,
  users: new PrismaUserRepository(),
  audit: new PrismaAuditLog(),
  /** Bộ đếm nhịp đăng nhập. Đếm trong DB để không sai khi có nhiều instance. */
  rateLimit: new PrismaRateLimit(),
  /** Adapter Firebase lấy credential qua chính danh bạ app. */
  remoteConfig: new FirebaseRemoteConfigRepository(appDirectory),
  /**
   * Công cụ dịch chuỗi.
   *
   * `translator` là HÀM DỰNG chứ không phải một thể hiện dùng chung, và đó là
   * hệ quả trực tiếp của việc mỗi người mang khoá riêng: khoá chỉ biết được
   * sau khi đã biết ai gửi yêu cầu. Một `translator` dựng sẵn ở đây sẽ giữ
   * khoá của người đầu tiên và dịch bài của mọi người bằng hạn mức của họ.
   *
   * `options` cũng là hàm vì nó đọc `process.env` tại thời điểm gọi — đổi
   * `.env` rồi khởi động lại là đủ, không có bản chụp cũ nằm lại trong module.
   */
  translation: {
    settings: new PrismaTranslationSettings(),
    /** Liệt kê model của một khoá. Cũng là phép xác thực khoá đó. */
    models: new HttpLlmModelCatalog(),
    translatorFor: (provider: LlmProviderName, apiKey: string, model: string) =>
      new LlmStringTranslator(buildProviderConfig(provider, apiKey, model)),
    options: () => readRuntimeOptions(),
  },
  /**
   * Công cụ Logcat. `settings` là HÀM vì cùng một lý do như `translation`:
   * nó đọc `process.env` lúc gọi, nên đổi `ADB_PATH` rồi khởi động lại là đủ.
   *
   * Chỉ có `shell` ở đây, không có repository nào. Mọi lệnh adb đều đi qua các
   * use case trong `domain/adb/usecases` — đó là chỗ duy nhất biết cách dựng
   * tham số dòng lệnh, và cũng là chỗ duy nhất kiểm tra chúng.
   */
  adb: {
    shell: new ProcessAdbShell(),
    settings: () => readAdbSettings(),
  },
} as const

export type ServerContainer = typeof serverContainer
