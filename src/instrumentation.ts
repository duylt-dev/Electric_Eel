/**
 * Móc khởi động của Next.
 *
 * `register()` chạy đúng một lần khi tiến trình server lên, và quan trọng là
 * KHÔNG chạy lúc `next build`. Đó là lý do việc kiểm tra biến môi trường nằm ở
 * đây chứ không nằm ở một module nào đó được import lúc dựng: kiểm lúc dựng thì
 * CI phải mang theo mọi bí mật của production chỉ để build được, mà một máy CI
 * giữ khoá mã hoá credential là thứ ta đang cố tránh.
 */
export async function register(): Promise<void> {
  // `register` cũng được gọi cho edge runtime, nơi không có gì trong số này
  // dùng tới; kiểm hai lần chỉ tạo ra một thông báo lỗi khó hiểu.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { assertServerEnv } = await import('./lib/env')
  assertServerEnv()
}
