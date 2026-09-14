# Phase 02 — Domain: entity, framing, cổng, registry, use case, luật ESLint, test thuần

**Ước lượng:** 6h (chỉ xem: 4.5h — bỏ `MirrorControlMessage`, `ControlOutbox`, `MirrorSessionRegistry`, `dispatchMirrorControl`) · **Ưu tiên:** P1 · **Trạng thái:** done
**File ownership:** `src/domain/device-mirror/**`, `src/domain/adb/entities/AdbDevice.ts` + `.test.ts`, `eslint.config.mjs`.
**Phụ thuộc:** phase 01 GO. **Mở khoá:** 03, 04, 05 chạy song song.

## Context Links

- `LLM.md` §2 (ranh giới), §5 (cổng ở `domain/*/repositories/`, hiện thực ở `data/`), §9 (test).
- `docs/architecture.md` §3 (Result/AppError), §4 (cổng tách theo cách dùng).
- Tiền lệ: `src/domain/adb/entities/LogcatSession.ts` (kiểu sự kiện dây), `src/domain/adb/repositories/AdbShell.ts` (cổng hẹp, mảng tham số), `src/domain/adb/usecases/adbCommands.ts` (kiểm dữ liệu vào ở đầu mỗi hàm).
- `spike-report.md` (phase 01) — tên trường thật của Tango.

## Overview

Mọi thứ hai bên (Node và trình duyệt) cùng hiểu nằm ở đây, thuần TypeScript, không import gì ngoài `core/`: kiểu yêu cầu, kiểu gói video, framing nhị phân, thông điệp điều khiển + kiểm tra, ánh xạ toạ độ, hộp gộp control, bảng phiên, hai use case, ba cổng. Đây là phần **test được nhiều nhất** của công cụ, nên làm trước và làm kỹ.

## Key Insights

- Trình duyệt **không** gửi kích cỡ màn hình trong thông điệp chạm: nó gửi toạ độ chuẩn hoá `nx, ny ∈ [0,1]`; server nhân với kích cỡ video hiện tại (`AdbScrcpyVideoStream.width/height`) bằng `toDevicePoint`. Kích cỡ là dữ liệu do máy quyết định, để trình duyệt tự khai là mở đường cho một tham số bịa.
- Gộp lô control là chuyện của **đường truyền** (bình luận ở `logcat/route.ts` đã nói vậy) → `ControlOutbox` thuần ở domain, nhưng người gọi nó là `HttpMirrorRepository` (phase 04), không phải ViewModel.
- Registry không có TTL: phiên được `release()` trong `finally` của route stream. Registry chỉ là `Map` + chỉ mục theo serial + kiểm chủ sở hữu.
- `pts` là `bigint` (u64 µs) đi nguyên trong khung nhị phân; không qua JSON.
- Enum tham số chất lượng ở domain là **nguồn duy nhất**: server chỉ chấp giá trị trong enum, UI chỉ hiện giá trị trong enum.

## Requirements

Chức năng — hàm/kiểu phải có:

| File | Nội dung |
|---|---|
| `entities/MirrorRequest.ts` | `MIRROR_MAX_SIZES = [1024, 1440, 1920, 0] as const` (0 = gốc), `MIRROR_FPS = [30, 60]`, `MIRROR_BIT_RATES_MBPS = [2, 4, 8, 12]`; `MirrorRequest { serial, maxSize, maxFps, bitRateMbps, control: boolean }`; `DEFAULT_MIRROR_QUALITY`; `normalizeMirrorRequest(raw: unknown): Result<MirrorRequest>` — `isSafeSerial`, giá trị ngoài enum → `validation` |
| `entities/MirrorVideoPacket.ts` | `MirrorVideoPacket = { type: 'config'; data: Uint8Array } \| { type: 'frame'; keyframe: boolean; pts: bigint; data: Uint8Array }`. Doc comment ghi **đúng** header scrcpy gốc (12 byte, bit 63/62) và nói rõ Tango parse, ta không parse |
| `entities/MirrorStreamEvent.ts` | `{ type: 'meta'; sessionId; deviceName; width; height; codec: 'h264'; control: boolean } \| { type: 'video'; packet } \| { type: 'size'; width; height } \| { type: 'failed'; kind: AppErrorKind; message; detail? }` |
| `entities/mirrorFrameCodec.ts` | `encodeMirrorEvent(event): Uint8Array` và `class MirrorFrameReader { push(chunk: Uint8Array): MirrorStreamEvent[] }` — khung `[u32 BE len][u8 kind][payload]`; kind 1 meta (JSON utf8), 2 config, 3 frame (`[u8 flags bit0 keyframe][u64 BE pts][data]`), 4 size (`[u16 w][u16 h]`), 5 failed (JSON). Trần payload 16 MiB → trả lỗi qua sự kiện `failed` kind `unknown` và bỏ đệm |
| `entities/MirrorControlMessage.ts` | union: `touch { action: 'down'\|'up'\|'move'; pointer: number(0..9); nx; ny; pressure }`, `scroll { nx; ny; dx; dy ∈ [-1,1] }`, `key { action: 'down'\|'up'; key: MirrorKey }`, `text { text }` (≤ 300 ký tự, bỏ ký tự điều khiển trừ `\n`), `backOrScreenOn { action }`, `displayPower { on: boolean }`, `rotate`, `expandNotifications`. `MirrorKey = 'back'\|'home'\|'appSwitch'\|'power'\|'volumeUp'\|'volumeDown'\|'menu'\|'enter'\|'backspace'`; `MIRROR_KEYCODES: Record<MirrorKey, number>` = {4, 3, 187, 26, 24, 25, 82, 66, 67} (hằng Android, không import Tango). `validateControlBatch(raw: unknown): Result<MirrorControlMessage[]>` — tối đa 64 thông điệp, số phải hữu hạn, trong biên |
| `entities/touchMapping.ts` | `toDevicePoint({ nx, ny }, { width, height }) → { x, y }` kẹp `[0, width-1]`; `isAsciiText(text)` để chọn `injectText` hay clipboard-paste |
| `ControlOutbox.ts` | thuần: `push(msg)`, `take(max = 64): MirrorControlMessage[]`, `size`. Luật gộp: `move` cùng `pointer` chỉ giữ cái mới nhất **nếu chưa có down/up chen giữa**; không bao giờ bỏ `down`/`up`/`key`/`text`; thứ tự tương đối được giữ |
| `MirrorSessionRegistry.ts` | `register(entry: { id, serial, userId, startedAt }): Result<void>` (`conflict` nếu serial đang có), `release(id)`, `find(id, userId): Result<entry>` (`notFound` khi không có, `forbidden` khi khác chủ), `bySerial(serial)`; kèm `handle: MirrorDeviceSession` giữ ngoài kiểu entry thuần (registry generic `<H>`) để test không cần Tango |
| `repositories/MirrorDeviceGateway.ts` | **server**: `start(request: MirrorRequest, signal): Promise<Result<MirrorDeviceSession>>`; `MirrorDeviceSession { meta: { deviceName; width; height }; packets(): AsyncIterable<MirrorVideoPacket>; onSize(listener): () => void; control(messages: MirrorControlMessage[]): Promise<Result<void>>; close(): Promise<void> }` |
| `repositories/MirrorRepository.ts` | **trình duyệt**: `stream(request, onEvent, signal): Promise<Result<void>>`, `sendControl(sessionId, message, signal): Promise<Result<void>>` (một thông điệp; adapter tự gộp) |
| `repositories/MirrorVideoSink.ts` | **trình duyệt**: `readonly supported: boolean; push(packet): void; snapshotPng(): Promise<Result<Uint8Array>>; dispose(): void` |
| `usecases/startMirrorSession.ts` | `(deps: { gateway, registry }, request, userId, newId: () => string, signal) → Result<{ id; session }>`: kiểm `registry.bySerial` → `gateway.start` → `register`; nếu `register` hỏng thì `close()` |
| `usecases/dispatchMirrorControl.ts` | `(deps: { registry }, sessionId, userId, rawBatch) → Result<number>`: `find` → `validateControlBatch` → `handle.control` |
| `domain/adb/entities/AdbDevice.ts` | thêm `autoSelectDevice(devices, current)` chuyển từ `LogcatPickerViewModel.autoSelect` (giữ nguyên ngữ nghĩa: chỉ tự chọn khi đúng một máy dùng được) |

Phi chức năng: mỗi file < 200 dòng; không `server-only`; không import ngoài `core/` và `domain/adb`.

## Architecture

```
domain/device-mirror/
├── entities/        MirrorRequest, MirrorVideoPacket, MirrorStreamEvent, mirrorFrameCodec,
│                    MirrorControlMessage, touchMapping (+ *.test.ts)
├── repositories/    MirrorDeviceGateway (server), MirrorRepository (trình duyệt), MirrorVideoSink (trình duyệt)
├── usecases/        startMirrorSession, dispatchMirrorControl (+ *.test.ts)
├── ControlOutbox.ts (+ test)
└── MirrorSessionRegistry.ts (+ test)
```

Luồng dữ liệu: trình duyệt `MirrorRepository.stream` → route → `startMirrorSession` → `gateway.start` → `packets()` → `encodeMirrorEvent` → dây → `MirrorFrameReader` → `MirrorVideoSink.push`. Ngược lại: Screen → intent → VM → `MirrorRepository.sendControl` → (`ControlOutbox` trong adapter) → route → `dispatchMirrorControl` → `handle.control` → Tango.

## Related Code Files

Tạo: toàn bộ cây trên (14 file + 9 test).
Sửa: `src/domain/adb/entities/AdbDevice.ts`, `src/domain/adb/entities/AdbDevice.test.ts`, `eslint.config.mjs` (thêm một khối vào `layerBoundaries`).
Xoá: không.

## Implementation Steps

1. **GitNexus trước khi sửa symbol cũ:** `node .gitnexus/run.cjs analyze --index-only`; rồi `impact "layerBoundaries" --direction upstream`, `impact "parseDevicesOutput"` (file `AdbDevice.ts`). Kết quả degraded/UNKNOWN → xác nhận bằng `grep -rn "layerBoundaries\|autoSelect" src eslint.config.mjs` và ghi vào báo cáo phase.
2. `eslint.config.mjs`: thêm khối `files: ['src/core/**', 'src/domain/**', 'src/features/**', 'src/ui/**', 'src/app/**']` với `patterns: [{ group: ['@yume-chan/*'], message: 'Thư viện scrcpy/adb là HIỆN THỰC của cổng, chỉ được import trong data/. Đưa qua cổng ở domain/device-mirror/repositories.' }]`. Thử import sai một chỗ → `pnpm lint` phải chặn → hoàn tác.
3. Viết entity theo bảng trên, bình luận tiếng Việt nói *vì sao* (ví dụ: vì sao 0 = gốc, vì sao trần 16 MiB, vì sao không cho trình duyệt khai kích cỡ).
4. `mirrorFrameCodec`: reader giữ một đệm `Uint8Array` nối dần; vòng `while` tách mọi khung trọn vẹn; phần dở dang chờ mẩu sau. Test: round-trip từng kind; hai khung trong một mẩu; một khung bị cắt ở giữa header và ở giữa payload; payload vượt trần.
5. `MirrorControlMessage.validateControlBatch`: mọi nhánh sai đều `validation`; test NaN/Infinity/âm/quá 64/khoá lạ/text 301 ký tự/ký tự điều khiển.
6. `ControlOutbox`: test kịch bản kéo (down, 10 move, up → 3 thông điệp), hai pointer đan xen, move sau up không bị gộp với move trước up.
7. `MirrorSessionRegistry`: test trùng serial → `conflict`; sai chủ → `forbidden`; release rồi register lại được.
8. Use case với gateway/registry giả: `startMirrorSession` đóng handle khi register hỏng; `dispatchMirrorControl` không gọi `control` khi batch sai.
9. `autoSelectDevice`: chuyển hàm + test 3 trường hợp (0/1/2 máy dùng được, giữ máy đang chọn nếu còn dùng được). `LogcatPickerViewModel` đổi sang dùng hàm này ở phase 05 (cùng người sở hữu file).
10. `pnpm typecheck && pnpm test && pnpm lint`.

## Todo List

- [x] GitNexus re-index + impact `layerBoundaries`, `AdbDevice.ts`; ghi kết quả
- [x] Luật ESLint cấm `@yume-chan/*` ngoài `data/`, đã thử phá
- [x] `MirrorRequest` + `normalizeMirrorRequest` + test
- [x] `MirrorVideoPacket` (doc header scrcpy đúng), `MirrorStreamEvent`
- [x] `mirrorFrameCodec` + test cắt mẩu/trần (tách thêm `mirrorFramePayloads.ts` — xem báo cáo)
- [x] `MirrorControlMessage` + `MIRROR_KEYCODES` + `validateControlBatch` + test (tách `validateControlBatch` sang `validateMirrorControlBatch.ts` — xem báo cáo)
- [x] `touchMapping` + test
- [x] `ControlOutbox` + test
- [x] `MirrorSessionRegistry` + test
- [x] Ba cổng
- [x] Hai use case + test
- [x] `autoSelectDevice` + test
- [x] typecheck/test/lint xanh

## Success Criteria

- `pnpm test` có ≥ 9 file test mới, tất cả xanh, không cần thiết bị.
- `pnpm lint` chặn `import … from '@yume-chan/scrcpy'` trong `src/domain/**` và `src/features/**`.
- Không file nào trong `domain/device-mirror` import Node, Tango, React.

## Risk Assessment

| Rủi ro | Giảm nhẹ |
|---|---|
| Kiểu `MirrorDeviceSession` không khớp cách Tango thật trả stream (bigint, Consumable) | Cổng chỉ dùng kiểu web chuẩn (`AsyncIterable<MirrorVideoPacket>`); adapter phase 03 chuyển đổi |
| `bigint` trong `pts` gây lỗi khi ai đó `JSON.stringify` sự kiện để debug | Doc comment cảnh báo; `encodeMirrorEvent` là đường duy nhất ra dây |
| Quá nhiều enum → UI rối | Ba enum, mỗi enum ≤ 4 giá trị, đều có mặc định |

## Security Considerations

- Mọi thứ từ trình duyệt đi qua `normalizeMirrorRequest` / `validateControlBatch` trước khi tới Tango; không có nhánh nào nhận chuỗi tự do trừ `text` (đã giới hạn độ dài và lọc ký tự điều khiển).
- `find(id, userId)` phân biệt `notFound` và `forbidden` để route trả mã đúng; cả hai không mang `detail` xuống trình duyệt (`lib/api/response.ts` đã lọc).

## Next Steps

- Phase 03 hiện thực `MirrorDeviceGateway`; phase 04 hiện thực `MirrorRepository` + `MirrorVideoSink`; phase 05 dựng VM với fake của ba cổng này — cả ba chỉ cần file phase này.
