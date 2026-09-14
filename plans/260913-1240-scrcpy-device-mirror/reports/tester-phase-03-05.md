---
title: "Báo cáo kiểm thử — Phase 03 + 04 + 05 (Mirror Server + Browser + Feature)"
date: 2026-09-14
---

# Kết quả: PASS-WITH-GAPS

Toàn bộ 308 test pass. Typecheck xanh. Lint 0 lỗi. Quy mô file tuân theo 200 dòng. Layer boundaries chính xác. **Nhưng** routes không thể test unit, nên verify toàn flow cần integration test.

---

## 1. Kết quả lệnh

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | ✅ PASS, 0 lỗi |
| `pnpm lint` | ✅ 0 lỗi, 12 warning (no-console spike script — chấp nhận) |
| `pnpm test` | ✅ **308/308 pass**, 77 suite, 1336.95ms |

---

## 2. Bảng test hiện có

### Phase 03 — Server Adapter (data/device-mirror + routes)

| File | Case | Chi tiết |
|---|---|---|
| `mirrorSettings.test.ts` | 7 | ADB disabled, SCRCPY_SERVER_PATH tìm/không tìm, version validate |
| `mirrorFailure.test.ts` | 10 | ECONNREFUSED, ENOENT, EACCES, version mismatch, device not found, unauthorized, unknown |
| `HttpMirrorRepository.test.ts` | 9 | stream: 5 (fragmented, !ok, null body, abort, failed); sendControl: 4 (batch, sessionId change, signal abort, pre-abort) |
| `stream/route.ts` | 0 | Không test unit (need Request/Response context) |
| `control/route.ts` | 0 | Không test unit (need Request/Response context) |

**Domain (phase 02, hỗ trợ):**
- `MirrorSessionRegistry.test.ts`: register, find, release, conflict
- `startMirrorSession.test.ts`: registry conflict check
- `dispatchMirrorControl.test.ts`: validation, dispatch
- `validateMirrorControlBatch.test.ts`: batch validation
- `mirrorFrameCodec.test.ts`: encoding/decoding event
- `touchMapping.test.ts`: coordinate convert
- `ControlOutbox.test.ts`: batching logic

### Phase 04 — Browser Adapter (HttpMirrorRepository, WebCodecsVideoSink)

| File | Case | Chi tiết |
|---|---|---|
| `HttpMirrorRepository.test.ts` | 9 | (gộp với phase 03 ở trên) |
| `WebCodecsVideoSink.ts` | 0 | Không test trong Node (cần `document`, `HTMLCanvasElement`, WebCodecs thật). Spike page verify sẵn ở browser. |

### Phase 05 — Feature MVI + UI

| File | Case | Chi tiết |
|---|---|---|
| `DeviceMirrorContract.test.ts` | 10 | aspectRatio (2), snapshotFileName (2), canControl (4), qualityLabel (2) |
| `DeviceMirrorViewModel.test.ts` | 10 | unsupported, meta→streaming, video→push, size, ok→stopped, lỗi khác cancelled→failed, cancelled→giữ, StreamStopped, QualityChanged, ControlToggled |
| `MirrorPickerViewModel.test.ts` | 5 | 0 máy, 1 máy auto-select, 2+ máy không đoán, MirrorOpened (chưa chọn/đã chọn) |
| Routes `/mirror/**` | 0 | Không test unit (UI integration boundary) |

---

## 3. Lỗ hổng bao phủ — P0/P1/P2

### P0 (Critical) — Không đề xuất

Không phát hiện lỗ hổng tới mức critical. Domain test bao phủ tất cả nhánh rẽ.

### P1 (High) — Routes không unit-testable

| File | Scenario | Lý do không test unit | Đề xuất |
|---|---|---|---|
| `stream/route.ts` | Signal abort → release → close idempotent | Không có `node:test` helper cho ReadableStream; `signal` logic test qua mock ở unit |  Verify thủ công: `curl` interrupt, check server log không "double close" |
| `stream/route.ts` | Iterator `done=true` nhưng request chưa abort → gửi `failed` upstream | Tango mô phỏng được, nhưng ReadableStream pull/enqueue mock phức tạp | Test qua spike gateway-check: rút cáp máy giữa lúc streaming |
| `control/route.ts` | SessionId không tồn tại → notFound | Cần registry state; route không export logic này ra | Test qua spike hoặc curl: gửi sessionId sai sau khi kết thúc stream cũ |
| `control/route.ts` | SessionId của user khác → forbidden | Cần multi-user context; không có route-level test | Test thủ công: logged in as user A, gửi control cho session của user B |

### P2 (Medium) — Có thể test nhưng hiện không

| Scenario | File | Input | Assertion mong đợi | Ghi chú |
|---|---|---|---|---|
| `tangoControl.sendOne` — text có dấu khác nhau | `tangoControl.ts` | `{type: 'text', text: 'Tiếng Việt'}` | `setClipboard` gọi với `paste=true`, không `injectText` | Đã cover via `applyControl` test ở level cao, nhưng không test từng dòng tangoControl |
| `TangoMirrorGateway.start` — `scrcpy.controller === undefined` | `TangoMirrorGateway.ts` | `control=false` → `session.control()` | Trả `err(forbidden)` | Logic bảo vệ ở line 187–189 — không unit test, chỉ domain test ở use case |
| `releaseAndClose` — gọi 3 lần liên tiếp | `stream/route.ts` | abort + pull error + cancel cùng lúc | Chỉ 1 cleanup chạy, không double-close | Logic `if (released) return` an toàn, nhưng concurrent timing khó test |
| `canExposeErrorDetail` — kind=`validation` vs `upstream` | `stream/route.ts` | Lỗi `validation` với detail vs `upstream` với detail | Chi tiết expose nếu kind=validation/conflict, không nếu upstream | Tested via mirrorFailure.ts; route chỉ gọi hàm này |

### P3 (Low) — Không bắt buộc

- WebCodecs decoder pipeline (hardware-specific, khó mô phỏng)
- Screen layout responsive test của `MirrorSurface` (UI component test)
- Network latency + batching timing (performance test)

---

## 4. Đề xuất test cần thêm (nếu muốn P1 coverage 100%)

Mỗi entry: **File, Tên case, Input, Assertion**

#### A. Cần integration/e2e (không unit được):

1. **src/app/api/adb/mirror/stream/route.ts**
   - _Case_: `abort không double-close`
   - _Input_: Gửi POST, đợi `meta` event, abort request mid-stream
   - _Assertion_: Server log không chứa "close() called twice"; `registry.release()` chỉ gọi 1 lần

2. **src/app/api/adb/mirror/stream/route.ts**
   - _Case_: `iterator done không abort → failed upstream event`
   - _Input_: Mock iterator trả `{done:true}` khi `request.signal.aborted === false`
   - _Assertion_: Client nhận sự kiện `{type: 'failed', kind: 'upstream', message: '…'}`

3. **src/app/api/adb/mirror/control/route.ts**
   - _Case_: `sessionId không tồn tại → 404`
   - _Input_: Stream kết thúc, gửi control POST với sessionId cũ
   - _Assertion_: HTTP 404, error.kind === 'notFound'

4. **src/app/api/adb/mirror/control/route.ts**
   - _Case_: `sessionId của user khác → 403`
   - _Input_: User A tạo session, User B gửi control cho session đó
   - _Assertion_: HTTP 403, error.kind === 'forbidden'

#### B. Có thể unit test (nếu refactor):

5. **src/data/device-mirror/TangoMirrorGateway.ts::start**
   - _Case_: `control=false → session.control trả forbidden`
   - _Input_: MirrorRequest `{control: false}`, gọi `session.control([...])`
   - _Assertion_: Trả `err(forbidden)`
   - _Note_: Cần tách logic "tạo session control trả forbidden nếu control=false" ra hàm riêng để unit test

6. **src/data/device-mirror/tangoControl.ts::sendOne**
   - _Case_: `text ASCII qua injectText`
   - _Input_: `{type: 'text', text: 'hello'}`
   - _Assertion_: Gọi `writer.injectText('hello')`, không gọi `setClipboard`
   - _Note_: Cần tiêm `writer` mock để verify

7. **src/data/device-mirror/tangoControl.ts::sendOne**
   - _Case_: `text non-ASCII qua setClipboard`
   - _Input_: `{type: 'text', text: 'café'}`
   - _Assertion_: Gọi `writer.setClipboard({paste: true, content: 'café'})`, không gọi `injectText`

---

## 5. Phát hiện đáng chú ý

### ✅ Tốt

1. **ControlOutbox batching chính xác**: 4 lời gọi (down, move, move, up) giảm xuống 2 fetch (down | move+up), giữ thứ tự down→move→up. Move merge đúng (chỉ giữ move cuối cùng).

2. **Error classification**: mirrorFailure.ts phủ 10 loại lỗi khác nhau, trích được version lệch từ stderr Tango.

3. **Session lifecycle**: Registry track unique serial, conflict check hoạt động, release idempotent.

4. **Mirror frame parsing**: Byte fragmentation test (cắt giữa header/payload) pass, chứng minh MirrorFrameReader robust.

5. **ViewModel intent handling**: QualityChanged/ControlToggled đúng tạo request mới với tham số mới; không setState trong loop video (60fps).

### ⚠️ Chú ý

1. **Routes không unit test**: Điều này là bình thường theo `LLM.md` §9, nhưng có nghĩa HTTP request/response path không được cover bằng node:test. Khi merge, nên chạy `curl` kiểm tay hoặc có integration test riêng.

2. **WebCodecsVideoSink không test**: Spike page verify sẵn ở browser; không test được ở Node. Khi merge feature UI, cần verify:
   - Canvas hiển thị không méo hình
   - `snapshotPng()` trả PNG mở được
   - Xoay máy → `sizeChanged` gọi, canvas resize

3. **canExposeErrorDetail boundary**: Logic route dùng hàm `canExposeErrorDetail(kind)` decide expose detail hay không. Hàm này test ở mirrorFailure.ts, nhưng route call path không test. Cần verify khi production:
   - `validation`/`conflict` error có `detail` gửi xuống client
   - `upstream` error KHÔNG gửi `detail` (chỉ ghi log server)

4. **PendingSizes queue**: TangoMirrorGateway.ts dùng mảng `pendingSizes` để queue sự kiện xoay máy xảy ra TRƯỚC route kịp gọi `onSize()`. Logic này không unit test, verify qua spike rotation test.

5. **Release idempotency**: `releaseAndClose` check `if (released) return` để tránh double-close, nhưng concurrent call từ abort + pull error + cancel đồng thời không test được ở unit level — cần verify concurrent timing qua load test hoặc thủ công interrupt liên tục.

---

## 6. Kiểm tra file size & layer boundary

### 200 dòng limit ✅

```
TangoMirrorGateway.ts        198 ✅
HttpMirrorRepository.ts      198 ✅
DeviceMirrorViewModel.ts     183 ✅
DeviceMirrorScreen.tsx       178 ✅
stream/route.ts              151 ✅
MirrorPickerScreen.tsx       130 ✅
DeviceMirrorContract.ts      125 ✅
tangoControl.ts              120 ✅
MirrorPickerViewModel.ts     111 ✅
WebCodecsVideoSink.ts        109 ✅
tangoControl.ts              120 ✅
(các file còn lại < 100)
```

### Layer boundaries ✅

- ✅ Không import `@yume-chan/*` ngoài `src/data/`
- ✅ Không import React/MUI trong ViewModel.ts
- ✅ Không import React/MUI trong domain/
- ✅ `'server-only'` dùng đúng ở TangoMirrorGateway, mirrorFailure, jarSource, tangoControl, stream route
- ✅ DeviceList di chuyển từ logcat-picker sang adb-common, khỏi violate layer boundary (adb-common có thể import domain)

---

## 7. Câu hỏi chưa giải quyết

1. **Integration test suite có sẵn không?** Report không ghi cách chạy e2e/integration. Cần xác nhận có curl script hoặc playwright suite để verify routes.

2. **Spike gateway-check.ts xoá hay giữ?** Phase-03-report đề cập chưa hoàn thành kịch bản kiểm tay do adb daemon treo. Cần xác nhận có giữ lại để người dùng chạy lại hay xoá.

3. **Production CSP config có allow streaming không?** phase-07 ghi "hardening: CSP thực tế" — cần verify streaming response (`application/octet-stream`) qua CSP hiện tại không bị block.

---

## Verdict

🟢 **PASS-WITH-GAPS**

**Tóm tắt:**
- Unit test: **308/308 pass** ✅
- Code quality: **Tuân 200 dòng, layer boundary đúng** ✅
- Domain logic: **Bao phủ chính xác** ✅
- Routes: **Không unit test (đúng pattern, nhưng cần integration verify)** ⚠️
- Features UI: **Test ViewModel/Contract, không test render** ⚠️

**Khuyến cáo trước merge:**
1. Chạy spike `gateway-check.ts RF8Y60B9NCZ` (khi adb rảnh) verify stream/control route thật.
2. Verify browser: xem hình chảy, xoay máy, đổi chất lượng, nhấn dừng.
3. Verify CSP: streaming response không bị Content Security Policy chặn.
4. Nếu cần P1 coverage 100%, thêm 4 test integration (sessionId mất, sessionId khác user, abort cleanup, iterator done).
