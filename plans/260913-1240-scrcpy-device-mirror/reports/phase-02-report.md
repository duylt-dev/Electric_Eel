---
title: "Phase 02 — Báo cáo: domain thuần cho device-mirror"
date: 2026-09-13
---

# Trạng thái: done

`pnpm typecheck && pnpm test && pnpm lint` đều xanh. `pnpm build` không nằm
trong yêu cầu phase 02 (chỉ ở docs §7/§8 cho PR cuối), không chạy ở đây.

## 1. GitNexus trước khi sửa

- `node .gitnexus/run.cjs impact "layerBoundaries" --direction upstream` →
  `UNKNOWN`, `impactedCount: 0`. Xác nhận bằng
  `grep -rn "layerBoundaries" eslint.config.mjs` → chỉ 2 dòng (khai báo +
  `...layerBoundaries`), đúng như `impact-baseline.md` mô tả ("0 chỗ dùng
  ngoài file"). An toàn để thêm khối mới.
- `node .gitnexus/run.cjs impact "parseDevicesOutput" --direction upstream` →
  `LOW`, 1 caller trực tiếp (`GET` trong `src/app/api/adb/devices/route.ts`).
  Không sửa thân hàm này, chỉ thêm export mới `autoSelectDevice` vào cùng
  file — khớp ràng buộc trong `impact-baseline.md`.
- `grep -rn "autoSelect" src` trước khi thêm `autoSelectDevice`: chỉ có ở
  `LogcatPickerViewModel.ts` (hàm nội bộ `autoSelect`, không export) → không
  trùng tên với export mới, an toàn.
- **Không sửa thân `isSafeSerial`** — đúng ràng buộc HIGH risk trong
  `impact-baseline.md`. `normalizeMirrorRequest` chỉ GỌI hàm này, không đổi nó.

## 2. Luật ESLint cấm `@yume-chan/*` ngoài `data/`

Thêm một khối vào `layerBoundaries` trong `eslint.config.mjs`
(`files: ['src/core/**', 'src/domain/**', 'src/features/**', 'src/ui/**', 'src/app/**']`,
cấm import `@yume-chan/*`). Đã CHỨNG MINH luật hoạt động:

- Thử tạo file tạm `src/domain/device-mirror/__eslint_probe_temp.ts` import
  `ScrcpyInstanceId` từ `@yume-chan/scrcpy` → `pnpm lint`/`eslint` báo đúng lỗi
  `no-restricted-imports` với thông điệp đã viết → xoá file tạm ngay sau đó
  (đã xác nhận file không còn tồn tại).
- Chạy `eslint` riêng trên hai file spike (`route.ts`, `page.tsx`) TRƯỚC khi
  thêm disable comment → 7 lỗi `no-restricted-imports`, đúng như dự kiến.

Đã thêm dòng
`/* eslint-disable no-restricted-imports -- mã spike phase 01, phase 03/05 thay bằng adapter trong data/ rồi xoá */`
vào đầu `src/app/api/adb/mirror/spike/route.ts` (trước `import { spawnSync }...`)
và `src/app/(app)/mirror/spike/page.tsx` (sau `'use client'`, trước `import Alert...`).
Không sửa gì khác trong hai file đó. `pnpm lint` sau đó: 0 lỗi, chỉ còn 7
warning `no-console` đã có sẵn từ phase 01 (không liên quan phase này).

## 3. File tạo

`src/domain/device-mirror/` — 15 file nguồn + 8 file test (không phải 14+9
như ước lượng trong phase file — xem mục 5 "Khác biệt so với phase file"):

```
entities/
  MirrorRequest.ts (+ .test.ts)
  MirrorVideoPacket.ts
  MirrorStreamEvent.ts
  mirrorFrameCodec.ts (+ .test.ts)
  mirrorFramePayloads.ts            ← MỚI, không có trong phase file
  MirrorControlMessage.ts
  validateMirrorControlBatch.ts (+ .test.ts)   ← MỚI, không có trong phase file
  touchMapping.ts (+ .test.ts)
repositories/
  MirrorDeviceGateway.ts
  MirrorRepository.ts
  MirrorVideoSink.ts
usecases/
  startMirrorSession.ts (+ .test.ts)
  dispatchMirrorControl.ts (+ .test.ts)
ControlOutbox.ts (+ .test.ts)
MirrorSessionRegistry.ts (+ .test.ts)
```

Sửa: `src/domain/adb/entities/AdbDevice.ts` (+20 dòng, thêm `autoSelectDevice`),
`src/domain/adb/entities/AdbDevice.test.ts` (+27 dòng, 5 test case mới),
`eslint.config.mjs` (+18 dòng, một khối mới), `src/app/api/adb/mirror/spike/route.ts`
(+1 dòng disable comment), `src/app/(app)/mirror/spike/page.tsx` (+1 dòng disable comment).

Không xoá file nào.

## 4. Test — 40 test case mới trong 8 file test mới + 5 case mới trong file có sẵn (45 tổng)

| File | Test case |
|---|---|
| `MirrorRequest.test.ts` | 5 |
| `mirrorFrameCodec.test.ts` | 5 (round-trip 5 loại sự kiện, 2 khung/mẩu, cắt giữa header, cắt giữa payload, vượt trần 16 MiB) |
| `validateMirrorControlBatch.test.ts` | 8 |
| `touchMapping.test.ts` | 5 |
| `ControlOutbox.test.ts` | 4 (kéo dài, hai pointer đan xen, move sau up không gộp, `take(max)` cắt lô) |
| `MirrorSessionRegistry.test.ts` | 6 |
| `startMirrorSession.test.ts` | 3 (đăng ký mới, serial bận → conflict không gọi gateway, **race thật hai lời gọi đan xen** → đóng phiên của lời gọi thua) |
| `dispatchMirrorControl.test.ts` | 4 |
| `AdbDevice.test.ts` (sửa) | +5 case cho `autoSelectDevice` |

`pnpm test`: 256/256 xanh (67 suite), không cần thiết bị thật — mọi gateway/
registry trong test đều là fake hoặc bản thật không I/O (`MirrorSessionRegistry`,
`ControlOutbox` không có I/O nên test dùng thẳng class thật, không cần fake).

Điểm đáng chú ý trong test `startMirrorSession`: kịch bản "register hỏng vì
race" được test bằng MỘT RACE THẬT (hai lời gọi `startMirrorSession` đan xen
qua `await Promise.resolve()` + một `Promise` treo tay), dùng `MirrorSessionRegistry`
THẬT — không fake registry để giả lập lỗi, vì `bySerial()` chạy trước
`gateway.start()` trong chính use case nên chỉ có race thật mới chạm đúng
nhánh `register()` trả `conflict` (fake registry trả lỗi ngay từ đầu sẽ bị
chặn sớm hơn ở bước `bySerial()`, không test được nhánh cần test).

## 5. Khác biệt so với phase file, và vì sao

1. **Tách `mirrorFrameCodec.ts` → thêm `mirrorFramePayloads.ts`.** Bản gộp dài
   233 dòng, vượt trần 200 dòng của `development-rules.md`. Tách theo hướng
   MỘT CHIỀU: `mirrorFrameCodec.ts` (khung chung: `encodeMirrorEvent`,
   `MirrorFrameReader`) import từ `mirrorFramePayloads.ts` (mã hoá/giải mã
   payload từng `kind`); chiều ngược lại không tồn tại nên không có vòng lặp
   import. API công khai (`encodeMirrorEvent`, `MirrorFrameReader`) không đổi
   — test không cần sửa.
2. **Tách `MirrorControlMessage.ts` → thêm `validateMirrorControlBatch.ts`.**
   Bản gộp dài 244 dòng, cùng lý do trên. Tách theo type/logic — đúng mẫu dự
   án đã dùng (`domain/ads/entities/` tách khỏi `domain/ads/validation/`).
   `MirrorControlMessage.ts` giờ CHỈ còn kiểu + `MIRROR_KEYCODES`;
   `validateControlBatch` chuyển sang file mới, import kiểu MỘT CHIỀU từ
   `MirrorControlMessage.ts` (không có chiều ngược — tránh vòng lặp import).
   **Ảnh hưởng phase 03/05:** import `validateControlBatch` từ
   `domain/device-mirror/entities/validateMirrorControlBatch`, KHÔNG phải từ
   `MirrorControlMessage`. Đã cập nhật `dispatchMirrorControl.ts` theo đúng
   đường dẫn mới.
3. **Số file test thực tế là 8, không phải "≥ 9" như Success Criteria nêu.**
   Đếm lại danh sách Todo của chính phase file: 4 entity test + `ControlOutbox`
   + `MirrorSessionRegistry` + hai use case test = 8 file test MỚI (không tính
   sửa `AdbDevice.test.ts`, vì đó là file có sẵn). `MirrorVideoPacket.ts` và
   `MirrorStreamEvent.ts` là type thuần, không có hàm để test riêng — cùng quy
   ước với `AdbShell.ts`/`AdbRepository.ts`/`LogcatSession.ts` trong
   `domain/adb` (những cổng/type thuần đó cũng không có `.test.ts`). 256 test
   case tổng cộng và mọi test đều xanh; không thêm test giả tạo chỉ để chạm
   mốc 9 file.
4. **`ControlOutbox`/`MirrorSessionRegistry` viết bằng `class`, không phải
   hàm/factory thuần** như phần lớn domain khác. Đây là lựa chọn CÓ CHỦ Ý,
   theo đúng tiền lệ `core/mvi/EffectChannel.ts` (nguyên thuỷ có trạng thái,
   generic, không I/O) — khác các cổng như `AdbShell` (interface, vì cần fake
   để tránh I/O thật). `ControlOutbox`/`MirrorSessionRegistry` không có I/O
   nên test dùng thẳng class thật, không cần interface tách riêng.
5. **`register()` của `MirrorSessionRegistry` nhận `handle` qua THAM SỐ RIÊNG**
   (`register(entry: MirrorSessionInput, handle: H)`), không gộp vào object
   `entry`. Bám sát nghĩa đen của mô tả trong phase file: "entry:
   `{ id, serial, userId, startedAt }`" (không có `handle`) "kèm handle...
   giữ NGOÀI kiểu entry thuần". **Chữ ký cuối cho phase 03**:
   `registry.register({ id, serial, userId, startedAt }, session)` với
   `session: MirrorDeviceSession`.
6. **`MirrorFrameReader.buffer` khai kiểu tường minh `Uint8Array<ArrayBufferLike>`**
   — cùng vướng mắc TypeScript đã ghi chú trong `page.tsx` của phase 01 (suy
   luận từ `new Uint8Array(0)` khoá kiểu hẹp hơn kiểu trả về của `.slice()`).
   Không phải lỗi logic, chỉ là chú thích kiểu bắt buộc để qua `tsc`.
7. **`stripControlChars` (lọc ký tự điều khiển khỏi `text`) viết bằng vòng lặp
   theo mã ký tự, không dùng regex chứa ký tự điều khiển trong charclass.**
   Lý do THỰC TẾ gặp phải khi viết file này: một regex kiểu
   `/[\x00-\x09\x0B-\x1F\x7F]/g` bị công cụ soạn thảo biến thành BYTE ĐIỀU
   KHIỂN THẬT nằm ngay trong file nguồn (phát hiện bằng cách quét byte thô,
   xem file `.ts` bị hỏng im lặng — `pnpm lint`/`tsc` không báo gì vì regex đó
   vẫn chạy đúng chức năng dù chứa byte thật thay vì escape). Đổi sang vòng
   lặp theo `codePointAt` để tránh cả lớp rủi ro này, không chỉ vá triệu
   chứng. `isAsciiText` ở `touchMapping.ts` dùng regex `\x00-\x7F` (không có
   dãy nhiều escape liên tiếp) — kiểm tra lại bằng quét byte thô, KHÔNG bị
   lỗi tương tự, nên giữ nguyên regex ở đó.

## 6. detect-changes — chạy một lần, không `partial`/`truncated`

```
node .gitnexus/run.cjs detect-changes --scope all --repo .
→ Changes: 5 files, 4 symbols. Risk: medium.
  Const layerBoundaries → eslint.config.mjs        (THẬT — thêm khối mới, có chủ đích)
  Const config → eslint.config.mjs                 (DƯƠNG TÍNH GIẢ — xem dưới)
  Function stateLabel → AdbDevice.ts                (DƯƠNG TÍNH GIẢ — xem dưới)
  Function readState → AdbDevice.ts                 (DƯƠNG TÍNH GIẢ — xem dưới)
Affected: GET → ReadState (do readState bị gắn nhãn "changed")
```

Không thấy `partial: true`/`truncated: true` → không cần chạy lại lần hai.

**Vì sao ba dòng còn lại là dương tính giả, đã xác nhận bằng `git diff`:**

- `git diff -- src/domain/adb/entities/AdbDevice.ts` cho thấy thay đổi DUY
  NHẤT là một khối chèn nguyên vẹn (`autoSelectDevice`, 20 dòng) giữa
  `deviceLabel` và `stateLabel`. Thân hàm `stateLabel` và `readState` giống
  hệt byte-for-byte so với trước — công cụ diff-theo-dòng của GitNexus gắn
  nhãn "changed" cho các symbol đứng NGAY SAU một đoạn chèn vì số dòng của
  chúng bị lệch, không phải vì nội dung đổi. Chạy `impact "stateLabel"` và
  `impact "readState"` riêng: cả hai đều `LOW` risk, không phải `HIGH`/`CRITICAL`
  nên không cần dừng lại theo luật "cảnh báo HIGH/CRITICAL" của `AGENTS.md`.
- `git diff -- eslint.config.mjs` cho thấy thay đổi DUY NHẤT là thêm một
  phần tử vào cuối mảng `layerBoundaries`; dòng `const config = [` chỉ nằm
  trong vùng NGỮ CẢNH (context) của cùng một hunk diff, không có ký tự nào
  của chính khai báo `config` bị đổi.

Kết luận: rủi ro thật của thay đổi phase 02 là THẤP, không phải "medium" như
con số tổng hợp thô của `detect-changes` — con số đó bị kéo lên bởi hai dương
tính giả do dịch chuyển số dòng. Ghi lại đúng theo yêu cầu "UNKNOWN/mập mờ →
xác nhận bằng cách khác, không dừng ở một con số".

## 7. Chữ ký ba cổng cho phase 03/04/05

```ts
// domain/device-mirror/repositories/MirrorDeviceGateway.ts (server, phase 03 hiện thực)
interface MirrorDeviceGateway {
  start(request: MirrorRequest, signal: AbortSignal): Promise<Result<MirrorDeviceSession>>
}
interface MirrorDeviceSession {
  readonly meta: { deviceName: string; width: number; height: number }
  packets(): AsyncIterable<MirrorVideoPacket>
  onSize(listener: (size: { width: number; height: number }) => void): () => void
  control(messages: readonly MirrorControlMessage[]): Promise<Result<void>>
  close(): Promise<void>
}

// domain/device-mirror/repositories/MirrorRepository.ts (trình duyệt, phase 04)
interface MirrorRepository {
  stream(request: MirrorRequest, onEvent: (event: MirrorStreamEvent) => void, signal: AbortSignal): Promise<Result<void>>
  sendControl(sessionId: string, message: MirrorControlMessage, signal: AbortSignal): Promise<Result<void>>
}

// domain/device-mirror/repositories/MirrorVideoSink.ts (trình duyệt, phase 04)
interface MirrorVideoSink {
  readonly supported: boolean
  push(packet: MirrorVideoPacket): void
  snapshotPng(): Promise<Result<Uint8Array>>
  dispose(): void
}
```

Ghi chú cho phase 03: `MirrorDeviceSession.packets()` trả `MirrorVideoPacket`
(`type: 'config'|'frame'`, `keyframe: boolean`, `pts: bigint` BẮT BUỘC) —
adapter phải tự quy đổi từ `ScrcpyMediaStreamPacket` của Tango
(`type: 'configuration'|'data'`, `keyframe?: boolean`, `pts?: bigint`) bằng
`keyframe === true` và `pts ?? 0n`, đúng khuyến nghị #3 trong `spike-report.md` §6.

Ghi chú cho phase 04: `MirrorRepository.sendControl` gửi TỪNG thông điệp một —
gộp lô bằng `ControlOutbox` (đã có sẵn ở domain, thuần, test xong) là việc của
`HttpMirrorRepository`, KHÔNG phải của ViewModel.

Ghi chú cho phase 05: `autoSelectDevice` đã có ở
`domain/adb/entities/AdbDevice.ts`, `LogcatPickerViewModel.ts` CHƯA được sửa
sang dùng hàm này (đúng chỉ định "chỉ đọc, chưa sửa ViewModel ở phase này") —
việc đổi `LogcatPickerViewModel` sang gọi `autoSelectDevice` thay vì `autoSelect`
nội bộ là việc của phase 05 (cùng người sở hữu file theo bảng ownership).

## 8. Kết quả kiểm tra cuối

- `pnpm typecheck`: xanh, 0 lỗi.
- `pnpm test`: 256/256 xanh, 67 suite, không cần thiết bị.
- `pnpm lint`: 0 lỗi, 7 warning `no-console` có sẵn từ phase 01 (không đụng tới).
- `domain/device-mirror/**`: đã kiểm bằng mắt — không file nào import ngoài
  `../../core/result` và `../../adb/entities/AdbDevice`; không `server-only`,
  không Node, không Tango, không React (luật ESLint mới đã CHỨNG MINH chặn
  được `@yume-chan/*` nếu có ai vô tình thêm).
- Mọi file trong `src/domain/device-mirror/` đều < 200 dòng (file dài nhất:
  `validateMirrorControlBatch.ts`, 156 dòng).

## Câu hỏi chưa giải quyết

Không có — mọi quyết định lệch phase file đều đã liệt kê ở mục 5 kèm lý do.
