import type { AdbDevice } from './AdbDevice'

/**
 * Những gì máy chủ đẩy về trong lúc theo dõi thiết bị, mỗi dòng NDJSON một
 * sự kiện.
 *
 * `devices` mang TOÀN BỘ danh sách hiện tại chứ không phải "máy vừa cắm"/
 * "máy vừa rút": bên nhận thay cả mảng, không phải ghép diff — và nếu lỡ mất
 * một sự kiện giữa chừng thì sự kiện kế tiếp vẫn đúng.
 */
export type DeviceWatchEvent =
  | { readonly type: 'devices'; readonly devices: readonly AdbDevice[] }
  /**
   * Một lượt hỏi adb hỏng. Luồng KHÔNG dừng: adb hay lỡ một nhịp lúc daemon
   * khởi động lại, và danh sách đang có vẫn đúng cho tới khi có tin mới.
   */
  | { readonly type: 'failed'; readonly message: string }
