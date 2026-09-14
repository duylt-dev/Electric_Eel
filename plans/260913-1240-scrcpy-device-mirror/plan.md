---
title: "Mirror + điều khiển màn hình Android (scrcpy) trong trình duyệt"
description: "Công cụ thứ 4 của khối product: xem và điều khiển thiết bị Android đang cắm vào máy chủ, qua scrcpy-server + Tango, giải mã WebCodecs."
status: pending
priority: P2
effort: 45h
branch: duylt_dev
tags: [scrcpy, adb, webcodecs, streaming, mvi, product-tool]
created: 2026-09-13
---

# Mirror màn hình thiết bị — kế hoạch

**Mục tiêu.** Trang `/mirror` chọn máy → `/mirror/[serial]` hiện màn hình máy thật (H.264 → WebCodecs → `<canvas>`), chạm/kéo/cuộn, phím Back/Home/Recents/Power/Volume, xoay, tắt-bật màn hình, gõ chữ, chụp PNG. Không audio, không clipboard hai chiều (v1). Máy chủ thực tế = máy dev (`next dev`, HTTP/1.1); production tắt theo `ADB_ENABLED`.

**Phạm vi.** *Đầy đủ* (mặc định, 45h) hoặc *chỉ xem* (~32h: bỏ phase 6, bỏ registry + route control ở phase 3, bỏ entity/outbox control ở phase 2, bỏ pointer ở phase 5). Chỉ xem không cần bảng phiên — luồng sống đúng bằng request, y như Logcat.

## Quyết định đã chốt

| # | Quyết định | Lý do |
|---|---|---|
| 1 | Dùng `@yume-chan/*` (Tango), **chỉ import ở `data/`**; `domain/` giữ thuần; thêm luật ESLint cấm `@yume-chan/*` ở `core/domain/features/ui/app` | Tự viết parser ≈ 4–6 tuần và phải theo scrcpy đổi giao thức; Tango 2.3 đã có `ScrcpyOptions3_3_3` + `AdbScrcpyOptions3_3_3({...}, { version: '3.3.4' })`. Khớp mẫu Prisma/Firebase: thư viện là hiện thực của cổng |
| 2 | `adb start-server` qua `ProcessAdbShell` (giữ `ADB_PATH`), rồi Tango nối adb server `127.0.0.1:5037` bằng `AdbServerNodeTcpConnector`; `tunnelForward: true` → socket `localabstract:` đi thẳng qua adb server, **không** `adb forward`. Jar: `SCRCPY_SERVER_PATH` (dò sẵn `/opt/homebrew/share/scrcpy/scrcpy-server`), `SCRCPY_SERVER_VERSION` mặc định `3.3.4`; lệch bản → đọc stderr "does not match" → lỗi nói đúng biến cần đặt | Không cấp phát port, không dọn forward, không jar trong git. 3.3.4 chỉ sửa lỗi, giao thức = 3.3.3 (đã kiểm release notes) |
| 3 | Xuống: `POST /api/adb/mirror/stream` trả luồng nhị phân length-prefixed (`[u32 len][u8 kind][payload]`), pull-based để backpressure lan tới encoder. Lên: `POST /api/adb/mirror/control` lô JSON, **một request đang bay tại một thời điểm**, gộp MOVE theo pointer (`ControlOutbox` thuần). Trễ kỳ vọng localhost: 1 RTT ≈ 5–15ms + xử lý; dự phòng WebSocket qua custom server chỉ khi p95 > 100ms | `duplex: 'half'` cần HTTP/2 (Chromium) → chết trên `next dev`; WebSocket phá `next dev`/HMR. Tuần tự hoá request giữ đúng thứ tự down→move→up |
| 4 | Phiên **sinh trong chính request stream** và chết theo `request.signal` của nó; bảng phiên `globalThis` chỉ để route control tìm được controller. Một phiên/serial (409 nếu trùng), phiên thuộc `userId`. Không heartbeat/TTL: kết nối video chính là heartbeat. Ghi vào `LLM.md` §12 (cố ý) | Giữ tinh thần `ProcessAdbShell`: mỗi tài nguyên sống trên máy thuộc đúng một request đang mở; registry chỉ bắc cầu cho kênh lên |
| 5 | WebCodecs H.264 duy nhất; không tinyh264 ở v1 (báo "đổi Chrome/Edge" nếu `isSupported=false`). Vẽ bằng `WebGLVideoFrameRenderer` của Tango lên canvas do sink sở hữu; xoay = sự kiện `size` từ server (`AdbScrcpyVideoStream.sizeChanged`) | Decoder WebCodecs không dùng Worker/WASM → CSP hiện tại đủ; tinyh264 cần `worker-src blob:` + `'wasm-unsafe-eval'` |
| 6 | `features/device-mirror/` (Contract/VM/Screen/Root + components), `features/mirror-picker/` (chọn máy), `DeviceList` chuyển sang `features/adb-common/components/` (mẫu mới: mảnh UI dùng chung *trong một họ công cụ*, có biết domain); `autoSelect` → `domain/adb/entities/AdbDevice.ts`. Route `/mirror` → `/mirror/[serial]`. `toolRegistry`: `{ id: 'mirror', label: 'Màn hình máy', audiences: ['product'] }` | `ui/components` không được biết domain; hai picker dùng chung một danh sách máy |
| 7 | Dùng chung `ADB_ENABLED`; thêm `SCRCPY_SERVER_PATH`, `SCRCPY_SERVER_VERSION`. Thiếu jar → `notFound` với câu cài `brew install scrcpy` + biến cần đặt | Mirror vô nghĩa khi adb tắt; không sinh tiến trình mới trên host nên không cần cờ riêng |
| 8 | `node:test`: framing, normalize request, validate control, toDevicePoint, ControlOutbox, registry, use case với gateway giả, quy đổi lỗi Tango, Contract, hai ViewModel với repo/sink giả. File có `server-only` không test được → logic thuần tách ra file không có nó | Cùng cách `adbSettings.ts`/`envRules.ts` đã làm |
| 9 | **Không** ghi `AuditLog`; thêm vào dòng §11 #12 | Hàng chục lượt/ngày, mỗi lượt chỉ nói "ai vừa xem máy nào". Cần lại thì thêm `DEVICE_MIRROR_START` |

## Phase

| Phase | Nội dung | Giờ | Trạng thái |
|---|---|---|---|
| [01](phase-01-spike-tango-scrcpy-webcodecs.md) | Spike: jar → app_process → gói video về Node → 1 khung giải mã trên trình duyệt; tiêu chí dừng | 4 | GO (điều kiện: kiểm `/mirror/spike` trên trình duyệt) |
| [02](phase-02-domain-entities-ports-usecases.md) | Domain: entity, framing, cổng, registry, use case, luật ESLint, test thuần | 6 | done |
| [03](phase-03-server-adapter-session-registry-routes.md) | Data server: Tango gateway, settings, quy lỗi, `di/server`, hai Route Handler | 8 | done (máy thật 14/09) |
| [04](phase-04-browser-adapter-decoder-canvas.md) | Data trình duyệt: HTTP repo + frame reader, WebCodecs sink, `di/client` | 5 | done |
| [05](phase-05-feature-mvi-ui-routes-registry.md) | Feature MVI + Screen + picker + `adb-common` + route + `toolRegistry` | 9 | done — review xong, đã sửa (`reports/review-fixes-phase-03-05.md`); chờ kiểm UI tay |
| [06](phase-06-control-touch-keys-text-snapshot.md) | Điều khiển: chạm/cuộn/phím/gõ chữ/xoay/màn hình/chụp PNG | 8 | pending |
| [07](phase-07-hardening-csp-flags-docs.md) | Hardening: CSP thực tế, lỗi, dọn phiên, `.env.example`, `LLM.md`, `architecture.md`, kịch bản tay | 5 | pending |

Phụ thuộc: 01 → 02 → {03 ∥ 04 ∥ 05(VM bằng fake)} → 06 → 07. GitNexus index cũ (01/09) và query degraded → mỗi phase chạm symbol cũ phải `analyze --index-only` rồi `impact`, nếu vẫn `UNKNOWN`/degraded thì xác nhận bằng grep và ghi vào báo cáo.

## Phụ thuộc npm (đã kiểm chéo 13/09/2026)

`@yume-chan/adb` 2.6.4 · `@yume-chan/adb-scrcpy` 2.3.2 (cần adb ^2.3.1, scrcpy ^2.3.0) · `@yume-chan/scrcpy` 2.3.0 (có `3_3_3`, `DefaultServerPath`, `ScrcpyInstanceId`) · `@yume-chan/scrcpy-decoder-webcodecs` 2.5.3 (cần scrcpy ^2.3.0; kéo theo `scrcpy-decoder-tinyh264` ^2.1.0 nhưng chỉ dùng kiểu) · `@yume-chan/adb-server-node-tcp` 2.5.2 (cần adb ^2.5.1). Mọi khoảng caret giao nhau → cài đồng thời được. Không nâng TypeScript.

## Rủi ro hàng đầu

1. Samsung/Android 16 từ chối `app_process` hoặc Tango không nối được qua adb server → spike phát hiện; đường lùi `tunnelForward: false` (reverse) rồi mới xét bỏ.
2. `next build` không bundle được `adb-server-node-tcp` (`node:net`) → `serverExternalPackages` trong `next.config.ts`.
3. Trễ điều khiển qua POST tuần tự cảm giác "trôi" khi kéo → đo trong spike; ngưỡng đổi sang WebSocket là p95 > 100ms.
4. HMR làm mất bảng phiên → `globalThis` + kiểm tra khi khởi tạo (mẫu Prisma).
5. `requireUser()` đọc DB ở mỗi POST control (~20–30/s khi kéo) → đo; nếu đáng kể thì gộp lô thưa hơn, không bỏ `requireUser()`.

## Cần người dùng xác nhận (không trả lời thì đi theo mặc định)

1. Phạm vi **đầy đủ** hay **chỉ xem**? — mặc định: đầy đủ.
2. Nhãn menu `Màn hình máy` (mô tả: "Xem và điều khiển màn hình thiết bị Android đang cắm, ngay trong trình duyệt") — mặc định: dùng nhãn này.
3. Chụp màn hình lấy từ canvas (độ phân giải = luồng video, tức thì) hay `adb exec-out screencap -p` (độ phân giải gốc, thêm một route) — mặc định: canvas; screencap để sau.
4. Gõ chữ có dấu: dùng `setClipboard(paste=true)` một chiều host→máy (scrcpy `injectText` chỉ ASCII) — mặc định: có, và ghi rõ đây không phải đồng bộ clipboard hai chiều.
5. Chất lượng mặc định `maxSize=1440, 60fps, 8Mbps` với ba mức chọn — mặc định: giữ.
