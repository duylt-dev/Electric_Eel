import 'server-only'

import { accessSync, constants, createReadStream } from 'node:fs'
import { Readable } from 'node:stream'

import { AppErrors, type Result, err, ok } from '../../core/result'
import { JAR_UNREADABLE_MESSAGE, SCRCPY_JAR_NOT_FOUND_MESSAGE } from './mirrorSettings'

/**
 * Mở `scrcpy-server` (jar) thành luồng Web Streams để đẩy lên máy qua
 * `AdbScrcpyClient.pushServer`.
 *
 * `readMirrorSettings` đã kiểm file tồn tại bằng `exists()`, nhưng đó là một
 * lượt kiểm RIÊNG — có thể cách lúc dùng thật vài giây (nhiều phiên mở liên
 * tiếp cùng dùng lại một lần đọc settings). `accessSync` ở đây bắt đúng
 * TOCTOU: file bị xoá hoặc đổi quyền giữa hai thời điểm đó.
 *
 * Bắt buộc kiểm ĐỒNG BỘ trước khi tạo stream: `fs.createReadStream` không ném
 * lỗi ngay khi file thiếu — nó mở file bất đồng bộ rồi phát sự kiện `error`,
 * nên nếu không kiểm trước thì một `ENOENT` sẽ trôi tới tận
 * `AdbScrcpyClient.pushServer` và lộ ra dưới dạng một exception chung chung,
 * khó truy hơn nhiều so với việc chặn ngay tại đây.
 */
export function openJarStream(path: string): Result<ReadableStream<Uint8Array>> {
  try {
    accessSync(path, constants.R_OK)
  } catch (thrown) {
    const code = (thrown as NodeJS.ErrnoException).code
    if (code === 'EACCES') {
      // Đường dẫn hệ thống tệp máy chủ là chi tiết hạ tầng → `detail` (chỉ ghi log), không vào `message`.
      return err(AppErrors.forbidden(JAR_UNREADABLE_MESSAGE, { detail: path }))
    }
    return err(AppErrors.notFound(SCRCPY_JAR_NOT_FOUND_MESSAGE))
  }
  return ok(Readable.toWeb(createReadStream(path)) as unknown as ReadableStream<Uint8Array>)
}
