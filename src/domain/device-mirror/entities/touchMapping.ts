export interface NormalizedPoint {
  readonly nx: number
  readonly ny: number
}

export interface DeviceSize {
  readonly width: number
  readonly height: number
}

export interface DevicePoint {
  readonly x: number
  readonly y: number
}

/**
 * Quy toạ độ chuẩn hoá của trình duyệt (`nx, ny ∈ [0,1]`) về toạ độ thật trên
 * màn hình thiết bị.
 *
 * Trình duyệt KHÔNG BAO GIỜ được tự khai kích cỡ màn hình — nó gửi toạ độ
 * chuẩn hoá, và hàm này nhân với kích cỡ THẬT của video đang chảy
 * (`AdbScrcpyVideoStream.width/height`, đi qua sự kiện `meta`/`size`). Kích cỡ
 * là dữ liệu do MÁY quyết định; để trình duyệt tự khai một tham số kích cỡ là
 * mở đường cho việc một client bịa ra kích cỡ khác kích cỡ video thật, khiến
 * mọi cú chạm rơi lệch vị trí trên màn hình thiết bị.
 *
 * Kẹp về `[0, width-1]` / `[0, height-1]`: toạ độ `nx`/`ny` đã được
 * `validateControlBatch` giới hạn trong `[0,1]`, nhưng phép nhân làm tròn vẫn
 * có thể chạm đúng biên (`round(1 * width) === width`, ngoài mảng điểm ảnh
 * hợp lệ) — kẹp ở đây một lần thay vì bắt lỗi rải rác ở nơi dùng.
 */
export function toDevicePoint(point: NormalizedPoint, size: DeviceSize): DevicePoint {
  const maxX = Math.max(size.width - 1, 0)
  const maxY = Math.max(size.height - 1, 0)
  const x = Math.round(point.nx * size.width)
  const y = Math.round(point.ny * size.height)
  return {
    x: Math.min(Math.max(x, 0), maxX),
    y: Math.min(Math.max(y, 0), maxY),
  }
}

/**
 * scrcpy `injectText` chỉ hiểu ASCII. Chữ có dấu (tiếng Việt) phải đi đường
 * `setClipboard(paste=true)` một chiều host→máy — xem quyết định #4 trong
 * `plan.md`. Đây KHÔNG phải đồng bộ clipboard hai chiều, chỉ dán một lần.
 */
export function isAsciiText(text: string): boolean {
  return /^[\x00-\x7F]*$/.test(text)
}
