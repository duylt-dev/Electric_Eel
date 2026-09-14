# Phase 01 — Spike: jar → app_process → gói video về Node → 1 khung giải mã trên trình duyệt

**Ước lượng:** 4h · **Ưu tiên:** P1 (chặn mọi phase sau) · **Trạng thái:** pending
**File ownership:** `package.json`, `pnpm-lock.yaml`, `plans/260913-1240-scrcpy-device-mirror/spike/**`, `plans/260913-1240-scrcpy-device-mirror/reports/spike-report.md`, tạm thời `src/app/(app)/mirror/spike/page.tsx` + `src/app/api/adb/mirror/spike/route.ts` (xoá cuối phase hoặc bị phase 03/05 thay).

## Context Links

- `research/researcher-01-scrcpy-protocol-and-decoding.md` — đọc kèm **bảng sửa lỗi** ở Key Insights bên dưới.
- `research/researcher-02-nextjs-transport-and-lifecycle.md` — mục 1 (ReadableStream) đúng; mục CSP sai (xem dưới).
- Tiền lệ luồng: `src/app/api/adb/logcat/route.ts`, `src/data/adb/HttpAdbRepository.ts`.
- Tango API đã kiểm trong tarball 2.3.x: `AdbServerClient`, `AdbServerNodeTcpConnector`, `AdbScrcpyClient.pushServer/start`, `AdbScrcpyOptions3_3_3(init, { version })`, `AdbScrcpyVideoStream { metadata, stream, sizeChanged, width, height }`, `client.controller: ScrcpyControlMessageWriter`, `client.output`, `client.exited`, `AdbScrcpyExitedError.output`, `DefaultServerPath`, `ScrcpyInstanceId.random()`.

## Overview

Chứng minh bằng mã chạy được, không phải bằng đọc tài liệu: (a) Node nối adb server local, đẩy jar 3.3.4, chạy `app_process`, nhận metadata + gói `configuration` + gói `data` có keyframe; (b) gửi một phím BACK và máy phản ứng; (c) trình duyệt nhận gói qua Route Handler và vẽ ≥ 1 khung lên canvas bằng WebCodecs; (d) CSP hiện tại không chặn; (e) `next build` dựng được với các gói mới. Ghi số đo để phase 03/06 chọn tham số.

## Key Insights

Sửa báo cáo nghiên cứu (phần nào dùng thì dùng bản này):

| Chỗ sai | Bản đúng |
|---|---|
| #1 "byte layout: pts 8 + flags 1 + reserved 3" | Header frame scrcpy = **12 byte**: `[u64 BE pts_and_flags][u32 BE size]`. Bit 63 = config packet, bit 62 = key frame, 62 bit thấp = pts (µs). Nguồn: `server/src/main/java/com/genymobile/scrcpy/device/Streamer.java`. Tango parse hộ; ta không tự parse |
| #1 ID control message "touch=1, text=2" | scrcpy 3.x: `InjectKeyCode=0, InjectText=1, InjectTouch=2, InjectScroll=3, BackOrScreenOn=4, ExpandNotificationPanel=5, …, SetClipboard=9, SetDisplayPower=10, RotateDevice=11` (`ScrcpyControlMessageType` trong `@yume-chan/scrcpy`). Touch = 32 byte (pointerId u64, x/y u32, w/h u16, pressure u16, actionButton u32, buttons u32) |
| #1 "`@yume-chan/scrcpy` 0.0.24", "tinyh264 0.0.21" | Thực tế 2.3.0 và 2.1.0 (transitive) |
| #2 "worker-src không khai → theo default-src", "blob: được phép trong img-src nên worker ok" | Fallback là `worker-src → child-src → script-src → default-src`; với `script-src 'self' 'unsafe-inline'` hiện tại, worker `blob:` **bị chặn**. Decoder WebCodecs của Tango **không** tạo Worker/WASM (đã grep tarball) nên v1 không cần đổi CSP; tinyh264 (để sau) mới cần `worker-src 'self' blob:` + `'wasm-unsafe-eval'` |
| #2 "adb forward tcp:NNN … + `--remove`" | Tango `AdbScrcpyForwardConnection` gọi `adb.createSocket('localabstract:scrcpy_<scid>')` thẳng qua adb server: không có port host, không có gì để `--remove` |
| #2 "Tạo phiên bằng POST /start riêng, heartbeat 30s" | Phiên sinh trong request stream, chết theo `request.signal`; không heartbeat (quyết định #4) |

Phiên bản: `AdbScrcpyOptions3_3_3` mặc định `version: '3.3.3'` → **phải truyền `{ version: '3.3.4' }`**, nếu không server thoát với "The server version (3.3.4) does not match the client (3.3.3)". 3.3.4 chỉ sửa lỗi (release notes), giao thức = 3.3.3.

## Requirements

- Chức năng: script Node in ra `deviceName`, `width×height`, codec, ≥1 gói config, ≥1 keyframe, pts tăng; BACK làm máy quay lại; trang spike vẽ khung đầu trong ≤ 2s.
- Phi chức năng: đo time-to-first-frame, RTT của POST control (20 lần, p50/p95), CPU tab khi 60fps 1440; ghi lại encoder mà máy chọn (`client.output`).
- Không để lại mã spike trong `src/` sau phase (hoặc chuyển thành mã thật ở phase 03/05).

## Architecture

```
tsx spike/mirror-spike.ts
  adb start-server (spawn qua ADB_PATH)
  AdbServerClient(AdbServerNodeTcpConnector 127.0.0.1:5037).createAdb({ serial })
  AdbScrcpyClient.pushServer(adb, Readable.toWeb(createReadStream(jar)))
  AdbScrcpyClient.start(adb, DefaultServerPath, new AdbScrcpyOptions3_3_3({
      video: true, audio: false, control: true, tunnelForward: true,
      videoCodec: 'h264', maxSize: 1440, maxFps: 60, videoBitRate: 8_000_000,
      clipboardAutosync: false, scid: ScrcpyInstanceId.random(), logLevel: 'info',
    }, { version: '3.3.4' }))
  (await client.videoStream).stream.getReader() → in 30 gói → controller.injectKeyCode(BACK) → client.close()

Trang spike (tạm): fetch POST /api/adb/mirror/spike → body nhị phân thô
  [u32 len][u8 kind][payload]  (kind 2 = config, 3 = frame [u8 keyframe][u64 pts][data])
  → WebCodecsVideoDecoder({ codec: H264, renderer: new WebGLVideoFrameRenderer(canvas) }).writable
```

## Related Code Files

Tạo (tạm/spike):
- `plans/260913-1240-scrcpy-device-mirror/spike/mirror-spike.ts` — script Node.
- `plans/260913-1240-scrcpy-device-mirror/spike/README.md` — cách chạy, kết quả.
- `src/app/api/adb/mirror/spike/route.ts` — Route Handler tạm, mở đầu `requireUser()`, chỉ bật khi `NODE_ENV !== 'production'`.
- `src/app/(app)/mirror/spike/page.tsx` — client page tạm: canvas + nút bắt đầu.
- `plans/260913-1240-scrcpy-device-mirror/reports/spike-report.md` — số đo + kết luận GO/NO-GO.

Sửa:
- `package.json` — thêm 5 gói `@yume-chan/*` (giữ lại cho các phase sau).

## Implementation Steps

1. `pnpm add @yume-chan/adb@^2.6.4 @yume-chan/adb-scrcpy@^2.3.2 @yume-chan/scrcpy@^2.3.0 @yume-chan/adb-server-node-tcp@^2.5.2 @yume-chan/scrcpy-decoder-webcodecs@^2.5.3`; `pnpm typecheck` phải xanh (không đổi TS).
2. Viết `mirror-spike.ts` theo sơ đồ trên. Đọc `SCRCPY_SERVER_PATH` (mặc định `/opt/homebrew/share/scrcpy/scrcpy-server`), serial từ argv. In `client.output` ra để thấy encoder + lỗi server.
3. Chạy với máy `RF8Y60B9NCZ`. Nếu server thoát: đọc `AdbScrcpyExitedError.output`; thử lần lượt `version` sai (để thấy câu "does not match" — cần cho quy lỗi ở phase 03), `tunnelForward: false`.
4. Ghi số: thời gian từ `start()` tới gói keyframe đầu; kích cỡ gói; pts step; tên encoder.
5. Route tạm: pull-based `ReadableStream` (`pull()` đọc một gói từ reader Tango → `controller.enqueue`), đóng theo `request.signal` → `client.close()`.
6. Trang tạm: `WebCodecsVideoDecoder.isSupported` → decoder → đọc body theo framing tạm → `writer.write(packet)`. Mở DevTools: **tab Console không có dòng CSP nào**, tab Network thấy response chảy.
7. Đo RTT control: 20 lần `fetch POST` tới route tạm với thân rỗng (chưa cần gửi tới máy) → p50/p95. Kéo chuột thử qua `injectTouch` nếu còn thời gian.
8. `pnpm build` một lần: nếu lỗi bundle `node:net`/`@yume-chan/adb-server-node-tcp` → thêm `serverExternalPackages: ['@yume-chan/adb-server-node-tcp']` và ghi vào báo cáo.
9. Viết `spike-report.md`; xoá hai file tạm trong `src/` (hoặc ghi rõ phase nào thay thế); `pnpm lint && pnpm typecheck` xanh.

## Todo List

- [ ] Cài 5 gói, typecheck xanh
- [ ] Script Node in metadata + config + keyframe, BACK có tác dụng
- [ ] Thử lệch version → có câu "does not match" trong output
- [ ] Route + page tạm vẽ được khung đầu; Console không có CSP violation
- [ ] Đo TTFF, RTT control, CPU tab; ghi encoder
- [ ] `pnpm build` xanh (hoặc ghi `serverExternalPackages`)
- [ ] `spike-report.md` với kết luận GO/NO-GO; dọn mã tạm

## Success Criteria

- Khung hình thật của máy hiện trên canvas trong trình duyệt qua Route Handler của Next, không đổi CSP.
- BACK từ Node làm máy quay lại.
- Báo cáo có đủ số đo; các câu lỗi thật của server được chép lại để phase 03 quy đổi.

## Tiêu chí dừng (NO-GO)

Sau **4h** mà một trong hai điều sau chưa đạt thì dừng, viết báo cáo, quay lại bàn phương án:
- Node không lấy được gói `data` keyframe nào từ máy thật (thử cả forward và reverse tunnel).
- Trình duyệt không vẽ được khung nào dù gói đã tới (WebCodecs báo lỗi codec).
Phương án dự phòng để bàn: giữ Tango phía Node nhưng đổi decoder (tinyh264 + đổi CSP), hoặc kết luận công cụ chỉ chạy được bằng scrcpy desktop.

## Risk Assessment

| Rủi ro | Giảm nhẹ |
|---|---|
| Samsung Android 16 chặn `app_process` hoặc cần `--power-on` | Đọc `client.output`; đối chiếu `scrcpy -s <serial>` desktop cùng máy để tách lỗi môi trường khỏi lỗi mã |
| adb server chưa chạy → `ECONNREFUSED 5037` | `adb start-server` trước; ghi lại mã lỗi để quy đổi |
| Turbopack không bundle được `net` | `serverExternalPackages` |
| Chạy lại khi phiên cũ chưa thoát trên máy → encoder bận | `scid` ngẫu nhiên + `client.close()` trong `finally`; nếu kẹt: `adb shell pkill -f scrcpy` bằng tay và ghi vào README |

## Security Considerations

- Route tạm vẫn `requireUser()` và `isSafeSerial`; không nhận tham số tự do; chỉ chạy khi không production.
- Không commit `.env`; jar không vào git.

## Next Steps

- GO → phase 02 (domain) bắt đầu ngay; phase 03 dùng lại đoạn nối Tango từ script spike.
- Ghi vào `spike-report.md` mọi khác biệt API so với plan này (tên trường, kiểu bigint…) để phase 03/04 không phải dò lại.
