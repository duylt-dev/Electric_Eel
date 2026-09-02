/**
 * Tên và dấu hiệu nhận diện của supertool.
 *
 * Cùng một chuỗi phải xuất hiện ở ba nơi không liên quan gì nhau: thẻ `<title>`
 * do Next sinh, khung ứng dụng, và trang đăng nhập. Để rời rạc thì lần đổi tên
 * sau sót một chỗ, và không có gì báo — chữ sai vẫn dựng được, vẫn chạy được.
 *
 * Ảnh gốc nằm ở `public/brand/electric-eel.jpg` (1254×1254). Hai tệp
 * `src/app/icon.png` và `src/app/apple-icon.png` cắt ra từ đúng ảnh đó theo quy
 * ước tệp của Next — sinh lại bằng `sips -c 1020 1020` rồi `sips -z <n> <n>`.
 */
export const BRAND_NAME = 'Electric Eel'

/** Đọc ngay dưới tên trong khung ứng dụng: nói đây là của ai, dùng làm gì. */
export const BRAND_TAGLINE = 'Bộ công cụ nội bộ'

export const BRAND_LOGO_SRC = '/brand/electric-eel.jpg'
