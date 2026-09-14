# Phase 03 — Data server: Tango gateway, settings, quy lỗi, `di/server`, hai Route Handler

**Ước lượng:** 8h (chỉ xem: 5.5h — bỏ route control, bỏ registry trong di, bỏ `tangoControl.ts`) · **Ưu tiên:** P1 · **Trạng thái:** done — xem `reports/phase-03-report.md` (kiểm tay với máy thật `RF8Y60B9NCZ` đã chạy 14/09 14:12, mục 4.5)
**File ownership:** `src/data/device-mirror/{TangoMirrorGateway,tangoControl,jarSource,mirrorSettings,mirrorFailure}.ts` + test, `src/app/api/adb/mirror/**`, `src/di/server.ts`, `.env.example`.
**Phụ thuộc:** phase 02. **Song song với:** 04, 05.

## Context Links

- Tiền lệ server: `src/data/adb/ProcessAdbShell.ts` (spawn, quy lỗi ENOENT/EACCES, triết lý vòng đời), `src/data/adb/adbSettings.ts` (cờ + đường dẫn), `src/app/api/adb/logcat/route.ts` (ReadableStream, `request.signal`, header `X-Accel-Buffering`), `src/di/server.ts`.
- `spike-report.md` — đoạn nối Tango đã chạy được + các câu lỗi thật.
- `docs/architecture.md` §3 (chỉ `validation`/`conflict` mang `detail` xuống), §6 luật 4 (cấu hình sai phải nói rõ).

## Overview

Hiện thực `MirrorDeviceGateway` bằng Tango; đọc cấu hình jar; quy mọi lỗi Tango/Node về `AppError` có câu tiếng Việt nói bước tiếp theo; nối vào `serverContainer.deviceMirror`; hai Route Handler: `POST /api/adb/mirror/stream` (luồng nhị phân, phiên sống theo request) và `POST /api/adb/mirror/control` (lô điều khiển).

## Key Insights

- **Ngoại lệ có chủ ý so với `ProcessAdbShell`:** một đối tượng Tango sống ngoài phạm vi *một* request vì trình duyệt không mở được kênh nhị phân hai chiều trên một request HTTP/1.1. Nhưng nó vẫn thuộc **đúng một request đang mở** — request stream; `finally` của route ấy `release()` + `close()`. Registry chỉ giữ tham chiếu để route control tra được. Ghi vào `LLM.md` §12 (phase 07) và một câu trong header `ProcessAdbShell.ts`.
- `globalThis.__eelMirrorSessions ??= new MirrorSessionRegistry()` trong `di/server.ts` — mẫu Prisma client trong Next dev: HMR đánh giá lại module nhưng không tạo lại Map, nên không có phiên "ma" giữ encoder của máy.
- `server-only` ném lỗi khi import dưới `tsx` → `mirrorSettings.ts`, `mirrorFailure.ts` **không** có `server-only` để test được; `TangoMirrorGateway.ts` có.
- Pull-based stream: `pull(controller)` đọc một gói từ `packets()` rồi `enqueue`; trình duyệt đọc chậm → `pull` không được gọi → reader Tango không đọc → adb socket đầy → encoder trên máy tự hạ nhịp. Không có đệm tự chế, không cần bỏ frame.
- Sự kiện `size`: đăng ký `videoStream.sizeChanged` một lần, đẩy `{ type: 'size' }` vào luồng trước gói tiếp theo (dùng một hàng đợi nhỏ trong adapter, không trong route).
- Phát hiện lệch phiên bản: `client.output` (stderr server) có dòng chứa `does not match` → `AppErrors.upstream` với message chỉ đúng biến `SCRCPY_SERVER_VERSION`. Phải đọc `output` trong `start()` vì lỗi này xuất hiện **trước** khi có socket video.

## Requirements

Chức năng:
- `mirrorSettings.ts`: `readMirrorSettings(env, exists = fs.existsSync): Result<{ jarPath; version }>` — gọi `isAdbEnabled` trước (tắt → cùng `forbidden` như adb); `SCRCPY_SERVER_PATH` trống → dò `['/opt/homebrew/share/scrcpy/scrcpy-server', '/usr/local/share/scrcpy/scrcpy-server', '/usr/share/scrcpy/scrcpy-server']`; không thấy → `notFound` "Chưa có scrcpy-server trên máy chủ. Cài `brew install scrcpy` rồi đặt SCRCPY_SERVER_PATH=/opt/homebrew/share/scrcpy/scrcpy-server trong .env."; `SCRCPY_SERVER_VERSION` mặc định `3.3.4`, phải khớp `/^\d+\.\d+(\.\d+)?$/`.
- `mirrorFailure.ts`: `describeMirrorFailure(thrown: unknown, serverOutput: readonly string[], jarPath, version): AppError` — bảng: `ECONNREFUSED` → `network` "adb server chưa chạy…"; `does not match` → `upstream` + câu đặt `SCRCPY_SERVER_VERSION=<bản đọc được từ dòng lỗi>`; `device .* not found|no devices` → `notFound`; `unauthorized` → `forbidden` (dùng lại câu của `adbCommands.commandFailure`); `AdbScrcpyExitedError` khác → `upstream` với `detail` = output; còn lại → `unknown`.
- `jarSource.ts`: `openJarStream(path): Result<ReadableStream<Uint8Array>>` (`Readable.toWeb(createReadStream)`), lỗi ENOENT/EACCES → cùng câu như trên.
- `TangoMirrorGateway.ts` (`server-only`): `constructor(shell: AdbShell, settings: () => Result<MirrorSettings>, adbPort = Number(env.ANDROID_ADB_SERVER_PORT ?? 5037))`; `start(request, signal)`: settings → `shell.run({ args: ['start-server'], timeoutMs: 10_000 })` → `AdbServerClient` → `createAdb({ serial })` → `pushServer` → `AdbScrcpyClient.start(adb, DefaultServerPath, new AdbScrcpyOptions3_3_3({ video: true, audio: false, control: request.control, tunnelForward: true, videoCodec: 'h264', maxSize, maxFps, videoBitRate: bitRateMbps*1e6, clipboardAutosync: false, scid: ScrcpyInstanceId.random(), logLevel: 'info' }, { version }))` → `await client.videoStream` → trả `MirrorDeviceSession`. `signal` huỷ giữa chừng → `close()` + `cancelled`. Mọi bước bọc `try/catch` → `describeMirrorFailure`.
- `tangoControl.ts`: `applyControl(writer: ScrcpyControlMessageWriter, size: () => { width; height }, messages)` — ánh xạ từng thông điệp (bảng ở Architecture). `text` không ASCII → `setClipboard({ sequence: 0n, paste: true, content })`.
- `di/server.ts`: `deviceMirror: { settings: () => readMirrorSettings(), gateway: new TangoMirrorGateway(adbShell, readMirrorSettings), sessions: globalRegistry() }`.
- Route `stream/route.ts`: `requireUser` → `serverContainer.adb.settings()` → `serverContainer.deviceMirror.settings()` → `normalizeMirrorRequest(body)` (400 thẳng) → `startMirrorSession` (409/404/403/502 thẳng, **trước** khi mở luồng) → `Response(ReadableStream)` `Content-Type: application/octet-stream`, `Cache-Control: no-store, no-transform`, `X-Accel-Buffering: no`. `start()`: enqueue `meta` (kèm `sessionId`, `control`); `pull()`: gói kế / `size`; `cancel()` + `request.signal` → `finally { registry.release(id); await session.close() }`; kết thúc bất thường → khung `failed` rồi `close()`.
- Route `control/route.ts`: `requireUser` → adb settings → body `{ sessionId, messages }` → `dispatchMirrorControl` → `jsonOk({ accepted })`. Không mở luồng, trả nhanh.
- `.env.example`: mục "Công cụ Màn hình máy" với hai biến, giải thích jar lấy từ brew và vì sao không đóng vào repo.

Phi chức năng: gateway < 200 dòng (tách `jarSource`, `tangoControl`); mọi `catch` quy về `AppError`; không `console.log` (chỉ `console.warn/error`).

## Architecture

```
POST /api/adb/mirror/stream ─ requireUser ─ settings ─ normalize ─ startMirrorSession
   │                                                          │  gateway.start (Tango) ─ registry.register
   └─ ReadableStream(pull) ── encodeMirrorEvent ◀── session.packets() / onSize
        request.signal / cancel ─▶ finally: release + close

POST /api/adb/mirror/control ─ requireUser ─ settings ─ dispatchMirrorControl
   └─ registry.find(id, userId) ─ validateControlBatch ─ handle.control ─ applyControl(writer)
```

Bảng ánh xạ `tangoControl.ts`:

| Domain | Tango |
|---|---|
| `touch` | `injectTouch({ action: Down/Up/Move, pointerId: BigInt(pointer), pointerX/Y: toDevicePoint(...), videoWidth/Height: size(), pressure, actionButton: 0, buttons: action==='up' ? 0 : 1 })` |
| `scroll` | `injectScroll({ pointerX/Y, videoWidth/Height, scrollX: dx, scrollY: dy, buttons: 0 })` |
| `key` | `injectKeyCode({ action: Down/Up, keyCode: MIRROR_KEYCODES[key], repeat: 0, metaState: 0 })` |
| `text` | ASCII → `injectText`; khác → `setClipboard({ sequence: 0n, paste: true, content })` |
| `backOrScreenOn` | `backOrScreenOn(Down/Up)` |
| `displayPower` | `setScreenPowerMode(on ? Normal : Off)` |
| `rotate` | `rotateDevice()` |
| `expandNotifications` | `expandNotificationPanel()` |

Kiểm lại tên trường/enum (`AndroidMotionEventAction`, `AndroidKeyEventAction`, `AndroidScreenPowerMode`) theo `spike-report.md`.

## Related Code Files

Tạo:
- `src/data/device-mirror/mirrorSettings.ts` + `mirrorSettings.test.ts`
- `src/data/device-mirror/mirrorFailure.ts` + `mirrorFailure.test.ts`
- `src/data/device-mirror/jarSource.ts`
- `src/data/device-mirror/TangoMirrorGateway.ts`
- `src/data/device-mirror/tangoControl.ts`
- `src/app/api/adb/mirror/stream/route.ts`
- `src/app/api/adb/mirror/control/route.ts`

Sửa: `src/di/server.ts`, `.env.example`.
Xoá: `src/app/api/adb/mirror/spike/route.ts` (nếu phase 01 còn để lại).

## Implementation Steps

1. **GitNexus:** `impact "serverContainer" --direction upstream` (đã thấy degraded ngày 13/09 → re-index trước; nếu vẫn degraded, `grep -rn "serverContainer\." src` và ghi danh sách 12+ route/page đang dùng vào báo cáo). Chỉ **thêm** khoá `deviceMirror`, không đổi khoá cũ.
2. `mirrorSettings.ts` + test (env giả + `exists` giả: có/không biến, dò được/không, version sai định dạng, adb tắt).
3. `mirrorFailure.ts` + test với các chuỗi lỗi thật chép từ spike (đặc biệt dòng "does not match" phải trích được số bản của server).
4. `jarSource.ts`; `TangoMirrorGateway.ts` theo Requirements; đọc `client.output` song song bằng một reader riêng, gom vào mảng ≤ 200 dòng để đưa vào `detail`.
5. `tangoControl.ts` (chỉ xem: bỏ). `handle.control(messages)` gọi `applyControl`; lỗi writer → `upstream`.
6. `di/server.ts`: thêm `deviceMirror`; hàm `globalRegistry()` dùng `globalThis` với khoá có tiền tố `__eel` và bình luận vì sao (HMR).
7. Route stream: theo Requirements; lỗi **trước** luồng trả JSON (mẫu logcat); sau khi luồng mở thì lỗi đi bằng khung `failed`.
8. Route control (chỉ xem: bỏ).
9. Chạy tay với máy thật: `curl -N -X POST … stream` thấy byte chảy; rút cáp → luồng kết thúc, `registry.bySerial` rỗng, `adb shell ps -A | grep scrcpy` không còn tiến trình.
10. `.env.example`. `pnpm typecheck && pnpm test && pnpm lint`.

## Todo List

- [x] GitNexus impact `serverContainer`, ghi kết quả
- [x] `mirrorSettings` + test
- [x] `mirrorFailure` + test (chuỗi thật từ spike)
- [x] `jarSource`, `TangoMirrorGateway`
- [x] `tangoControl` (đầy đủ)
- [x] `di/server.ts` `deviceMirror` + registry `globalThis`
- [x] Route stream: 400/403/404/409 trước luồng; `meta` đầu; `size`; `failed`; `finally` dọn
- [x] Route control (đầy đủ)
- [ ] Kịch bản tay: curl, rút cáp, đóng tab → không còn `scrcpy` trên máy — **BỊ CHẶN**: adb daemon trên máy dùng chung treo (kết nối TCP được nhưng không trả lời giao thức `host:version`), khôi phục bị chính bộ phân loại an toàn của Claude Code từ chối ("Interfere With Workloads"). Xem báo cáo.
- [x] `.env.example`; typecheck/test xanh; lint xanh cho 9 file của phase này (repo tổng đang có lỗi lint từ file WIP của phase khác, ngoài phạm vi sở hữu)

## Success Criteria

- `curl` nhận `meta` trong ≤ 2s và byte video chảy liên tục; Ctrl-C → phiên biến mất khỏi registry trong ≤ 1s và tiến trình `app_process` trên máy thoát.
- Mở luồng thứ hai cùng serial → 409 JSON với câu nói rõ máy đang được mirror.
- Đặt `SCRCPY_SERVER_VERSION=3.3.1` → lỗi nói đúng "đặt SCRCPY_SERVER_VERSION=3.3.4".
- Test thuần cho settings + failure xanh, không cần thiết bị.

## Risk Assessment

| Rủi ro | Giảm nhẹ |
|---|---|
| `client.close()` treo khi socket đã đứt | `Promise.race` với timeout 3s trong `close()`; luôn `release()` registry trước |
| `pull()` bị gọi lại trong khi lượt trước chưa xong | Giữ một promise đang đọc; `pull` trả về chính promise đó (chuẩn Streams cho phép) |
| HMR tạo gateway mới nhưng registry cũ giữ handle của module cũ | Handle không tham chiếu module; `close()` vẫn chạy được |
| Turbopack không bundle `node:net` | `serverExternalPackages` (đã kiểm ở spike) |
| `requireUser()` mỗi POST control ~20–30/s | Đo p95 trong phase 06; nếu > 5ms mỗi lượt thì tăng nhịp gộp phía adapter, **không** bỏ `requireUser` |

## Security Considerations

- Cả hai route mở đầu bằng `requireUser()`; kiểm `ADB_ENABLED`; `isSafeSerial` qua `normalizeMirrorRequest`; mọi số có trần từ enum; text ≤ 300.
- `find(id, userId)`: người khác không điều khiển được phiên không phải của mình (`forbidden`), và không biết phiên có tồn tại hay không nếu không phải chủ (trả cùng mã như `notFound` ở lớp HTTP nếu muốn — quyết định: giữ hai mã khác nhau vì `sessionId` là UUID ngẫu nhiên, không đoán được).
- `detail` chứa stderr server (tên máy, encoder) chỉ đi kèm `upstream` → không xuống trình duyệt.
- Không ghi `AuditLog` (quyết định #9).

## Next Steps

- Phase 04/05 nối vào hai route này; phase 06 mở rộng `tangoControl` nếu spike cho thấy tên trường khác; phase 07 viết `LLM.md` §12 cho ngoại lệ vòng đời.
