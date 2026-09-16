/**
 * Thiết bị tới được công cụ bằng đường nào.
 *
 *   `server` — `adb` chạy trên MÁY CHỦ đang phục vụ trang, thấy máy cắm vào
 *              máy chủ đó. Đúng khi `pnpm dev` ở máy mình hoặc máy chủ tự quản.
 *   `webusb` — trình duyệt nói chuyện thẳng với daemon adb trên điện thoại
 *              cắm vào MÁY NGƯỜI DÙNG (WebUSB). Máy chủ không chạy gì, nên đây
 *              là đường duy nhất chạy được trên Vercel.
 *
 * Trang quyết định đường nào (từ `ADB_ENABLED`) rồi truyền xuống; ViewModel
 * không đoán — hai đường có adapter khác nhau ở `di/client.ts`.
 */
export type AdbAccess = 'server' | 'webusb'
