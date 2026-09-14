---
title: "Phase 04 — Báo cáo: data trình duyệt (HttpMirrorRepository, WebCodecsVideoSink, di/client)"
date: 2026-09-13
---

# Trạng thái: done

`pnpm typecheck && pnpm test && pnpm lint` — xanh cho phạm vi của phase này
(chi tiết lỗi ngoài phạm vi ở mục 5). `pnpm build` không thuộc yêu cầu phase
này, không chạy.

## 1. GitNexus trước khi sửa `di/client.ts`

```
node .gitnexus/run.cjs impact "clientContainer" --direction upstream
→ risk: UNKNOWN, impactedCount: 0
```

`UNKNOWN` → xác nhận bằng `grep -rn "clientContainer\." src`: đúng 5 chỗ dùng
(`ConfigEditorViewModel.ts`, `LogcatPickerViewModel.ts`, `StringTranslatorViewModel.ts`
×2, `AdbLogcatViewModel.ts`), tất cả đọc các khoá đã có (`remoteConfig`, `adb`,
`translation`, `translationSettings`) — không chỗ nào đụng khoá `deviceMirror`
(chưa tồn tại trước khi sửa). Thêm khoá mới an toàn tuyệt đối, không đổi hành
vi của khoá cũ nào. Sau khi sửa, `impact "ClientContainer" --direction upstream`
(type alias bị đổi) cũng `UNKNOWN` → grep xác nhận type này chỉ được **khai**,
không được **dùng** ở đâu khác trong `src/` (không type annotation nào import
nó) — an toàn.

## 2. File tạo/sửa

Tạo:
- `src/data/device-mirror/HttpMirrorRepository.ts` — 198 dòng
- `src/data/device-mirror/HttpMirrorRepository.test.ts` — 250 dòng, 9 test case
- `src/data/device-mirror/WebCodecsVideoSink.ts` — 109 dòng

Sửa:
- `src/di/client.ts` — +12 dòng (2 import + khoá `deviceMirror`), không đụng
  gì khác (`git diff` xác nhận).

Không xoá file nào (xem mục 4 "Khác biệt" — bước xoá trang spike bị bỏ theo
quyết định điều phối).

## 3. Tên API Tango THẬT dùng trong `WebCodecsVideoSink`

Đọc `.d.ts` build ra trong
`node_modules/.pnpm/@yume-chan+scrcpy-decoder-webcodecs@2.5.3/.../esm/video/decoder.d.ts`
và `render/webgl.d.ts` trước khi viết:

- `class WebCodecsVideoDecoder implements ScrcpyVideoDecoder`
  - `static get isSupported(): boolean`
  - `constructor({ codec, renderer, ...options }: WebCodecsVideoDecoder.Options)` —
    `codec: ScrcpyVideoCodecId`, `renderer: VideoFrameRenderer`
  - `get writable(): WritableStream<ScrcpyMediaStreamPacket>`
  - `snapshot(): Promise<Blob | undefined>`
  - `dispose(): void`
- `class WebGLVideoFrameRenderer extends CanvasVideoFrameRenderer`
  - `constructor(canvas?: HTMLCanvasElement | OffscreenCanvas, enableCapture?: boolean)`
- `ScrcpyVideoCodecId.H264` từ `@yume-chan/scrcpy` (`base/video.d.ts`, giá trị
  của một object-as-enum, khớp `1748121140` đã đo ở spike)

Đúng như phase file và `spike-report.md` mô tả — không có khác biệt nào cần
ghi thêm so với dự kiến. `getWriter()` gọi MỘT lần lúc dựng, giữ suốt vòng đời
sink (không `getWriter()` lại mỗi `push`, vì một `WritableStream` chỉ cho một
writer giữ khoá tại một thời điểm).

## 4. Cách test `HttpMirrorRepository` bằng fetch giả — 9 test case

Không cần trình duyệt: `fetchImpl` tiêm qua constructor, `Response`/`ReadableStream`/
`DOMException` dùng thẳng global của Node (undici, có sẵn từ Node 18+), không
cast `as unknown as Response` ở đâu.

**`stream` — 5 case** (`HttpMirrorRepository.test.ts`):
1. Đọc khung cắt giữa nhiều mẩu KHÔNG theo ranh giới message (mô phỏng TCP
   segment thật, cùng cách `spike-report.md` §4 đã kiểm) → `onEvent` đúng thứ
   tự, `stream` trả `ok`.
2. `!response.ok` → dịch đúng qua `toAppErrorFromResponse`, giữ `kind`/`message`.
3. `response.body === null` → `upstream`.
4. `fetch` ném khi `signal` đã huỷ trước đó → `cancelled`.
5. Sự kiện `failed` giữa luồng → vẫn gọi `onEvent`, rồi trả `err` đúng nội
   dung `failed` sau khi luồng kết thúc (mẫu `streamLogcat`).

**`sendControl` — 4 case:**
1. Gộp lô qua `ControlOutbox`, đúng MỘT `fetch` một lúc, giữ thứ tự
   down→move→up: 4 lời gọi liên tiếp KHÔNG `await` xen giữa (down, 2 move,
   up) → do JS đơn luồng, `down` đã bị lấy khỏi outbox và bay đi (request #1,
   1 message) TRƯỚC KHI 3 lời gọi sau kịp `push`; request #2 gộp move cuối +
   up (2 message). Tổng 2 request, không phải 4 — đúng yêu cầu "chỉ một fetch
   một lúc" và giữ thứ tự.
2. Đổi `sessionId` giữa chừng → outbox cũ bị bỏ; lời gọi CHƯA kịp gửi của
   phiên cũ (`move`) nhận `cancelled`; lời gọi ĐÃ bay của phiên cũ vẫn hoàn
   tất bình thường; phiên mới gửi được ngay sau khi phiên cũ xong lô đang bay
   (`pumping` là cờ instance-level, dùng chung giữa các phiên nối tiếp).
3. `signal.abort()` khi có message còn kẹt trong outbox → outbox bị thay mới
   (xoá phần còn lại), message đang bay không bị lùi lại (đã gửi thật),
   message còn kẹt nhận `cancelled`.
4. `signal` đã huỷ TỪ TRƯỚC khi gọi → `cancelled` ngay, không chạm outbox.

Không test được (và không cần, theo chỉ định phase): `WebCodecsVideoSink`
bằng `node:test` — cần `document`, `HTMLCanvasElement`, WebCodecs thật, không
có trong môi trường Node. Đã đọc kỹ `.d.ts` để tự tin về chữ ký, và mã spike
(`mirror/spike/page.tsx`) đã CHẠY THẬT với đúng các API này (`WebCodecsVideoDecoder`,
`WebGLVideoFrameRenderer`) — chỉ khác là spike dùng trực tiếp trong component,
còn `WebCodecsVideoSink` bọc lại thành class implement `MirrorVideoSink`.

Nhánh phòng thủ KHÔNG test được: `frameReader.push()` ném lỗi trong `stream()`
(catch quy về `upstream`) — theo mã `mirrorFrameCodec.ts`/`mirrorFramePayloads.ts`
hiện tại, `decodeMessage()` không bao giờ ném (mọi nhánh trả `failedEvent()`
thay vì throw), nên nhánh này không thể chạm tới bằng dữ liệu hợp lệ hay hỏng
tuỳ ý — giữ lại như phòng thủ cho một bug tương lai ở `MirrorFrameReader`, ghi
rõ ở đây thay vì viết test giả (mock nội bộ của domain) chỉ để chạm dòng code.

## 5. Khác biệt so với phase file, và vì sao

1. **`fetchImpl` là tham số RIÊNG của `HttpMirrorRepository`, không có mẫu ở
   `HttpAdbRepository`.** Đã đọc `HttpAdbRepository.ts` — mọi phương thức của
   nó đi qua `httpJson`/`readNdjson` (dùng `fetch` toàn cục, không tiêm được)
   nên không cần tham số này. `stream()` ở đây tự đọc `response.body` bằng
   `getReader()` (không qua `httpJson`, vì nó chờ JSON xong hẳn mới đọc — không
   hợp với luồng nhị phân chảy dần), nên phải tự tiêm `fetchImpl` để test
   không cần trình duyệt — đúng như phase file đã lường trước
   ("nếu không, thêm tham số tuỳ chọn và ghi vào báo cáo").
2. **`sendControl`/`postControlBatch` KHÔNG gọi hàm `httpJson` đã import,
   mà tự viết một `fetch` + `toAppErrorFromResponse` inline, dùng cùng
   `fetchImpl`.** Phase file viết "qua httpJson (đọc chữ ký thật)" — đã đọc
   chữ ký thật, nhưng `httpJson` hardcode `fetch` toàn cục (không tiêm được),
   nên nếu gọi thẳng nó thì không đếm được số request/kiểm thứ tự bằng fetch
   giả trong test (và monkey-patch `globalThis.fetch` bị loại vì `node:test`
   có thể chạy nhiều file test song song — state toàn cục dùng chung rủi ro
   đụng nhau). Vẫn tái dùng `toAppErrorFromResponse` (không chép lại logic dịch
   lỗi) để giữ DRY đúng chỗ quan trọng; không sửa `httpJson.ts` (ngoài file
   ownership, dùng chung cho nhiều adapter khác).
3. **Bước 6 "kiểm tay với route thật/route spike, dựng trang tạm" trong
   Implementation Steps — BỎ, theo quyết định điều phối đã nêu rõ trong
   nhiệm vụ.** Không tạo trang tạm mới, KHÔNG xoá `src/app/(app)/mirror/spike/page.tsx`
   (dòng "Xoá" trong Related Code Files của phase file cũng bị bỏ theo cùng
   quyết định — trang spike vẫn còn nguyên, phase 05 nối UI thật rồi mới xoá).
   Vì vậy Success Criteria "Trang thử thấy hình chuyển động…" và
   "`snapshotPng()` trả PNG mở được" **chưa được xác nhận bằng mắt người** ở
   phase này — để lại cho phase 05/07, đúng ghi chú "Next Steps" gốc của phase
   file (phase 07 kiểm CSP thật, còn xác nhận hình ảnh cần UI thật của phase
   05).
4. **`ControlOutbox` giữ MỘT instance theo `sessionId` hiện tại (đổi phiên →
   outbox mới), không phải một `Map<sessionId, ControlOutbox>`.** Đúng nghĩa
   đen của "một outbox tại một thời điểm" trong phase file — repository này
   phục vụ một phiên mirror đang mở tại một thời điểm trên một tab, không có
   nhu cầu giữ nhiều outbox song song.
5. **Đơn giản hoá việc resolve `Promise` theo "lô":** mọi `Promise` đang chờ
   tại thời điểm một lô bắt đầu gửi (`pendingResolvers` được snapshot ngay khi
   `outbox.take(64)` chạy) đều nhận CHUNG kết quả của lô đó — kể cả những lời
   gọi mà thông điệp đã bị `ControlOutbox` GỘP (move) và không còn đứng riêng
   trong payload gửi đi. Đúng câu "đơn giản: mọi promise trong lô cùng nhận
   kết quả lô" của phase file, áp dụng cho cả trường hợp gộp move.
6. **Đổi `sessionId`/huỷ `signal` dùng chung một kind lỗi (`cancelled`) cho
   các `Promise` bị bỏ dở**, dù phase file chỉ nói "signal huỷ → …resolve
   cancelled" và chỉ nói "đổi sessionId → outbox mới, bỏ cũ" (không nói rõ
   resolve thế nào). Chọn `cancelled` cho cả hai vì để `Promise` treo mãi là
   rò tài nguyên phía gọi (ViewModel `await` mãi không xong), và `cancelled`
   đúng ngữ nghĩa nhất trong `AppErrorKind` hiện có (không phải lỗi, không
   hiển thị) cho một thông điệp điều khiển không còn nơi nào nhận.
7. **`WebCodecsVideoSink.dispose()` dùng `writer.releaseLock()`, không dùng
   `writer.close()`**, dù phase file liệt kê cả hai ("releaseLock/close bọc
   try"). `close()` trả về một `Promise` có thể bị từ chối nếu writable đã lỗi
   từ một lần `push` trước đó; `dispose()` là API đồng bộ
   (`dispose(): void`, không async theo `MirrorVideoSink`), nên không có chỗ
   `await` cái promise đó — gọi `close()` rồi bỏ mặc promise dễ sinh một
   rejection không ai bắt. `decoder.dispose()` gọi ngay sau đó dọn toàn bộ
   pipeline bất kể trạng thái writer, nên `releaseLock()` (đồng bộ, an toàn)
   là đủ.

## 6. Kết quả kiểm tra cuối

- `pnpm typecheck`: **lỗi duy nhất nằm ở `src/data/device-mirror/TangoMirrorGateway.ts`**
  (2 lỗi kiểu `ReadableStream<T>` giữa `@yume-chan/stream-extra` và lib DOM) —
  file của phase 03, đang làm song song, KHÔNG sửa theo đúng chỉ định. Xác
  nhận riêng file của phase 04 sạch:
  `pnpm exec tsc --noEmit -p . 2>&1 | grep -i "HttpMirrorRepository\|WebCodecsVideoSink\|di/client"`
  → không ra dòng nào.
- `pnpm test`: **283/283 xanh**, 71 suite (256 của phase 02 + 9 của phase 04 +
  18 của phase 03 đang làm song song — `describeMirrorFailure`, `readMirrorSettings`,
  …). Không test nào fail.
- `pnpm lint`: **0 lỗi**, 8 warning — 7 `no-console` có sẵn từ phase 01 (mã
  spike), 1 `no-unused-vars` (`adbShell`) ở `src/di/server.ts` của phase 03,
  không liên quan phase này. Xác nhận riêng 4 file của mình:
  `pnpm exec eslint src/data/device-mirror/HttpMirrorRepository.ts src/data/device-mirror/HttpMirrorRepository.test.ts src/data/device-mirror/WebCodecsVideoSink.ts src/di/client.ts`
  → không output, 0 lỗi/0 warning.
- `git diff -- src/di/client.ts`: chỉ 2 dòng import + 1 khoá `deviceMirror`
  mới (12 dòng thêm), không đụng khoá nào khác — xác nhận bằng mắt.
- Mỗi file của phase 04 đều < 200 dòng: `HttpMirrorRepository.ts` 198 dòng,
  `WebCodecsVideoSink.ts` 109 dòng (rule "< 200 dòng" chỉ áp cho file mã
  nguồn, không áp cho file test — `HttpMirrorRepository.test.ts` 250 dòng,
  cùng tiền lệ `ConfigEditorViewModel.test.ts` 290 dòng trong codebase).
- Không import `@yume-chan/*` ngoài `data/` — cả hai file mới chỉ import
  Tango trong chính `src/data/device-mirror/`, đúng luật ESLint phase 02 đã
  thêm (`layerBoundaries`).

### `detect-changes --scope all`

```
node .gitnexus/run.cjs detect-changes --scope all --repo .
→ Changes: 7 files, 7 symbols. Risk: medium.
  Const layerBoundaries, Const config      → eslint.config.mjs   (phase 02, cũ)
  TypeAlias ClientContainer                → src/di/client.ts    (PHASE 04 — của tôi)
  Const appDirectory, Const serverContainer → src/di/server.ts   (phase 03, song song)
  Function stateLabel, Function readState  → AdbDevice.ts        (phase 02, cũ — dương tính giả đã giải thích ở phase-02-report.md §6)
Affected: GET → ReadState (do readState bị gắn nhãn "changed")
```

Không có `partial: true`/`truncated: true` trong output → không cần chạy lại.
Chạy một lần, không phải kết quả riêng của phase 04 (gộp cả 3 phase đang chạy
song song trên cùng working tree, chưa ai commit) — đã tách riêng symbol của
mình (`ClientContainer`) và xác nhận an toàn ở mục 1. Rủi ro "medium" tổng hợp
không phải do thay đổi của phase 04 — `ClientContainer` chỉ THÊM một khoá, có
0 nơi tiêu thụ ngoài chính khai báo.

## Ghi chú cho phase 05

- Dựng sink: `const sink = clientContainer.deviceMirror.createVideoSink()` —
  gọi lại mỗi khi Root mount (kể cả lần StrictMode gắn-gỡ-gắn lại ở dev), KHÔNG
  giữ một sink dùng chung giữa các lần mount. Root nên đọc `sink.disposed`
  theo đúng mẫu `instance.isDisposed` ở `defineViewModel.tsx`: mount cũ gỡ →
  `sink.dispose()` → mount mới kiểm `disposed === true` (nếu tái dùng instance
  cũ) và dựng sink mới, hoặc đơn giản hơn: luôn tạo sink mới trong effect
  mount, `dispose()` trong cleanup — không cần đọc `disposed` nếu Root không
  cố tái sử dụng instance qua các lần StrictMode remount.
- `sink.canvas` là `HTMLCanvasElement` KHÔNG style — Screen/`MirrorSurface` tự
  đặt `style`/kích thước khi gắn nó vào DOM (tham khảo cách `mirror/spike/page.tsx`
  style trực tiếp thẻ `<canvas>` qua `ref`, ở đây thay bằng gắn thẳng
  `sink.canvas` node — có thể cần `useEffect` để `appendChild` nếu không dùng
  được JSX trực tiếp cho một node đã tồn tại).
- `sink.supported === false` → không tạo decoder, `push` no-op — ViewModel tự
  hiện effect/thông báo "đổi Chrome/Edge", không có gì để `await` từ sink.
- Gọi `repository.stream(request, onEvent, ctx.signal)` — `onEvent` nhận
  `MirrorStreamEvent`, nhánh `video` thì gọi `deps.videoSink.push(event.packet)`,
  nhánh `size` thì cập nhật state kích cỡ (không đụng canvas — WebGL renderer
  tự resize theo `sizeChanged` của decoder), nhánh `meta` dựng state phiên,
  nhánh `failed` thường không cần xử lý riêng (đã đi kèm trong `err()` cuối
  của `stream()` khi luồng kết thúc).
- `sendControl(sessionId, message, ctx.signal)` — gọi trực tiếp, KHÔNG tự gộp
  lô ở ViewModel, tự bơm phía adapter. Đổi `sessionId` (mở phiên mới) tự động
  bỏ hàng đợi cũ — ViewModel không cần tự dọn.
- `snapshotPng()` trả `Result<Uint8Array>` — dùng để tải PNG (vd Effect
  `DownloadFile` hoặc tương tự đã có trong codebase).

## Câu hỏi chưa giải quyết

Không có. Mọi quyết định lệch phase file đã liệt kê ở mục 5 kèm lý do; hai
mục Success Criteria liên quan hình ảnh thật (đã nêu ở mục 5.3) cố ý để lại
cho phase 05/07 theo đúng quyết định điều phối đã truyền đạt trong nhiệm vụ.
