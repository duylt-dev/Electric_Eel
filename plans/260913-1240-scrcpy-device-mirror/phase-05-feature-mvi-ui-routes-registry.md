# Phase 05 — Feature MVI + Screen + picker + `adb-common` + route + `toolRegistry`

**Ước lượng:** 9h (chỉ xem: 8h — bỏ pointer/phím trên Surface; các nút điều khiển thuộc phase 06) · **Ưu tiên:** P1 · **Trạng thái:** done
**File ownership:** `src/features/device-mirror/**`, `src/features/mirror-picker/**`, `src/features/adb-common/**`, `src/features/logcat-picker/**` (chỉ đổi import + dùng `autoSelectDevice`), `src/app/(app)/mirror/**`, `src/ui/layout/toolRegistry.tsx`.
**Phụ thuộc:** phase 02 (VM + test chạy với fake); tích hợp thật cần 03 + 04.

## Context Links

- `docs/architecture.md` §1 tám luật, §2 cấu trúc, §5 giao diện (`PageHeader` bắt buộc, `helperText` nói hậu quả, `tone` theo hậu quả), §7 test ViewModel không render.
- Tiền lệ: `src/features/adb-logcat/*` (VM giữ luồng trong `onStart`, `intentKey` STREAM_KEY, `DownloadLog` effect, `createDependencies` ném lỗi vì cần serial), `src/features/logcat-picker/*` (Root/Screen/VM chọn máy, `OpenLogcat` effect), `src/app/(app)/logcat/[package]/page.tsx` (kiểm URL ở cửa, `key` theo serial), `src/ui/layout/toolRegistry.tsx`.
- `src/core/mvi/defineViewModel.tsx` dòng 61–77 — mẫu tạo lại instance khi StrictMode dispose; Root dùng cùng mẫu cho sink.

## Overview

Hai màn hình: `/mirror` chọn máy (VM nhỏ, dùng lại `DeviceList` và `autoSelectDevice`), `/mirror/[serial]` mirror. Màn mirror: State thuần dữ liệu; VM mở luồng trong `onStart`, đẩy gói vào sink, cập nhật kích cỡ, xử lý dừng/chạy lại/đổi chất lượng. Điều khiển (chạm, phím, gõ, xoay, chụp) là phase 06 nhưng Intent/Effect của chúng khai sẵn ở Contract phase này để `switch` vét cạn không phải sửa hai lần.

## Key Insights

- **`DeviceList` phải rời `logcat-picker`** nhưng không được vào `ui/components` (nó import `AdbDevice`). Mẫu mới: `features/adb-common/components/` — mảnh UI dùng chung *trong một họ công cụ*, được biết domain của họ đó. Ghi vào `LLM.md` §3 và §5 (phase 07). Tương đương module `:feature:adb-common` bên Android.
- Canvas không đi qua Intent/State: Root tạo sink từ `clientContainer.deviceMirror.createVideoSink()`, truyền `sink` vào deps và `sink.canvas` vào Screen qua prop. `MirrorSurface` chỉ `appendChild` canvas vào một `div` qua ref callback và đặt CSS `aspect-ratio` từ `state.frameSize`.
- `sessionId` là dữ liệu → trong State (chuỗi). `frameSize` đến từ sự kiện `meta`/`size` của luồng, không từ decoder → VM biết xoay mà không nghe DOM.
- Đổi chất lượng = dừng + mở lại luồng (cùng `intentKey` `stream` nên lượt cũ tự huỷ) — không có API "đổi tham số giữa chừng".
- Chỉ **một** máy/tab: `key={serial}` ở page dựng lại VM + sink khi đổi serial (mẫu logcat).

## Requirements

### `features/mirror-picker/` (chọn máy)
- Contract: `{ status: 'loading'|'ready'|'failed'; devices; selectedSerial; error }`; Intent `DevicesRefreshRequested | DeviceSelected | MirrorOpened`; Effect `ShowMessage | OpenMirror { serial }`; dẫn xuất `usableDevices`.
- VM: `onStart` nạp máy; `autoSelectDevice`; `MirrorOpened` không có serial → thông báo; `intentKey` chung `'adb'`; `createDependencies: () => ({ adb: clientContainer.adb })`.
- Screen: `PageHeader eyebrow="Màn hình máy" title="Chọn máy"`, `DeviceList`, nút "Mở màn hình", Snackbar. Root như `LogcatPickerRoot`.

### `features/device-mirror/`
- `DeviceMirrorContract.ts`:
  - `MirrorStatus = 'connecting' | 'streaming' | 'stopped' | 'failed' | 'unsupported'`
  - State: `serial; status; sessionId: string|null; deviceName: string|null; frameSize: { width; height } | null; quality: { maxSize; maxFps; bitRateMbps }; controlEnabled: boolean; displayOn: boolean; error: AppError|null`
  - Intent: `StreamRequested | StreamStopped | QualityChanged { quality } | ControlToggled { enabled }` (+ phase 06: `TouchInput | ScrollInput | KeyTapped { key } | TextSubmitted { text } | RotateRequested | DisplayPowerToggled | NotificationsRequested | SnapshotRequested`)
  - Effect: `ShowMessage | DownloadFile { fileName; bytes: Uint8Array; mimeType }`
  - Dẫn xuất: `isLive(state)`, `aspectRatio(state): number|null`, `canControl(state)` (= streaming ∧ controlEnabled ∧ sessionId), `snapshotFileName(serial, at)` → `mirror-<serial>-YYYYMMDD-HHMM.png`, `qualityLabel(q)`.
- `DeviceMirrorViewModel.ts`: deps `{ mirror: MirrorRepository; videoSink: MirrorVideoSink; serial: string }`; `onStart`: nếu `!videoSink.supported` → `status: 'unsupported'` + ShowMessage "Trình duyệt không hỗ trợ WebCodecs; dùng Chrome/Edge 94+"; ngược lại `stream()`. `stream()`: `connecting` → `deps.mirror.stream({ serial, ...quality, control }, onEvent, ctx.signal)`; `meta` → `streaming` + `sessionId` + `deviceName` + `frameSize`; `video` → `deps.videoSink.push`; `size` → `frameSize`; kết thúc bình thường → `stopped`; lỗi ≠ cancelled → `failed` + ShowMessage. `intentKey`: `StreamRequested/StreamStopped/QualityChanged/ControlToggled` → `'stream'`; còn lại `undefined`. `createDependencies` ném lỗi như `AdbLogcatViewModel` (cần serial + sink); export `deviceMirrorDeps(serial, sink)`.
- `DeviceMirrorScreen.tsx`: `PageHeader eyebrow="Màn hình máy" title={deviceName ?? serial}` meta: `MetaChip "kích cỡ"`, `"trạng thái"` (StatusChip tone: streaming=ok, connecting=info, failed=bad, stopped=neutral, unsupported=bad); actions: nút Dừng/Chạy lại; `QualityBar` (ba `Select` với `helperText` nói hậu quả: "Cao hơn = nét hơn nhưng trễ hơn trên máy yếu"; "Đổi sẽ nối lại luồng"); `MirrorSurface canvas={canvas} aspect={aspectRatio(state)} live={isLive(state)}`; Alert lỗi; Snackbar; effect `DownloadFile` → Blob → `<a download>`.
- `components/MirrorSurface.tsx`: `div` chứa canvas; ref callback `appendChild`; CSS: `max-width: 100%`, `max-height: calc(100dvh - 240px)`, `aspect-ratio`, `background: m3('surfaceContainerLowest')`, bo góc `m3Shape.large`; lớp phủ mờ "Đang nối…" khi `connecting`. Phase 06 thêm pointer handlers.
- `components/QualityBar.tsx`.
- `DeviceMirrorRoot.tsx`: `useState(() => clientContainer.deviceMirror.createVideoSink())` + `useEffect` cleanup `dispose()` + tạo lại nếu `disposed` (mẫu `defineViewModel.tsx`); `<DeviceMirrorViewModel.Provider deps={deviceMirrorDeps(serial, sink)}><DeviceMirrorScreen canvas={sink.canvas} /></Provider>`.

### Route + registry
- `src/app/(app)/mirror/page.tsx`: `requireUser` → `serverContainer.adb.settings()` → `serverContainer.deviceMirror.settings()` (Alert warning nếu hỏng, **trước** khi người dùng chờ danh sách) → `<MirrorPickerRoot />`. `metadata.title = 'Màn hình máy'`.
- `src/app/(app)/mirror/[serial]/page.tsx`: cùng hai kiểm; `decodeURIComponent(serial)` → `isSafeSerial` sai → Alert + `LinkButton href="/mirror"`; `<DeviceMirrorRoot key={serial} serial={serial} />`. `generateMetadata` → `Màn hình máy · <serial>`.
- `toolRegistry.tsx`: thêm sau `logcat`: `{ id: 'mirror', label: 'Màn hình máy', description: 'Xem và điều khiển màn hình thiết bị Android đang cắm, ngay trong trình duyệt.', href: '/mirror', icon: ScreenshotMonitorIcon (hoặc PhonelinkIcon), status: 'available', audiences: ['product'] }`.

### `adb-common` + logcat-picker
- Chuyển `src/features/logcat-picker/components/DeviceList.tsx` → `src/features/adb-common/components/DeviceList.tsx` (không đổi nội dung). `LogcatPickerScreen` đổi import. `LogcatPickerViewModel` xoá `autoSelect` cục bộ, dùng `autoSelectDevice` từ domain.

## Architecture

```
app/(app)/mirror/page.tsx ── MirrorPickerRoot ── MirrorPickerViewModel ── clientContainer.adb.listDevices
                                └─ Screen ── adb-common/DeviceList ── OpenMirror → router.push(/mirror/<serial>)

app/(app)/mirror/[serial]/page.tsx ── DeviceMirrorRoot(key=serial)
   ├─ sink = createVideoSink()                 (data, giữ canvas + decoder)
   ├─ Provider deps={ mirror, videoSink: sink, serial }
   └─ DeviceMirrorScreen canvas={sink.canvas}
        ├─ PageHeader / QualityBar / MirrorSurface(canvas) / Snackbar
        └─ useEffects: ShowMessage → toast; DownloadFile → <a download>
DeviceMirrorViewModel.onStart → mirror.stream → onEvent: meta/size → setState; video → sink.push
```

## Related Code Files

Tạo:
- `src/features/mirror-picker/{MirrorPickerContract,MirrorPickerViewModel,MirrorPickerScreen,MirrorPickerRoot}.ts(x)` + `MirrorPickerViewModel.test.ts`
- `src/features/device-mirror/{DeviceMirrorContract,DeviceMirrorViewModel,DeviceMirrorScreen,DeviceMirrorRoot}.ts(x)` + `DeviceMirrorContract.test.ts` + `DeviceMirrorViewModel.test.ts`
- `src/features/device-mirror/components/{MirrorSurface,QualityBar}.tsx`
- `src/features/adb-common/components/DeviceList.tsx` (chuyển)
- `src/app/(app)/mirror/page.tsx`, `src/app/(app)/mirror/[serial]/page.tsx`

Sửa: `src/features/logcat-picker/LogcatPickerScreen.tsx` (import), `src/features/logcat-picker/LogcatPickerViewModel.ts` (`autoSelectDevice`), `src/ui/layout/toolRegistry.tsx`.
Xoá: `src/features/logcat-picker/components/DeviceList.tsx`.

## Implementation Steps

1. **GitNexus:** `impact "DeviceList"`, `impact "TOOLS"`, `impact "LogcatPickerViewModel"` (re-index trước; degraded → grep và ghi). `DeviceList` chỉ có một người gọi (`LogcatPickerScreen`) — xác nhận bằng grep rồi mới `git mv`.
2. Chuyển `DeviceList`, sửa import, thay `autoSelect` → `autoSelectDevice`; `pnpm typecheck && pnpm lint` xanh; mở `/logcat` kiểm không đổi hành vi.
3. `mirror-picker`: Contract → VM → test (fake `AdbRepository`: 0/1/2 máy; `MirrorOpened` khi chưa chọn) → Screen → Root.
4. `DeviceMirrorContract` + test dẫn xuất (`aspectRatio` null khi chưa có size; `snapshotFileName` định dạng; `canControl` từng nhánh).
5. `DeviceMirrorViewModel` + test với fake `MirrorRepository` (phát `meta`, `video`, `size`, kết thúc; lỗi) và fake `MirrorVideoSink` (đếm `push`, `supported=false`): streaming sau `meta`; `frameSize` đổi sau `size`; `unsupported` không gọi `stream`; `StreamStopped` → `stopped`; `QualityChanged` → mở lại với quality mới (fake ghi lại request).
6. Screen + `MirrorSurface` + `QualityBar` + Root theo Requirements. Không `useState` cho dữ liệu nghiệp vụ; chỉ toast cục bộ.
7. Hai page + `toolRegistry`.
8. Chạy thật với máy: vào `/mirror` → thấy máy → mở → hình chạy; đổi chất lượng → nối lại; đóng tab → server dọn; xoay máy bằng tay → canvas đổi tỉ lệ.
9. `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.

## Todo List

- [x] GitNexus impact `DeviceList`, `TOOLS`, `LogcatPickerViewModel`
- [x] `adb-common/DeviceList` + `autoSelectDevice` trong logcat-picker; `/logcat` vẫn đúng
- [x] `mirror-picker` Contract/VM/test/Screen/Root
- [x] `DeviceMirrorContract` + test
- [x] `DeviceMirrorViewModel` + test (fake repo + fake sink)
- [x] `MirrorSurface`, `QualityBar`, `DeviceMirrorScreen`, `DeviceMirrorRoot` (StrictMode-safe)
- [x] Hai page có `PageHeader`, kiểm URL ở cửa, `key={serial}`
- [x] `toolRegistry` mục `mirror`
- [ ] Kịch bản tay: mở/dừng/đổi chất lượng/xoay/đóng tab — CHƯA kiểm được bằng mắt (không có tài khoản đăng nhập); chỉ kiểm được auth-gate qua curl. Xem `reports/phase-05-report.md`
- [x] typecheck/test/lint xanh; `build` cố ý bỏ (xem báo cáo)

## Success Criteria

- Menu "Khối sản xuất" có "Màn hình máy"; `/mirror` liệt kê máy; `/mirror/<serial>` hiện hình trong ≤ 2s.
- VM test: ≥ 8 test, không render.
- ESLint: VM không import React/MUI/router/data/Tango; Screen không import data.
- Xoay máy → `frameSize` đổi → canvas đổi tỉ lệ, hình không méo.

## Risk Assessment

| Rủi ro | Giảm nhẹ |
|---|---|
| StrictMode dispose sink rồi dùng lại → canvas trống | Root tạo lại sink khi `disposed`, đúng mẫu `defineViewModel.tsx` |
| Canvas do sink tạo bị React tháo khi re-render | `MirrorSurface` chỉ `appendChild` một lần trong ref callback, không render con nào khác trong `div` ấy |
| Tên nhãn menu chưa được chốt | Câu hỏi #2 trong `plan.md`; đổi một chuỗi trong `toolRegistry` |
| `max-height` làm canvas nhỏ trên màn thấp | Dùng `100dvh`; cho phép cuộn trang nếu cần |

## Security Considerations

- Page kiểm `requireUser`, `isSafeSerial`, hai `settings()` trước khi dựng client component.
- Screen không bao giờ gửi chuỗi tự do xuống ngoài `text` (phase 06, đã giới hạn).

## Next Steps

- Phase 06 thêm pointer/phím vào `MirrorSurface` + `MirrorControls` + `TextInjector`; phase 07 cập nhật `LLM.md` §3/§5/§7 cho `adb-common`, route mới, quyền.
