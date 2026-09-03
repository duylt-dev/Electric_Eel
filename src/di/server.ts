import 'server-only'

import { ProcessAdbShell } from '@/data/adb/ProcessAdbShell'
import { readAdbSettings } from '@/data/adb/adbSettings'
import { PrismaAppDirectory } from '@/data/db/PrismaAppDirectory'
import { PrismaAuditLog } from '@/data/db/PrismaAuditLog'
import { PrismaRateLimit } from '@/data/db/PrismaRateLimit'
import { PrismaUserRepository } from '@/data/db/PrismaUserRepository'
import { FirebaseRemoteConfigRepository } from '@/data/remote-config/FirebaseRemoteConfigRepository'
import { LlmStringTranslator } from '@/data/translation/LlmStringTranslator'
import { readRuntimeOptions, readTranslationConfig } from '@/data/translation/translationProvider'

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
   * Công cụ dịch chuỗi. `config` và `options` là HÀM chứ không phải giá trị:
   * chúng đọc `process.env` tại thời điểm gọi, nên đổi `.env` rồi khởi động lại
   * là đủ — không có một bản chụp cấu hình cũ nằm lại trong module suốt vòng
   * đời tiến trình.
   */
  translation: {
    translator: new LlmStringTranslator(),
    config: () => readTranslationConfig(),
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
