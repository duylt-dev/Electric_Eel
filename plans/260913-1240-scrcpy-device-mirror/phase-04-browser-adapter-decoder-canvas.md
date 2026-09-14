# Phase 04 — Data trình duyệt: HTTP repo + frame reader, WebCodecs sink, `di/client`

**Ước lượng:** 5h (chỉ xem: 4h — bỏ `sendControl` + outbox) · **Ưu tiên:** P1 · **Trạng thái:** done
**File ownership:** `src/data/device-mirror/{HttpMirrorRepository,WebCodecsVideoSink}.ts`, `src/di/client.ts`.
**Phụ thuộc:** phase 02. **Song song với:** 03, 05.

## Context Links

- Tiền lệ: `src/data/adb/HttpAdbRepository.ts` (fetch + `toAppErrorFromResponse`, lỗi trước luồng về JSON), `src/data/http/ndjson.ts` (đọc body theo mẩu), `src/data/http/httpJson.ts`.
- `docs/architecture.md` §2 "State chỉ chứa dữ liệu — không hàm, không lớp, không tham chiếu DOM".
- Tango: `WebCodecsVideoDecoder({ codec: ScrcpyVideoCodecId.H264, renderer })`, `.writable`, `.snapshot(): Promise<Blob|undefined>`, `.dispose()`, `static isSupported`; `WebGLVideoFrameRenderer(canvas?, enableCapture?)`.

## Overview

Hai adapter chạy trên trình duyệt, cùng chỗ với `HttpAdbRepository`: `HttpMirrorRepository` (mở luồng, đọc khung, gộp và gửi control) và `WebCodecsVideoSink` (giữ `VideoDecoder` + canvas — hai thứ **không được** nằm trong State). Nối vào `clientContainer.deviceMirror`.

## Key Insights

- **Decoder và canvas sống trong `data/`, không trong State, không trong component.** ViewModel chỉ gọi `deps.videoSink.push(packet)`. Canvas là tài sản của sink (`sink.canvas`), Root đưa nó xuống Screen dưới dạng prop để `MirrorSurface` gắn vào DOM. Nhờ vậy: State thuần dữ liệu (luật 7 + §2), ViewModel không import DOM (luật 4), và decoder không bị React tạo lại mỗi lần render.
- Gộp control ở adapter, không ở ViewModel: `sendControl(sessionId, message)` đẩy vào `ControlOutbox`; một vòng bơm gửi `take(64)` bằng **một** `fetch` đang bay tại một thời điểm; xong thì gửi tiếp nếu còn. Thứ tự down→move→up được giữ vì không có hai request song song. `Promise` trả về của từng `sendControl` resolve theo kết quả của lô chứa nó (đơn giản: resolve `ok` khi lô gửi xong; lỗi lô → mọi promise trong lô nhận cùng lỗi).
- `snapshotPng()` dùng `decoder.snapshot()` → `Blob` → `Uint8Array` (kiểu chung, domain không cần biết `Blob`). `snapshot()` chụp thẳng `VideoFrame` cuối qua một `OffscreenCanvas` riêng (đã đọc `video/snapshot.js`), **không** phụ thuộc renderer → không cần `enableCapture` của `WebGLVideoFrameRenderer`; chỉ cần cờ đó nếu tự đọc pixel từ canvas hiển thị (không làm).
- `isSupported` đọc một lần lúc dựng; `false` → `push` là no-op, ViewModel báo người dùng đổi trình duyệt.

## Requirements

- `HttpMirrorRepository implements MirrorRepository`:
  - `stream(request, onEvent, signal)`: `fetch('/api/adb/mirror/stream', { method: 'POST', body: JSON, headers: { Accept: 'application/octet-stream' }, cache: 'no-store', signal })`; `!response.ok` → `toAppErrorFromResponse`; đọc `response.body` bằng reader, đưa từng mẩu vào `MirrorFrameReader.push` → `onEvent` từng sự kiện; gặp `failed` → ghi nhớ và trả `err` cuối cùng (mẫu `streamLogcat`); `signal.aborted` → `cancelled`.
  - `sendControl(sessionId, message, signal)`: outbox theo `sessionId` (đổi phiên → outbox mới, bỏ cũ); vòng bơm `POST /api/adb/mirror/control` `{ sessionId, messages }` qua `httpJson`; `signal` huỷ → bỏ những gì còn trong outbox.
- `WebCodecsVideoSink implements MirrorVideoSink`: `readonly canvas: HTMLCanvasElement`, `supported`, `push` (ghi vào `decoder.writable` qua một writer giữ sẵn; lỗi ghi → `console.warn` một lần, không ném), `snapshotPng`, `dispose` (đóng writer, `decoder.dispose()`, đánh dấu `disposed` để Root tạo lại theo mẫu StrictMode của `defineViewModel.tsx`).
- `di/client.ts`: `deviceMirror: { repository: new HttpMirrorRepository(), createVideoSink: () => new WebCodecsVideoSink() }` — sink là **hàm dựng** vì mỗi màn hình cần canvas riêng (cùng lý do `translatorFor` là hàm).
- Mỗi file < 200 dòng; không import React.

## Architecture

```
ViewModel ── deps.mirror.stream(req, onEvent, signal) ──▶ HttpMirrorRepository
                                                          fetch POST /stream → MirrorFrameReader → onEvent
ViewModel ── deps.videoSink.push(packet) ──▶ WebCodecsVideoSink ── decoder.writable ── WebGL → canvas
ViewModel ── deps.mirror.sendControl(id, msg) ──▶ ControlOutbox ── bơm 1 request ──▶ POST /control
Root ── clientContainer.deviceMirror.createVideoSink() ── sink.canvas ──▶ <MirrorSurface canvas>
```

## Related Code Files

Tạo: `src/data/device-mirror/HttpMirrorRepository.ts`, `src/data/device-mirror/WebCodecsVideoSink.ts`.
Sửa: `src/di/client.ts`.
Xoá: `src/app/(app)/mirror/spike/page.tsx` (nếu phase 01 còn để lại).

## Implementation Steps

1. **GitNexus:** `impact "clientContainer" --direction upstream` (re-index trước; degraded → `grep -rn "clientContainer\." src`). Chỉ thêm khoá `deviceMirror`.
2. `HttpMirrorRepository.stream` theo mẫu `streamLogcat`; reader binary thay `readNdjson`.
3. `sendControl` + vòng bơm dùng `ControlOutbox` (chỉ xem: bỏ, cổng vẫn khai để VM biên dịch — hoặc tách `MirrorControlSender` thành cổng riêng nếu muốn view-only không có phương thức thừa; quyết định: tách cổng `MirrorControlSender` nếu chọn chỉ xem, giữ chung nếu đầy đủ).
4. `WebCodecsVideoSink` theo Requirements; canvas tạo bằng `document.createElement('canvas')`, không style (Screen lo).
5. `di/client.ts`.
6. Kiểm tay với route thật của phase 03 hoặc route spike: một trang tạm gọi `repository.stream` + `sink.push` → thấy hình. Xoá trang tạm.
7. `pnpm typecheck && pnpm lint`.

## Todo List

- [x] GitNexus impact `clientContainer`
- [x] `HttpMirrorRepository.stream` với `MirrorFrameReader`
- [x] `sendControl` + bơm tuần tự (đầy đủ)
- [x] `WebCodecsVideoSink` (canvas, decoder, snapshot, dispose, supported)
- [x] `di/client.ts` `deviceMirror`
- [ ] Kiểm tay thấy hình; xoá mã tạm — BỎ theo quyết định điều phối (xem báo cáo phase-04-report.md §"Khác biệt"); không tạo trang tạm, không xoá `mirror/spike`, để phase 05 kiểm bằng UI thật
- [x] typecheck/lint xanh (file của phase 04; lỗi typecheck còn lại thuộc `TangoMirrorGateway.ts` của phase 03, đang làm song song)

## Success Criteria

- Trang thử thấy hình chuyển động; đóng tab → request stream bị huỷ (Network tab), server dọn phiên.
- `snapshotPng()` trả PNG mở được, không phải ảnh đen.
- Không import Tango ở ngoài `src/data/**` (ESLint phase 02 chặn).

## Risk Assessment

| Rủi ro | Giảm nhẹ |
|---|---|
| `decoder.writable` nhận `ScrcpyMediaStreamPacket` với `pts: bigint`, khớp `MirrorVideoPacket`? | Ánh xạ một hàm nhỏ `toTangoPacket`; test kiểu qua `tsc` |
| Khung `config` đến sau khi decoder đã configure (xoay) | Tango tự reconfigure theo config packet mới; kiểm ở phase 06 bước xoay |
| `snapshot()` trả `undefined` khi chưa có khung | `snapshotPng` → `err(validation('Chưa có khung hình nào để chụp.'))` |

## Security Considerations

- Trình duyệt chỉ gọi hai route cùng gốc (`connect-src 'self'`); không WebSocket, không worker → CSP không đổi.
- Không lưu gì vào storage; `sessionId` chỉ sống trong bộ nhớ của tab.

## Next Steps

- Phase 05 dùng `clientContainer.deviceMirror`; phase 06 dùng `sendControl`; phase 07 kiểm CSP thật trên `pnpm build && pnpm start`.
