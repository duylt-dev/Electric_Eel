# Phase 06 — Điều khiển: chạm/cuộn/phím/gõ chữ/xoay/màn hình/chụp PNG

**Ước lượng:** 8h · **Ưu tiên:** P2 (bỏ hẳn nếu chọn "chỉ xem") · **Trạng thái:** pending
**File ownership:** `src/features/device-mirror/components/{MirrorSurface,MirrorControls,TextInjector}.tsx`, `src/features/device-mirror/DeviceMirrorViewModel.ts` + `.test.ts` (nhánh control), `src/features/device-mirror/pointerToTouch.ts` + test, `src/data/device-mirror/tangoControl.ts` (chỉnh theo thực tế), `src/app/api/adb/mirror/control/route.ts` (chỉnh).
**Phụ thuộc:** 03 (route control), 04 (`sendControl`), 05 (Screen/VM).

## Context Links

- Phase 02: `MirrorControlMessage`, `MIRROR_KEYCODES`, `toDevicePoint`, `ControlOutbox`; phase 03: `tangoControl.ts`; phase 04: `sendControl` gộp tuần tự.
- `docs/architecture.md` §2 "Không `useState` cho dữ liệu nghiệp vụ" — trạng thái pointer đang giữ là UI thuần, giữ bằng `useRef` trong component.
- scrcpy desktop làm mẫu: chuột trái = chạm, chuột phải = BACK, chuột giữa = HOME, lăn = cuộn.

## Overview

Nối cử chỉ trên canvas và các nút thành `MirrorControlMessage`, đi qua VM → `sendControl`. Server đã có bảng ánh xạ (phase 03). Thêm chụp PNG từ sink và ô gõ chữ. Đo trễ điều khiển thật và ghi kết quả; nếu p95 > 100ms thì kích hoạt dự phòng (WebSocket qua custom server) — **chưa làm** ở đây, chỉ đo.

## Key Insights

- Toạ độ chuẩn hoá tính ở component (`pointerToTouch.ts`, hàm thuần trong `features/` vì nó biết `DOMRect` — không thuộc domain): `nx = (clientX - rect.left) / rect.width`, kẹp `[0,1]`. Canvas có `aspect-ratio` đúng bằng khung nên không có letterbox → ánh xạ tuyến tính. Nếu sau này thêm letterbox phải sửa đúng một hàm.
- `pointerId` của trình duyệt là số lớn, scrcpy cần id nhỏ ổn định → bảng `Map<pointerId, 0..9>` trong component, xoá khi `up/cancel`; chuột luôn là `0`.
- `pointercancel`/`pointerleave` khi đang giữ → gửi `up` để máy không kẹt ở trạng thái "đang chạm".
- Phím: mỗi nút gửi `down` rồi `up` (hai thông điệp trong cùng lô, outbox không gộp `key`). Power dùng keycode 26 (khoá máy). "Tắt màn hình" riêng = `displayPower off` (máy vẫn stream — QA dùng để chạy lâu không sáng màn). `displayOn` trong State là **ước lượng** theo lệnh vừa gửi, không đọc từ máy; ghi rõ trong tooltip.
- Gõ chữ: `injectText` chỉ tin cậy với ASCII → chữ có dấu đi bằng `setClipboard(paste=true)` (server tự chọn). Ô nhập là `TextField` + nút "Gửi" + Enter; không bắt bàn phím toàn cục (xung đột phím tắt trình duyệt, IME).
- Chụp: `SnapshotRequested` → `deps.videoSink.snapshotPng()` → `DownloadFile`. Ảnh ở độ phân giải luồng (câu hỏi #3 trong `plan.md`).

## Requirements

- `pointerToTouch.ts`: `normalizePointer(e: { clientX; clientY }, rect: { left; top; width; height }) → { nx; ny }`; `wheelToScroll(deltaX, deltaY) → { dx; dy }` chuẩn hoá `[-1,1]` (chia 100, kẹp); test 4 góc + ngoài biên + wheel.
- `MirrorSurface`: `onPointerDown/Move/Up/Cancel/Leave`, `onWheel` (preventDefault), `onContextMenu` (preventDefault → `KeyTapped back`), chuột giữa → `KeyTapped home`; `touch-action: none`, `user-select: none`; chỉ hoạt động khi `canControl`; con trỏ `crosshair` khi điều khiển được.
- `MirrorControls`: hàng nút icon: Back, Home, Recents (appSwitch), Volume −/+, Power, Xoay, Màn hình tắt/bật, Thông báo, Chụp PNG; tooltip nói hậu quả ("Power khoá máy — mở lại bằng nút Power lần nữa"); tắt khi `!canControl`.
- `TextInjector`: `TextField` `helperText="Chữ có dấu được dán qua clipboard của máy, chữ ASCII gõ trực tiếp."`, tối đa 300 ký tự, Enter gửi, nút Backspace/Enter riêng.
- VM: `TouchInput { action; pointer; nx; ny }` → `sendControl(sessionId, { type: 'touch', …, pressure: action==='up' ? 0 : 1 })`; `ScrollInput`; `KeyTapped { key }` → `down` + `up`; `TextSubmitted` → rỗng thì bỏ qua; `RotateRequested`; `DisplayPowerToggled` → gửi `displayPower !displayOn` rồi `displayOn` đảo; `NotificationsRequested`; `SnapshotRequested`. Lỗi `sendControl` ≠ `cancelled`/`notFound` → ShowMessage (không đổi `status`; luồng video sẽ tự báo nếu phiên chết).
- `ControlToggled` (phase 05) tắt/bật `control` khi mở lại luồng; khi `controlEnabled=false` server khởi động scrcpy với `control: false` → không có socket control → mọi thông điệp bị từ chối tại VM bằng `canControl`.

## Architecture

```
MirrorSurface (pointer/wheel) ─ normalizePointer ─▶ onIntent(TouchInput/ScrollInput)
MirrorControls (nút) ─▶ onIntent(KeyTapped/RotateRequested/DisplayPowerToggled/SnapshotRequested/…)
TextInjector ─▶ onIntent(TextSubmitted)
DeviceMirrorViewModel ─ canControl? ─▶ deps.mirror.sendControl(sessionId, MirrorControlMessage)
   └─ SnapshotRequested ─▶ deps.videoSink.snapshotPng() ─▶ emit DownloadFile
HttpMirrorRepository.sendControl ─ ControlOutbox ─ 1 POST đang bay ─▶ /api/adb/mirror/control
route ─ dispatchMirrorControl ─ applyControl(writer, size) ─▶ scrcpy-server
```

## Related Code Files

Tạo: `src/features/device-mirror/pointerToTouch.ts` + `.test.ts`, `src/features/device-mirror/components/MirrorControls.tsx`, `src/features/device-mirror/components/TextInjector.tsx`.
Sửa: `MirrorSurface.tsx`, `DeviceMirrorScreen.tsx`, `DeviceMirrorViewModel.ts` + test, `DeviceMirrorContract.ts` (chỉ khi Intent thiếu), `src/data/device-mirror/tangoControl.ts` (theo thực tế), `src/app/api/adb/mirror/control/route.ts` (nếu cần).
Xoá: không.

## Implementation Steps

1. `pointerToTouch.ts` + test.
2. `MirrorSurface` thêm handlers + bảng pointer id + `up` khi cancel/leave.
3. `MirrorControls`, `TextInjector`; gắn vào Screen dưới/bên cạnh Surface (bố cục: Surface trái, cột nút phải trên màn rộng; xếp dọc trên màn hẹp).
4. VM: các nhánh Intent + test với fake `sendControl` ghi lại thông điệp: kéo down→move→up ra ba thông điệp đúng thứ tự; `KeyTapped` ra `down`+`up`; `TextSubmitted` rỗng không gọi; `SnapshotRequested` khi sink trả `err` → ShowMessage; `DisplayPowerToggled` đảo `displayOn`.
5. Kiểm với máy thật: chạm mở app, kéo cuộn danh sách, vuốt về, chuột phải = Back, lăn cuộn, các nút, xoay (canvas đổi tỉ lệ), tắt màn hình (hình vẫn chảy), gõ "hello" và "xin chào" vào ô tìm kiếm trên máy, chụp PNG mở được.
6. **Đo trễ:** (a) Network tab: thời gian POST control p50/p95 khi kéo 10s; (b) quay video màn máy + màn trình duyệt ở 60fps, đếm khung giữa lúc chuột bấm và lúc máy phản ứng (thô nhưng đủ). Ghi vào `reports/control-latency.md` với quyết định: giữ POST hay mở nhánh WebSocket.
7. `pnpm typecheck && pnpm test && pnpm lint`.

## Todo List

- [ ] `pointerToTouch` + test
- [ ] `MirrorSurface` pointer/wheel/context menu, `touch-action: none`
- [ ] `MirrorControls`, `TextInjector`
- [ ] VM nhánh control + test
- [ ] Kịch bản tay đủ 10 mục ở bước 5
- [ ] `reports/control-latency.md` + quyết định dự phòng
- [ ] typecheck/test/lint xanh

## Success Criteria

- Kéo trên canvas cuộn danh sách trên máy mượt, không "nhảy" thứ tự (không có `up` đến trước `move`).
- Chữ có dấu xuất hiện đúng trên máy.
- PNG mở được, đúng khung đang thấy.
- Trễ điều khiển p95 ≤ 100ms trên localhost; nếu không, báo cáo nêu rõ số và đề xuất.

## Risk Assessment

| Rủi ro | Giảm nhẹ |
|---|---|
| Samsung không cho `setClipboard paste` ở một số ô nhập | Thử; nếu hỏng, thông điệp `text` non-ASCII → ShowMessage "Máy không dán được" và ghi vào §11 |
| `rotateDevice()` không có tác dụng khi máy đang tự xoay | Tooltip nói rõ; không coi là lỗi |
| Pointer bị kẹt (mất `up`) khi tab mất focus | `pointercancel`/`blur` → gửi `up` cho mọi pointer đang giữ |
| `requireUser()` mỗi lô làm p95 tăng | Đo; nới nhịp gộp ở adapter (ví dụ tối thiểu 16ms giữa hai lô) trước khi nghĩ tới WebSocket |

## Security Considerations

- Mọi thông điệp qua `validateControlBatch` ở server; `text` ≤ 300, không ký tự điều khiển; keycode chỉ từ allowlist 9 phím (không có phím "Settings"/"Camera"…).
- Không có đường dẫn `startApp` hay tham số shell nào từ trình duyệt.

## Next Steps

- Phase 07 hardening + docs; nếu trễ vượt ngưỡng, mở plan riêng cho WebSocket (custom server) thay vì kéo vào PR này.
