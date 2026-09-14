# Spike phase 01 — cách chạy

Kết luận đầy đủ, số đo, câu lỗi nguyên văn: xem
`../reports/spike-report.md`. File này chỉ nói *cách chạy lại*.

## `mirror-spike.ts` (Node — đã kiểm với máy thật)

```bash
# Bình thường: forward tunnel, version đúng, gửi BACK cuối cùng.
pnpm exec tsx plans/260913-1240-scrcpy-device-mirror/spike/mirror-spike.ts <serial>

# Cố tình khai version lệch (3.3.3) để lấy nguyên văn câu lỗi "does not match".
pnpm exec tsx plans/260913-1240-scrcpy-device-mirror/spike/mirror-spike.ts <serial> bad-version

# Reverse tunnel thay vì forward — không gửi BACK ở chế độ này.
pnpm exec tsx plans/260913-1240-scrcpy-device-mirror/spike/mirror-spike.ts <serial> no-forward
```

Biến môi trường (đều có mặc định, không cần đặt trên máy đã kiểm):
`ADB_PATH` (mặc định `adb`), `SCRCPY_SERVER_PATH` (mặc định
`/opt/homebrew/share/scrcpy/scrcpy-server`), `SCRCPY_SERVER_VERSION` (mặc định
`3.3.4`).

Kẹt phiên cũ (encoder báo bận, không rõ nguyên nhân): `scid` sinh ngẫu nhiên
mỗi lần chạy nên hiếm khi đụng nhau; nếu vẫn kẹt, dọn tay bằng
`adb -s <serial> shell pkill -f scrcpy`.

## Route + trang tạm (trình duyệt — CHƯA kiểm được bằng mắt, xem báo cáo §5)

1. `next dev` đã chạy sẵn ở cổng 3000 (không tự khởi động lại).
2. Đăng nhập một tài khoản bất kỳ trên `http://localhost:3000/login`.
3. Mở `http://localhost:3000/mirror/spike`.
4. Gõ serial thiết bị (`RF8Y60B9NCZ` nếu vẫn là máy đang cắm), bấm "Bắt đầu".
5. Cần thấy: khung hình thật của máy hiện trên canvas trong ≤ 2s; dòng trạng
   thái tăng "Gói đã nhận"; DevTools → Console không có dòng nào chứa
   `Content Security Policy` hay `Refused to`; Network thấy request
   `POST /api/adb/mirror/spike` đang ở trạng thái "pending"/chảy dữ liệu chứ
   không phải đã xong ngay.
6. Nút "Đo RTT (20 lượt)" — bấm sau khi đã đăng nhập, không cần máy đang mở
   phiên video. In ra p50/p95.

Route tự chặn khi `NODE_ENV=production` và khi chưa đăng nhập (401) — đã kiểm
bằng `curl` (xem báo cáo). Chưa kiểm được phần vẽ lên canvas vì môi trường này
không có tài khoản để đăng nhập từ terminal và bị chặn đọc DB để tự dò
(chủ đích, không phải sự cố).
