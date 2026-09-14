---
title: "Code review phase 03 + 04 + 05 — Màn hình máy (scrcpy mirror)"
date: 2026-09-14
reviewer: code-reviewer
verdict: REQUEST-CHANGES
---

# Tóm tắt

1. Kiến trúc đúng hợp đồng: layer sạch (`@yume-chan/*` chỉ trong `data/`, `features/` không import `data/`, `server-only` đúng chỗ), MVI đúng luật, framing nhị phân hai đầu khớp nhau, `detail` lọc đúng ở cả `jsonError` lẫn khung `failed`, `requireUser()` + owner check đủ ở hai route.
2. **Hai lỗi High làm tính năng không chạy được đúng trên `next dev`** (môi trường triển khai chính của tool này): luồng mở trong `onStart` **không bao giờ bị huỷ** bởi Dừng / Chạy lại / Đổi chất lượng / Bật điều khiển (đã tái hiện bằng test) → sau "Dừng" video vẫn chảy, "Chạy lại" nhận 409; và `useState(() => createViewModel())` trong `defineViewModel.Provider` bị StrictMode gọi hai lần → một ViewModel "mồ côi" giữ luôn phiên mirror của máy → 409 ngay lần mount đầu.
3. **Một rò tài nguyên High ở server**: `TangoMirrorGateway` không bao giờ `adb.close()` → mỗi phiên để lại một kết nối TCP `wait-for-disconnect` tới adb server (5037) sống tới khi rút cáp; đổi chất lượng = phiên mới = thêm một kết nối.
4. Cả ba lỗi trên đều nằm ngoài tầm phát hiện của bộ test hiện có (fake repo kết thúc ngay nên không kiểm được "luồng cũ đã bị huỷ"; không có test render).
5. Chưa ai nhìn thấy hình bằng mắt ở cả ba phase (03 chặn vì adb treo, 04 bỏ, 05 không có tài khoản) — hai lỗi High dự đoán lần chạy tay đầu tiên sẽ thấy "Thiết bị đang có một phiên mirror khác đang chạy".

**Verdict: REQUEST-CHANGES.** Sửa 3 mục High (H1–H3) rồi chạy tay theo §"Câu hỏi" trước khi merge. Các mục Medium/Low có thể gom vào phase 07.

Mã đã đọc: toàn bộ danh sách trong nhiệm vụ + `domain/device-mirror/**` (ngữ cảnh) + `core/mvi/*` + nguồn Tango trong `node_modules/@yume-chan/{adb,adb-scrcpy,scrcpy-decoder-webcodecs}` để xác minh vòng đời. GitNexus CLI `impact` lỗi (LadybugDB version 43 vs 42) — đối chiếu bằng grep, ghi rõ tại từng mục.

---

# Critical

Không có phát hiện mức Critical (không lộ bí mật, không mất dữ liệu, không leo quyền).

---

# High

## H1. Luồng mở trong `onStart` không bị intent cùng khoá huỷ → Dừng / Chạy lại / Đổi chất lượng hỏng

**Vị trí:** `src/core/mvi/createViewModel.ts:54,129-132` (gốc); biểu hiện ở `src/features/device-mirror/DeviceMirrorViewModel.ts:105-116,118-124`.

**Vấn đề:** `run(null, onStart)` tính `key = intent !== null ? intentKey(intent) : undefined` → job `onStart` **không được ghi vào `running`**. `StreamStopped`/`QualityChanged`/`ControlToggled`/`StreamRequested` (khoá `'stream'`) chỉ huỷ `running.get('stream')` — rỗng. Đã tái hiện bằng `createViewModel(DeviceMirrorViewModel.definition, fakes)`:

```
onStart signal aborted after StreamStopped = false
streams opened = 2 ; first still alive = true
```

**Hậu quả với server thật:** bấm "Dừng" → state `stopped` nhưng fetch `/stream` của `onStart` vẫn mở, `onEvent` vẫn `push` khung vào sink (canvas tiếp tục chuyển động), phiên scrcpy trên máy vẫn chạy. Bấm "Chạy lại"/đổi chất lượng → request thứ hai cùng serial → `startMirrorSession` trả `conflict` 409 → status `failed`. Cùng lỗi tiềm ẩn ở `AdbLogcatViewModel.ts:132` (Dừng logcat không dừng tiến trình trên server) và hai picker (`loadDevices` chạy song song với `DevicesRefreshRequested`).

**Vì sao test không bắt:** `DeviceMirrorViewModel.test.ts:194-236` cho luồng đầu `outcome: ok(undefined)` — kết thúc trước khi intent tới, nên không kiểm được tính chất "luồng cũ phải bị huỷ".

**Đề xuất (sửa ở core, 1 trường + 1 dòng, chữa cả 4 ViewModel):**

```ts
// src/core/mvi/types.ts — thêm vào ViewModelDefinition
/** Khoá của job `onStart`, để intent cùng khoá huỷ được nó (luồng mở lúc khởi động). */
readonly startKey?: string

// src/core/mvi/createViewModel.ts
const run = (intent: I | null, body: ..., keyOverride?: string): void => {
  ...
  const key = intent !== null ? definition.intentKey?.(intent) : keyOverride
  ...
}
// dòng 131
run(null, (ctx) => onStart(ctx, deps), definition.startKey)

// DeviceMirrorViewModel.ts (và AdbLogcatViewModel.ts): thêm
startKey: STREAM_KEY,
```

**Test hồi quy (thêm vào `DeviceMirrorViewModel.test.ts`):** fake ghi lại `signal` của từng lượt `stream()`, luồng đầu `outcome: 'pending'`; sau `StreamStopped` assert `signals[0].aborted === true`; sau `QualityChanged` assert `signals[0].aborted && requests.length === 2`.

## H2. `defineViewModel.Provider` tạo ViewModel trong `useState(() => …)` → StrictMode (dev) tạo hai ViewModel, một cái mồ côi giữ phiên mirror

**Vị trí:** `src/core/mvi/defineViewModel.tsx:62` (gốc); `next.config.ts` `reactStrictMode: true`; nạn nhân: `src/features/device-mirror/DeviceMirrorRoot.tsx:69`.

**Vấn đề:** React docs (`useState`): *"In Strict Mode, React will call your initializer function twice… The result from one of the calls will be ignored"* (dev-only). `createViewModel` **có side effect** (chạy `onStart` → `fetch('/api/adb/mirror/stream')`). Kết quả bị bỏ vẫn đã mở luồng, không ai giữ tham chiếu để `dispose()`. Trình tự thật ở dev: VM#1 và VM#1' cùng mở `/stream` cho một serial → một cái thắng `register()`, cái kia bị `close()`; effect StrictMode gỡ → `dispose()` VM#1 → gắn lại → VM#3 (`setInstance`). Nếu VM#1' (mồ côi, không bao giờ bị huỷ) là cái thắng → VM#3 nhận **409** → màn hình "hỏng" ngay lần mount đầu, và máy bị giữ cho tới khi tải lại trang. Logcat có cùng lỗi (mỗi lần mount ở dev để lại một tiến trình `adb logcat` mồ côi) nhưng không lộ vì logcat không độc quyền thiết bị.

Tool này chạy **chính** trên `next dev` (plan: "Máy chủ thực tế = máy dev"), nên "dev-only" ở đây là "luôn luôn".

**Đề xuất:** tách *dựng* (thuần) khỏi *khởi động* (side effect) — `createViewModel` nhận tuỳ chọn `autoStart`, Provider gọi `start()` trong effect (nơi đã có sẵn cơ chế gỡ/gắn lại):

```ts
// createViewModel.ts
export function createViewModel<S,I,E,D>(definition, deps, options: { autoStart?: boolean } = {}) {
  ...
  let started = false
  const instance = {
    ...,
    start() {
      if (started || disposed) return
      started = true
      if (definition.onStart) run(null, (ctx) => definition.onStart!(ctx, deps), definition.startKey)
    },
  }
  if (options.autoStart !== false) instance.start()   // test và mã cũ giữ hành vi hiện tại
  return instance
}

// defineViewModel.tsx — Provider
const [instance, setInstance] = useState(() => createViewModel(definition, resolveDeps(deps), { autoStart: false }))
useEffect(() => {
  if (instance.isDisposed) { setInstance(createViewModel(definition, resolveDeps(deps), { autoStart: false })); return }
  instance.start()
  return () => instance.dispose()
}, [instance])
```

Instance bị StrictMode bỏ đi khi đó chỉ là một store Zustand rỗng → GC. Cần thêm `start()` và `startKey` vào `ViewModelInstance`/`ViewModelDefinition` ở `types.ts`. Grep người gọi `createViewModel`: `defineViewModel.tsx` + 3 file test (giữ `autoStart` mặc định `true` nên test không đổi).

## H3. `TangoMirrorGateway` không đóng `Adb`/`AdbServerTransport` → rò một kết nối TCP tới adb server cho mỗi phiên

**Vị trí:** `src/data/device-mirror/TangoMirrorGateway.ts:102-104,164-172`.

**Vấn đề:** `AdbServerClient.createTransport()` (Tango, `node_modules/@yume-chan/adb/esm/server/client.js:366-379`) mở **một kết nối `host:…wait-for-any-disconnect` giữ mở** cho tới khi máy rớt **hoặc `transport.close()`** được gọi (`transport.js` `#closed` → race → abort watcher). `AdbScrcpyClient.close()` chỉ `process.kill()` (đóng socket shell) — **không** đóng transport. Gateway không bao giờ gọi `adb.close()`. Mỗi lần mở phiên (kể cả mỗi lần đổi chất lượng, mỗi request thua cuộc 409 bị `close()`) để lại một socket `127.0.0.1:5037` (`unref`, nên không giữ tiến trình sống, nhưng fd không trả). Cùng lỗi ở nhánh `openJarStream` hỏng (dòng 107 `return` sau khi đã `createAdb`) và mọi nhánh `catch`.

**Đề xuất:**

```ts
// TangoMirrorGateway.ts — trong start(), giữ `adb` ở scope ngoài try
let adb: Adb | undefined
let scrcpy: AdbScrcpyClient | undefined
try {
  adb = await client.createAdb({ serial: request.serial })
  ...
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await Promise.race([
      // Đóng scrcpy (kill app_process) RỒI transport (đóng mọi socket + huỷ watcher wait-for-disconnect).
      scrcpy!.close().catch(() => undefined).then(() => adb!.close()).catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS)),
    ])
  }
} catch (thrown) {
  await Promise.allSettled([scrcpy?.close(), adb?.close()])   // dọn cả khi hỏng giữa đường
  return err(describeMirrorFailure(...))
}
```

Kiểm chứng: `lsof -nP -p <pid next> | grep ':5037' | wc -l` trước/sau 5 lần đổi chất lượng — phải không tăng.

---

# Medium

## M1. `TangoMirrorGateway.start()` không có trần thời gian và không nghe `signal` trong bốn `await` Tango

**Vị trí:** `TangoMirrorGateway.ts:104,108,130,137`.

`createAdb` / `pushServer` / `AdbScrcpyClient.start` / `await scrcpy.videoStream` có thể treo vô hạn (máy treo, Samsung từ chối `app_process` mà không thoát — rủi ro #1 của plan). `signal` chỉ được đọc **sau** `videoStream` (dòng 140). Trình duyệt đóng tab lúc "Đang nối…" → `request.signal` huỷ nhưng `start()` vẫn chờ → route handler treo, scrcpy + transport không ai đóng. `shell.run` có `timeoutMs: 10_000`, các bước Tango thì không.

**Đề xuất:** một helper nhỏ trong file (hoặc `core/util`):

```ts
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(AppErrors.network(`scrcpy-server không trả lời sau ${timeoutMs / 1000}s.`)), timeoutMs)
    const onAbort = () => reject(AppErrors.cancelled('Đã huỷ.'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => { clearTimeout(timer); signal.removeEventListener('abort', onAbort) })
  })
}
// dùng: const videoStream = await raceAbort(scrcpy.videoStream, signal, 15_000)
```

Kết hợp H3 để nhánh `catch` dọn sạch. `describeMirrorFailure` cần nhận `AppError` ném ra (đã có `isAppError` trong `toAppError` — hoặc kiểm `isAppError(thrown)` ở đầu hàm).

## M2. `HttpMirrorRepository.stream()` không `cancel()` body khi tự dừng vì lỗi giải mã → phiên server sống tới khi ViewModel dispose

**Vị trí:** `src/data/device-mirror/HttpMirrorRepository.ts:72-78,88-90`.

Nhánh `frameReader.push` ném → `return err(upstream)` nhưng chỉ `releaseLock()`, không `reader.cancel()` → kết nối HTTP vẫn mở, server `pull()` bị backpressure treo → phiên scrcpy sống tới khi `ctx.signal` huỷ (chỉ khi dispose/đổi luồng). Và nhánh ấy **chạm được**: `MirrorFrameReader.push` ném `RangeError` khi `len === 0` (đã chạy thử: `push(new Uint8Array([0,0,0,0]))` → "Offset is outside the bounds of the DataView"), trái với phase-04-report §4 ("không bao giờ ném").

**Đề xuất:**

```ts
} catch (thrown) {
  await reader.cancel().catch(() => undefined)   // báo server dừng ngay, không đợi signal
  return err(AppErrors.upstream('Không giải mã được dữ liệu video từ máy chủ.', { cause: thrown }))
}
```

Và ở domain (`mirrorFrameCodec.ts:110`): `if (len < 1) { events.push(failedEvent('Khung rỗng.')); this.buffer = new Uint8Array(0); break }`.

## M3. Decoder hỏng giữa phiên → UI vẫn "đang chảy", canvas đứng hình, không ai được báo

**Vị trí:** `src/data/device-mirror/WebCodecsVideoSink.ts:60-67`.

`WebCodecsVideoDecoder` khi `VideoDecoder` lỗi (profile H.264 không hỗ trợ, GPU reset) gọi `controller.error()` → mọi `writer.write()` sau đó reject → sink `console.warn` **một lần** rồi nuốt. ViewModel không biết, state vẫn `streaming`. Người dùng thấy ảnh đứng, không có nút nào làm gì.

**Đề xuất:** cho sink báo lỗi qua cổng — thêm vào `MirrorVideoSink` (domain, phase 02 — thay đổi cổng nhỏ, có lý do):

```ts
/** Lỗi giải mã không hồi phục được — ViewModel đọc để chuyển `failed`. */
onError(listener: (error: AppError) => void): () => void
```

Sink: trong `.catch` của `write` gọi listener với `AppErrors.upstream('Trình duyệt không giải mã được luồng video…')`. VM `stream()`: đăng ký trước khi mở luồng, khi nhận → `setState failed` + `ShowMessage`, và huỷ luồng bằng cách… (không có cách huỷ từ trong handler ngoài `ctx.signal`) → đơn giản: lưu lỗi vào state `error` + `status: 'failed'`, để người dùng bấm "Chạy lại" (intent cùng khoá huỷ luồng cũ — sau khi H1 sửa).

## M4. Đổi chất lượng nối lại ngay có thể nhận 409 vì server chưa kịp xử lý abort của luồng cũ

**Vị trí:** `DeviceMirrorViewModel.ts:138-141` ↔ `src/app/api/adb/mirror/stream/route.ts:66` ↔ `domain/device-mirror/usecases/startMirrorSession.ts:36-39`.

Trình duyệt huỷ fetch cũ và mở fetch mới trong cùng một tick; trên hai socket TCP khác nhau. Node có thể nhận request mới **trước** sự kiện `close` của socket cũ → `bySerial` còn entry → `conflict`. `requireUser()` (đọc DB) ở đầu route thường đủ chậm để che khe này, nhưng không có gì bảo đảm. Sau khi H1 sửa xong, đây là chỗ hỏng kế tiếp của kịch bản "đổi chất lượng".

**Đề xuất (chọn một):**
- (a) Server: trong `startMirrorSession`, nếu `existing.userId === userId` thì **tiếp quản**: `registry.release(existing.id); await existing.handle.close()` rồi mở phiên mới. Cùng người dùng tự đổi luồng của mình là hợp lệ; người khác vẫn 409. Cần thêm test use case.
- (b) Client: `DeviceMirrorViewModel.stream()` thử lại một lần sau 300ms khi `outcome.error.kind === 'conflict'` và `ctx.signal` chưa huỷ.

Khuyến nghị (a): đúng nghiệp vụ hơn, và chữa luôn trường hợp tab cũ chết mà server chưa nhận ra.

## M5. `ControlToggled` / `QualityChanged` luôn mở luồng, kể cả khi đang `stopped`/`failed`/`unsupported`

**Vị trí:** `DeviceMirrorViewModel.ts:138-148`; `DeviceMirrorScreen.tsx:142-156`.

Người dùng đã bấm Dừng, gạt "Cho phép điều khiển" → luồng tự chạy lại. `unsupported` → gạt công tắc → `stream()` chạy, `push` no-op → status `streaming` trên canvas đen. `QualityBar` chỉ `disabled` khi `connecting`.

**Đề xuất:**

```ts
case 'QualityChanged':
  ctx.setState((s) => ({ ...s, quality: intent.quality }))
  if (isLive(ctx.getState())) await stream(ctx, deps)   // đang dừng thì chỉ ghi nhớ, Chạy lại sẽ dùng
  return
case 'ControlToggled':
  ctx.setState((s) => ({ ...s, controlEnabled: intent.enabled }))
  if (isLive(ctx.getState())) await stream(ctx, deps)
  return
```

Screen: `disabled={state.status === 'connecting' || state.status === 'unsupported'}` cho cả Switch và QualityBar; Switch thêm hint "Đổi sẽ nối lại luồng" (luật `helperText` nói hậu quả — `FormControlLabel` không có `helperText`, dùng `<FormHelperText>` bên dưới).

## M6. `MirrorSurface` — tỉ lệ canvas phụ thuộc cách CSS "transfer" `aspect-ratio` qua `max-height`; chưa ai kiểm bằng mắt

**Vị trí:** `src/features/device-mirror/components/MirrorSurface.tsx:51-67`.

Div cha `width: fit-content` → div canvas `aspectRatio` + `maxHeight` + không có `width/height` tường minh; canvas `width:100%;height:100%`. Kết quả đúng chỉ khi trình duyệt chuyển ràng buộc `max-height` ngược qua `aspect-ratio` để thu `width` (CSS Sizing 4 "transferred size" — Chromium làm đúng, nhưng phụ thuộc `width: auto` trong ngữ cảnh shrink-to-fit). Nếu không transfer → canvas bị kéo méo (648×700 cho khung 720×1440). Không cần `frameSize` để layout: `WebGLVideoFrameRenderer.setSize` đã đặt `canvas.width/height` (`render/canvas.js:15-18`) → canvas có kích cỡ nội tại như `<img>`.

**Đề xuất (bền hơn, ít mã hơn):**

```ts
<Box ref={attachCanvas} sx={{
  backgroundColor: m3('surfaceContainerLowest'), borderRadius: `${m3Shape.large}px`, overflow: 'hidden',
  cursor: live ? 'crosshair' : 'default',
  // Canvas có width/height nội tại (renderer đặt) → max-* giữ tỉ lệ như <img>, không cần aspect-ratio.
  '& canvas': { display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: 'calc(100dvh - 240px)' },
}} />
```

Bỏ prop `aspect` (giữ `aspectRatio()` trong Contract cho MetaChip nếu muốn). Phase 06 lấy toạ độ chuẩn hoá từ `canvas.getBoundingClientRect()` thay vì Box.

## M7. `validateControlBatch` xử lý `text` trước khi kiểm độ dài

**Vị trí:** `src/domain/device-mirror/entities/validateMirrorControlBatch.ts:103-110`.

`stripControlChars` duyệt từng ký tự **trước** khi so `MAX_TEXT_LENGTH` → một `text` 10 MB (đã đăng nhập) tốn CPU tuyến tính rồi mới bị từ chối; 10 MB ký tự điều khiển thì strip về rỗng và **qua** kiểm. Thêm một dòng: `if (raw.text.length > MAX_TEXT_LENGTH * 4) return err(validation(...))` trước `strip` (×4 để chừa ký tự điều khiển hợp lệ bị bỏ).

---

# Low / Nit

| # | Vị trí | Vấn đề | Đề xuất |
|---|---|---|---|
| L1 | `mirrorFailure.ts:61`, `jarSource.ts:30` | `jarPath` (đường dẫn hệ thống tệp máy chủ) nằm trong **`message`** của `forbidden` → xuống trình duyệt. Trái luật "chi tiết hạ tầng ở `detail`" (`architecture.md` §3) | `AppErrors.forbidden('Máy chủ không có quyền đọc scrcpy-server. Báo người quản trị kiểm tra SCRCPY_SERVER_PATH.', { detail: jarPath })` |
| L2 | `mirrorSettings.ts:60` | `existsSync` đúng với cả thư mục (`SCRCPY_SERVER_PATH=/`) → lỗi `EISDIR` mơ hồ lúc `pushServer` | `statSync(p, { throwIfNoEntry: false })?.isFile()`; cho `exists` giả trong test cùng chữ ký |
| L3 | `stream/route.ts:86-92,96-99` | `onSize` trả hàm huỷ đăng ký nhưng bị bỏ; nhánh `signal.aborted` trong `pull` `close()` mà không `releaseAndClose()` (hiện an toàn nhờ listener `abort` ở dòng 66, nhưng phòng thủ nên có) | lưu `unsubscribe`, gọi trong `releaseAndClose`; thêm `await releaseAndClose()` ở nhánh đó; gọi `iterator?.return?.()` trong `releaseAndClose` để `iteratePackets` chạy `finally` → `releaseLock` |
| L4 | `tangoControl.ts:110-120` | Hai POST `/control` tới đồng thời (client lỗi/độc) xen kẽ `write` giữa hai lô; plan hứa "lỗi writer → `upstream`" nhưng `attemptAsync` trả `unknown` (500) | nối chuỗi promise theo phiên: `this.controlQueue = this.controlQueue.then(() => applyControl(...))`; `mapError` sang `upstream` |
| L5 | `HttpMirrorRepository.ts:128-141` | Giả định "`sendControl` gọi lại với CÙNG signal" không khớp VM: intent điều khiển **không có khoá** → mỗi intent một `ctx.signal` mới → `bindAbort` gắn listener mới mỗi lần, và một intent cũ huỷ (dispose) thay `outbox`. Chưa lộ vì phase 06 chưa gọi | Phase 06: hoặc VM truyền `rootSignal` (thêm vào `IntentContext`), hoặc repository bỏ `bindAbort`, chỉ kiểm `signal.aborted` lúc `push` |
| L6 | `WebCodecsVideoSink.ts:62` | `push` không có backpressure ở trình duyệt (`write` không `await`); Tango `write` đồng bộ → `VideoDecoder.decodeQueueSize` phình nếu máy yếu | Phase 07: đo `decodeQueueSize`; nếu > N thì bỏ frame tới keyframe kế; hoặc `push(): Promise<void>` + `await onEvent()` trong repository |
| L7 | `MirrorSurface.tsx:77,82` | `rgba(0,0,0,0.35)` và `#fff` — mã màu thẳng trong component (`architecture.md` §5) | `backgroundColor: \`color-mix(in srgb, ${m3('scrim')} 35%, transparent)\``, `color: m3('inverseOnSurface')` |
| L8 | `QualityBar.tsx:41-96` | Ba khối `FormControl` giống nhau 95% | một mảng `{ id, label, values, format, hint, pick }` + `map` — ~40 dòng thay 55 |
| L9 | `DeviceMirrorViewModel.ts:34` | `connecting` không xoá `sessionId`/`frameSize` cũ → MetaChip hiện kích cỡ phiên trước vài giây | `{ ...state, status: 'connecting', error: null, sessionId: null }` |
| L10 | `mirror/[serial]/page.tsx:17,48` | `decodeURIComponent` ném `URIError` với `%E0%A4%A` → 500 (cùng lỗi ở `logcat/[package]/page.tsx`) | bọc `try` → coi như không hợp lệ |
| L11 | `TangoMirrorGateway.ts:195` | `capOutputLines(outputLines)` thừa — `drainOutput` đã cap ở dòng 44 | bỏ một trong hai |
| L12 | `lib/api/response.ts:57` | `jsonError` vẫn dùng `KINDS_WITH_PUBLIC_DETAIL.has` thay vì `canExposeErrorDetail` vừa export | dùng hàm để "một luật" đúng nghĩa đen |
| L13 | `TangoMirrorGateway.ts` 198 dòng, `HttpMirrorRepository.ts` 198 dòng | Sát trần 200; H3/M1/M2 sẽ vượt | tách `tangoSession.ts` (dựng `MirrorDeviceSession` từ `scrcpy`+`adb`) và `MirrorControlPump.ts` (outbox + bơm) |
| L14 | `MirrorPickerViewModel.ts:73-81` | Bình luận "MirrorOpened chia khoá không mất gì" — thật ra nó **huỷ** một lượt `DevicesRefreshRequested` đang bay | sửa câu, hoặc `intentKey` trả `undefined` cho `MirrorOpened` |
| L15 | `mirrorFailure.ts:79-84` | `/unauthorized/i` trên `thrown.message` chung chung có thể bắt nhầm câu lỗi khác | giới hạn vào `output` + tên lỗi Tango cụ thể nếu spike đã ghi |

---

# Khuyến nghị cho `DeviceMirrorRoot.tsx`

**Hiện tại** (`DeviceMirrorRoot.tsx:49-73`): `useState(null)` + `useEffect` dựng sink + `Promise.resolve().then(setSink)` + render `null` tới khi có sink.

Đúng về SSR và StrictMode (cờ `cancelled` làm việc), lint sạch — nhưng: (1) microtask là cách **né** luật, không phải cách luật muốn (luật muốn nói "giá trị này không phải state"); (2) trang trắng một lượt: `PageHeader` của màn không có trong HTML SSR lẫn frame đầu; (3) `setState` chỉ để "ép render lại vì tài nguyên đã có" là dấu hiệu tài nguyên đang ở nhầm chỗ.

**Đối chiếu các lựa chọn:**

| Cách | SSR (`document`) | StrictMode | Lint | Trắng frame đầu | Nhận xét |
|---|---|---|---|---|---|
| A. Hiện tại | ✓ | ✓ | ✓ (né) | có | ổn nhưng khó giải thích |
| B. `useSyncExternalStore` | ✓ | ✓ | ✓ | có | không có "store ngoài" thật để subscribe — gượng ép |
| C. `useRef` + `useLayoutEffect` | ✓ | ✓ | ✗ (vẫn cần setState để render) | có | không hơn A |
| D. `dynamic(…, { ssr:false })` + `useState(() => createVideoSink())` | ✓ | **✗** initializer gọi 2 lần → 1 sink mồ côi (WebGL ctx + VideoDecoder) mỗi mount | ✓ | có (loading) | Next 15+ cấm `ssr:false` trong Server Component → thêm file bọc |
| E. Sink dựng lười trong ViewModel qua factory | ✓ | ✓ | ✓ | không | canvas phải về DOM qua Screen → hoặc Effect mang DOM node (vi phạm "Effect thuần dữ liệu") hoặc VM chạm DOM (luật 4) — **loại** |
| **F. Sink lười: constructor không chạm DOM, `attach(container)` tạo canvas/decoder khi gắn, `dispose()` trả tài nguyên nhưng `attach` lại được** | ✓ (constructor thuần; `isSupported` = `typeof globalThis.VideoDecoder`, an toàn trên Node) | ✓ (instance thừa không giữ gì) | ✓ (không setState) | **không** | chọn |

**Khuyến nghị dứt khoát: F.**

```ts
// data/device-mirror/WebCodecsVideoSink.ts (phác)
export class WebCodecsVideoSink implements MirrorVideoSink {
  readonly supported = WebCodecsVideoDecoder.isSupported   // chỉ đọc typeof global → SSR trả false, client trả đúng
  private canvas: HTMLCanvasElement | null = null
  private decoder: WebCodecsVideoDecoder | null = null
  private writer: WritableStreamDefaultWriter<ScrcpyMediaStreamPacket> | null = null

  /** Gắn vào DOM. Gọi lại sau `dispose()` là hợp lệ — StrictMode gỡ/gắn dùng đúng đường này. */
  attach(container: HTMLElement): void {
    if (!this.supported) return
    if (this.decoder === null) {
      this.canvas = document.createElement('canvas')
      this.decoder = new WebCodecsVideoDecoder({ codec: ScrcpyVideoCodecId.H264, renderer: new WebGLVideoFrameRenderer(this.canvas) })
      this.writer = this.decoder.writable.getWriter()
    }
    if (this.canvas!.parentElement !== container) container.appendChild(this.canvas!)
  }
  push(packet) { this.writer?.write(toTangoPacket(packet)).catch(...) }
  dispose(): void { this.writer?.releaseLock(); this.decoder?.dispose(); this.canvas?.remove(); this.decoder = this.writer = this.canvas = null }
}

// DeviceMirrorRoot.tsx
export function DeviceMirrorRoot({ serial }: DeviceMirrorRootProps) {
  const [sink] = useState(() => clientContainer.deviceMirror.createVideoSink())   // thuần, không DOM → an toàn SSR + StrictMode
  useEffect(() => () => sink.dispose(), [sink])                                    // StrictMode gỡ → dispose; gắn lại → attach() tự dựng lại
  return (
    <DeviceMirrorViewModel.Provider deps={deviceMirrorDeps(serial, sink)}>
      <DeviceMirrorScreen attachSurface={(el) => el && sink.attach(el)} />
    </DeviceMirrorViewModel.Provider>
  )
}
// MirrorSurface: prop `attach: (el: HTMLDivElement | null) => void` → <Box ref={attach} …/>
```

Lợi: bỏ hẳn `null` gate, bỏ microtask, `PageHeader` SSR được, không import `data/` (kiểu vẫn qua `ReturnType`). `MirrorVideoSink` (domain) không đổi — `attach` là API của lớp cụ thể, Root là mép nối nên biết được. Chi phí: ~30 dòng sink, −20 dòng Root, đổi 1 prop. Lưu ý: F **không** chữa H2 (VM vẫn dựng trong Provider) — H2 sửa ở core.

Nếu giữ A: chấp nhận được, nhưng đổi bình luận dòng 32-41 thành thẳng thắn "đây là cách né luật; xem F để sửa đúng" thay vì biện luận luật sai.

---

# Lệch giữa báo cáo dev và mã

| # | Báo cáo nói | Mã thật | Mức |
|---|---|---|---|
| 1 | phase-05 §6/§7: `StreamStopped → stopped`, `QualityChanged → mở lại` "xanh" | Test đúng nhưng không kiểm luồng cũ bị huỷ; thực tế **không** bị huỷ (H1) | High |
| 2 | phase-05 §7.1: Root "StrictMode-safe" | Đúng cho sink; Provider bên trong vẫn tạo VM mồ côi (H2, lỗi core) | High |
| 3 | phase-03 §5 / plan Risk: "`close()` … luôn `release()` trước" — không nói tới transport adb | `adb.close()` không bao giờ được gọi (H3) | High |
| 4 | phase-04 §4: "`decodeMessage()` không bao giờ ném … nhánh catch không thể chạm tới" | `MirrorFrameReader.push` ném `RangeError` khi `len === 0` (đã chạy thử) | Medium (M2) |
| 5 | phase-04 §"Ghi chú cho phase 05": `sendControl(…, ctx.signal)` "cùng signal của phiên" | Intent điều khiển không có khoá → mỗi intent một signal (L5) | Low |
| 6 | phase-03 Requirements: `logLevel: 'info'` | `'debug'` (có lý do trong mã, spike §2.7) — chưa ghi vào §5 báo cáo | Nit |
| 7 | phase-03 Requirements: "lỗi writer → `upstream`" | `attemptAsync` → `unknown` (500) (L4) | Nit |
| 8 | phase-03 §2: `stream/route.ts` 151 dòng | 158 dòng | Nit |
| 9 | phase-03 §5.8: `ANDROID_ADB_SERVER_PORT` cố ý không vào `.env.example` | Trái quy ước LLM.md ("`.env.example`: Mọi biến môi trường") — chuyển sang phase 07 | Nit |
| 10 | impact-baseline: khoá `mirror` | `deviceMirror` — đã giải thích trong phase-03 §1 | — |
| 11 | phase-03/04/05 Todo "kịch bản tay" | **Cả ba đều chưa có ai thấy hình** — H1/H2 dự đoán lần đầu chạy tay sẽ 409 | — |

Những gì báo cáo nói "đã làm" và mã **có**: `pendingSizes` (§5.5), `StreamReader` tối giản (§5.3), `accessSync` TOCTOU (§5.2), `ENOENT/EACCES` (§5.1), `adbShell` dùng chung (§5.7), `fetchImpl` tiêm (phase-04 §5.1), outbox một phiên (§5.4), `releaseLock` thay `close` (§5.7), `git mv DeviceList` nguyên byte, `autoSelectDevice` thay `autoSelect`, `toolRegistry` một mục — tất cả khớp.

---

# Cần cập nhật `LLM.md` / `docs/architecture.md` ở phase 07 (chỉ liệt kê)

**`LLM.md`**
- §2: luật ESLint mới `@yume-chan/*` chỉ trong `data/`; ngoại lệ `features/adb-common/` (mảnh UI dùng chung trong một họ công cụ, được biết `domain/adb`).
- §3: cây thư mục **đang thiếu cả logcat** (`domain/adb`, `data/adb`, `features/adb-logcat`, `features/logcat-picker`, `app/api/adb/logcat`, `app/(app)/logcat`) — drift có sẵn từ commit `b9f6d66`; thêm cùng lúc với `domain/device-mirror`, `data/device-mirror`, `features/{device-mirror,mirror-picker,adb-common}`, `app/(app)/mirror/**`, `app/api/adb/mirror/{stream,control}`.
- §5: dòng "mảnh UI dùng chung trong một họ công cụ → `features/<họ>-common/components/`, được import domain của họ đó".
- §7: bảng route — `/mirror`, `/mirror/[serial]` (đã đăng nhập + `isSafeSerial`), `POST /api/adb/mirror/stream`, `POST /api/adb/mirror/control` (đã đăng nhập + phiên phải thuộc chính mình), và các route logcat đang thiếu.
- §10 bẫy: "`document` trong constructor của adapter trình duyệt → SSR 500 dù `'use client'`"; "React Compiler lint `set-state-in-effect`/`immutability`"; "`useState(() => sideEffect())` bị StrictMode gọi 2 lần" (nếu H2 chưa sửa thì đây là bẫy, nếu sửa thì ghi vào §12).
- §11: `LogcatPickerScreen.tsx` 207 dòng; `ANDROID_ADB_SERVER_PORT` chưa vào `.env.example`; nếu M4 không làm: "đổi chất lượng có thể 409 do race abort".
- §12 (cố ý): phiên mirror sống trong `globalThis.__eelMirrorSessions` nhưng thuộc đúng một request `/stream` (quyết định #4); không TTL; `notFound`/`forbidden` phân biệt ở `/control` vì `sessionId` là UUID; `logLevel: 'debug'` vì `'verbose'` crash server 3.3.4; `registry` chỉ bắc cầu.
- §11 #12: thêm mirror vào danh sách công cụ không ghi `AuditLog`.

**`docs/architecture.md`**
- §2: Root được sở hữu tài nguyên DOM/decoder (sink) ngoài State và ngoài ViewModel; canvas gắn bằng ref callback, không phải JSX; `startKey`/`start()` nếu H1/H2 sửa ở core.
- §3: `canExposeErrorDetail` dùng cho lỗi đi trong thân luồng (NDJSON logcat + nhị phân mirror), không chỉ `jsonError`.
- §4: cổng phía trình duyệt có thể là "sink" (đẩy vào) chứ không chỉ repository (kéo ra).
- §7 kiểm thử: mẫu fake `outcome: 'pending'` để đọc state giữa phiên; **bắt buộc** assert `signal.aborted` của lượt cũ khi test intent cùng khoá.
- §6/§8 checklist: biến `SCRCPY_*` không phải bí mật → không cần `envRules`, nhưng phải có trong `.env.example`.

---

# Câu hỏi chưa giải đáp

1. **Chưa ai chạy tay end-to-end.** Sau khi sửa H1–H3, cần một người đăng nhập chạy `/mirror/RF8Y60B9NCZ` trên `next dev`: mount lần đầu không 409; Dừng → canvas đứng và `adb shell ps -A | grep scrcpy` rỗng trong ≤ 3s; đổi chất lượng 5 lần → `lsof -p <pid> | grep 5037` không tăng; xoay máy → tỉ lệ đúng (M6).
2. `pnpm build` chưa từng chạy với `@yume-chan/adb-server-node-tcp` (`node:net`) — rủi ro #2 của plan (`serverExternalPackages`) chưa được xác nhận; `next.config.ts` hiện không khai.
3. Next 16 có gọi `cancel()` của `ReadableStream` khi client ngắt không? Route hiện dựa vào cả `abort` listener lẫn `cancel()` nên an toàn, nhưng nếu chỉ một đường hoạt động thì L3 (nhánh `pull` không release) thành lỗi thật.
4. Có muốn "tiếp quản phiên của chính mình" (M4a) hay giữ 409 tuyệt đối? Ảnh hưởng UX đổi chất lượng và trường hợp tab cũ chết mà server chưa biết.
5. Backpressure phía trình duyệt (L6) — có cần đo trên máy yếu trước phase 07 không, hay chấp nhận như Tango demo?
6. `gateway-check.ts` trong `plans/.../spike/` và hai file spike trong `src/` — xoá ở phase 07 như plan, hay giữ `gateway-check.ts` làm script kiểm tay lâu dài (nếu giữ thì chuyển ra `scripts/` và ghi vào LLM.md)?
