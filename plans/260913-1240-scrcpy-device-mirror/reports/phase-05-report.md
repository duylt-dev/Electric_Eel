---
title: "Phase 05 — Báo cáo: feature MVI + Screen + picker + adb-common + route + toolRegistry"
date: 2026-09-13
---

# Trạng thái: done

`pnpm typecheck && pnpm test && pnpm lint` — xanh cho TOÀN BỘ repo (phase 03 đã
xong song song trong lúc tôi làm — không còn lỗi `TangoMirrorGateway.ts` như
phase 04 từng ghi). `pnpm build` cố ý BỎ — xem mục 7.

## 1. GitNexus trước khi sửa/chuyển file có sẵn

```
impact "DeviceList" --direction upstream   → risk LOW, impactedCount 3, 1 caller trực tiếp
  (LogcatPickerPage → LogcatPickerRoot → LogcatPickerScreen) — khớp impact-baseline.md.
impact "TOOLS" --direction upstream        → UNKNOWN → grep "\bTOOLS\b" src: chỉ 3 dòng,
  đều trong chính toolRegistry.tsx (khai báo + 2 chỗ dùng nội bộ) → an toàn thêm mục.
impact "LogcatPickerViewModel" --direction upstream → UNKNOWN → grep: chỉ dùng trong
  LogcatPickerScreen.tsx và LogcatPickerRoot.tsx (cùng feature, cùng ownership) → an toàn.
```

Chuyển `DeviceList` bằng `git mv src/features/logcat-picker/components/DeviceList.tsx
src/features/adb-common/components/DeviceList.tsx` — `git diff --stat` giữa hai
đường dẫn rỗng, xác nhận nội dung không đổi một byte.

## 2. File tạo

- `src/features/mirror-picker/MirrorPickerContract.ts` — 51 dòng
- `src/features/mirror-picker/MirrorPickerViewModel.ts` — 111 dòng
- `src/features/mirror-picker/MirrorPickerScreen.tsx` — 130 dòng
- `src/features/mirror-picker/MirrorPickerRoot.tsx` — 19 dòng
- `src/features/mirror-picker/MirrorPickerViewModel.test.ts` — 100 dòng, 5 test case
- `src/features/device-mirror/DeviceMirrorContract.ts` — 125 dòng
- `src/features/device-mirror/DeviceMirrorViewModel.ts` — 183 dòng
- `src/features/device-mirror/DeviceMirrorScreen.tsx` — 178 dòng
- `src/features/device-mirror/DeviceMirrorRoot.tsx` — 73 dòng
- `src/features/device-mirror/DeviceMirrorContract.test.ts` — 72 dòng, 10 test case
- `src/features/device-mirror/DeviceMirrorViewModel.test.ts` — 238 dòng, 10 test case
- `src/features/device-mirror/components/MirrorSurface.tsx` — 89 dòng
- `src/features/device-mirror/components/QualityBar.tsx` — 99 dòng
- `src/app/(app)/mirror/page.tsx` — 40 dòng
- `src/app/(app)/mirror/[serial]/page.tsx` — 66 dòng

## 3. File chuyển (`git mv`, nội dung nguyên vẹn)

- `src/features/logcat-picker/components/DeviceList.tsx` → `src/features/adb-common/components/DeviceList.tsx` (93 dòng)

## 4. File sửa

- `src/features/logcat-picker/LogcatPickerScreen.tsx` — đổi 1 import (`DeviceList` từ `@/features/adb-common/components/DeviceList`), 207 dòng (208 trước khi sửa — đã VƯỢT 200 dòng từ trước phase này, không phải do phase 05 gây ra; không đụng thêm gì khác trong file nên không rơi vào phạm vi phải tách nhỏ ở đây)
- `src/features/logcat-picker/LogcatPickerViewModel.ts` — xoá hàm `autoSelect` cục bộ (14 dòng kể cả JSDoc), dùng `autoSelectDevice` từ `@/domain/adb/entities/AdbDevice`, 170 dòng
- `src/ui/layout/toolRegistry.tsx` — thêm import `ScreenshotMonitorIcon` + 1 entry `mirror` sau `logcat`, 175 dòng (không sửa gì khác — `git diff` xác nhận)

## 5. Icon MUI đã chọn

`ScreenshotMonitorIcon` (`@mui/icons-material/ScreenshotMonitor`) — cả hai lựa
chọn gợi ý (`ScreenshotMonitor`, `Phonelink`) đều tồn tại trong package đã cài;
chọn cái đầu vì tên sát nghĩa "xem màn hình máy" hơn `Phonelink` (vốn thường
dùng cho ghép nối/đồng bộ thiết bị).

## 6. Test — 25 test case mới trong 3 file test mới

| File | Test case |
|---|---|
| `MirrorPickerViewModel.test.ts` | 5 (0/1/2 máy, `MirrorOpened` chưa chọn → `ShowMessage`, đã chọn → `OpenMirror`) |
| `DeviceMirrorContract.test.ts` | 10 (`aspectRatio` 2, `snapshotFileName` 2, `canControl` 4, `qualityLabel` 2) |
| `DeviceMirrorViewModel.test.ts` | 10 (unsupported, meta, video, size, ok→stopped, lỗi khác cancelled→failed, lỗi cancelled→giữ nguyên, `StreamStopped`, `QualityChanged`, `ControlToggled`) |

`pnpm test`: **308/308 xanh**, 77 suite (283 của phase 02–04 + 25 mới).

Điểm kỹ thuật đáng chú ý trong `DeviceMirrorViewModel.test.ts`: fake
`MirrorRepository.stream()` nhận một "kịch bản" gồm `events` + `outcome`, với
`outcome: 'pending'` là một khả năng ĐẶC BIỆT (trả về một `Promise` không bao
giờ resolve trong đời test) — dùng cho ba test (`meta`, `video`, `size`) cần
đọc state NGAY GIỮA phiên, trước khi luồng "kết thúc bình thường" tự đưa status
về `stopped`. Không có nhánh này thì `settle()` (một `setTimeout(0)`) đợi đủ
lâu để cả kịch bản CHẠY HẾT rồi resolve `ok(undefined)`, và assertion sẽ luôn
đọc trúng state cuối (`stopped`) thay vì state ngay sau sự kiện muốn kiểm — đây
chính là lỗi tôi gặp phải ở lượt chạy test đầu tiên (xem mục 8).

## 7. Khác biệt so với phase file / nhiệm vụ, và vì sao

1. **`DeviceMirrorRoot` tạo sink trong `useEffect`, KHÔNG trong
   `useState(() => …)`.** Phase-04 report gợi ý cả hai cách ("đọc `sink.disposed`
   theo mẫu `instance.isDisposed`" HOẶC "đơn giản hơn: luôn tạo sink mới trong
   effect mount"). Tôi buộc phải chọn cách thứ hai vì lý do KHÔNG có trong ghi
   chú gốc: `WebCodecsVideoSink` gọi `document.createElement('canvas')` ngay
   trong hàm dựng, còn `'use client'` không có nghĩa component chỉ chạy trên
   trình duyệt — Next.js vẫn render nó trên máy chủ để dựng HTML lần đầu, nơi
   `document` không tồn tại. Initializer của `useState` chạy trong CẢ lượt
   render đó (kể cả SSR); `useEffect` thì không bao giờ chạy trên máy chủ. Dựng
   sink trong `useState` như bản nháp đầu tiên của tôi sẽ làm `/mirror/<serial>`
   500 ngay từ lần render đầu trên server.
2. **`setSink` bên trong `Promise.resolve().then(...)`, không gọi thẳng đồng bộ
   trong effect.** `eslint-plugin-react-hooks@7.1.1` (bản đi kèm React
   Compiler, cấu hình sẵn qua `next` trong `eslint.config.mjs`) có luật
   `react-hooks/set-state-in-effect` chặn CHÍNH XÁC pattern "gọi `setState`
   đồng bộ ngay trong thân effect" — đã xác minh bằng thực nghiệm (file dò
   tạm, xoá ngay sau khi xác nhận) rằng NGAY CẢ pattern "fetch/tạo-tài-nguyên
   lúc mount" đơn giản nhất cũng bị chặn nếu gọi `setState` đồng bộ, và dời qua
   một `.then()` là đủ để qua luật (đúng gợi ý trong chính thông điệp lỗi:
   "calling setState in a callback function"). `defineViewModel.tsx` (dòng
   61–77, mẫu gốc phase file yêu cầu bám theo) KHÔNG bị luật này bắt dù hình
   dạng gần như giống hệt — đã xác nhận bằng cách lint riêng file đó: lý do
   nhiều khả năng nhất là `Provider` ở đó là một hàm LỒNG bên trong
   `defineViewModel()` (một factory, không phải component top-level), nên
   trình phân tích của React Compiler bỏ qua nó (không đủ tin cậy để suy luận
   một component được tạo lại mỗi lần factory chạy). `DeviceMirrorRoot` là
   component export top-level nên bị phân tích đầy đủ. Không sửa
   `defineViewModel.tsx` (ngoài ownership) — chỉ đổi cách viết ở file của
   mình.
3. **`MirrorSurface` đặt kích cỡ canvas (`width/height/display: block`) bằng
   CSS `& canvas` của `div` cha, KHÔNG gán thẳng `canvas.style.*` như phase
   file mô tả ("Screen/MirrorSurface tự đặt style").** Cùng bộ luật React
   Compiler ở trên còn có `react-hooks/immutability`, chặn MỌI phép gán thuộc
   tính trực tiếp lên props/tham số hook — `canvas` là một prop, nên
   `canvas.style.width = '100%'` bị chặn dù đã thử alias qua biến cục bộ (đã
   thực nghiệm: alias không giúp gì, luật theo dõi luồng dữ liệu chứ không chỉ
   tên định danh). `el.appendChild(canvas)` (canvas chỉ là THAM SỐ của lời gọi
   trên `el`, không phải đối tượng bị mutate) thì KHÔNG bị chặn — đã thực
   nghiệm riêng để xác nhận trước khi chọn hướng CSS. Kết quả nhìn thấy được
   giống hệt yêu cầu gốc (canvas phủ kín `div` cha), chỉ khác đường đi.
4. **`requireUser()` hỏng → hiện `<Alert severity="error">`, KHÔNG `redirect()`
   thủ công**, dù nhiệm vụ mô tả "redirect như các page khác". Đã đọc đúng
   `logcat/page.tsx` (tiền lệ được chỉ định đọc) và `lib/session.ts`:
   `requireUser()` trả về `Result`, không tự redirect; việc chặn người chưa
   đăng nhập THẬT SỰ đã xảy ra sớm hơn, ở `(app)/layout.tsx` (gọi
   `redirect('/login')` trước khi bất kỳ page con nào chạy). Nhánh `!user.ok`
   trong page vì vậy là phòng thủ cho một tình huống hiếm (lỗi đọc DB giữa
   chừng), và `AdbLogcatPage`/`LogcatPickerPage` xử lý y hệt bằng Alert — làm
   đúng theo tiền lệ thật thay vì theo mô tả trong nhiệm vụ.
5. **`pnpm build` — BỎ, không chạy.** `next dev` đang chạy port 3000 dùng
   `distDir` mặc định `.next` (không có cấu hình `distDir` riêng trong
   `next.config.ts`) — `next build` sẽ ghi đè CÙNG thư mục `.next` mà dev
   server đang theo dõi, rủi ro làm hỏng cache của phiên dev đang chạy (ràng
   buộc cứng của nhiệm vụ: "KHÔNG kill, KHÔNG chạy next dev khác" — chạy build
   song song vào chung thư mục còn rủi ro hơn cả chạy thêm một dev server).
   `pnpm typecheck` toàn repo đã xanh nên điều kiện "chỉ chạy build nếu
   typecheck sạch" thoả, nhưng rủi ro thứ hai (làm hỏng dev server) lớn hơn lợi
   ích xác nhận build — chọn bỏ, đúng tinh thần "nếu vậy bỏ, ghi lại".

## 8. Sự cố trong lúc viết test, và cách sửa

Lượt chạy `pnpm test` đầu tiên: 1/308 fail (`sự kiện meta → streaming…`) —
`settle()` đợi đủ lâu để `stream()` giả chạy hết TOÀN BỘ kịch bản (chỉ có một
sự kiện `meta`) rồi tự kết thúc bình thường (`outcome: ok(undefined)`), nên
lúc assertion đọc state thì `status` đã bị ghi đè thành `'stopped'` chứ không
còn là `'streaming'` như mong đợi ngay sau sự kiện `meta`. Sửa bằng cách thêm
khả năng `outcome: 'pending'` cho `FakeMirrorRepository` (trả về một `Promise`
không bao giờ resolve sau khi phát hết sự kiện) — dùng cho 3 test cần đọc state
GIỮA phiên (`meta`, `video`, `size`). Sau khi sửa: `pnpm exec tsc --noEmit`
cũng bắt 2 lỗi kiểu (`noUncheckedIndexedAccess`) ở chính file test này
(`this.scripts[idx]` có thể `undefined` dù đã có `??` fallback, vì fallback
cũng là truy cập theo chỉ số) — sửa bằng `.at(-1)` + throw tường minh khi
`undefined`, và một lỗi kiểu `Uint8Array<ArrayBufferLike>` không gán được vào
`BlobPart` ở `DeviceMirrorScreen.tsx` (bọc lại bằng `new Uint8Array(effect.bytes)`
để có một bản sao với `ArrayBuffer` cụ thể, cùng vướng mắc TS đã ghi trong
phase-02-report.md mục 5.6).

## 9. Kiểm tay với máy thật `RF8Y60B9NCZ`

Không có tài khoản đăng nhập trong phiên làm việc này nên KHÔNG kiểm được kịch
bản mở/dừng/đổi chất lượng/xoay/đóng tab bằng mắt trên trình duyệt. Đã kiểm
được phần auth-gate qua `curl` (dev server đang chạy port 3000):

```
GET /mirror                → 307, Location: /login
GET /mirror/RF8Y60B9NCZ    → 307, Location: /login
GET /mirror/..%2Fx         → 307, Location: /login   (serial xấu vẫn qua auth trước, không 500)
GET /logcat                → 307, Location: /login   (không vỡ sau khi chuyển DeviceList)
```

Không đọc được log runtime của tiến trình `next dev` (chạy trong một
terminal/session khác, không truy cập được từ đây) — mục này KHÔNG bắt buộc
theo nhiệm vụ nên bỏ qua, không phải một khoảng trống ngoài dự kiến.

**Việc CẦN người dùng kiểm bằng mắt trên trình duyệt** (đăng nhập một tài
khoản hợp lệ trước):
1. Vào `/mirror` (menu "Khối sản xuất" → "Màn hình máy") — thấy danh sách máy,
   `RF8Y60B9NCZ` tự chọn nếu là máy USB duy nhất.
2. Bấm "Mở màn hình" — điều hướng sang `/mirror/RF8Y60B9NCZ`, hình xuất hiện
   trong khoảng vài giây (phụ thuộc phase 03 đã xong — xem `phase-03-report.md`).
3. Đổi một trong ba ô chất lượng (`QualityBar`) — luồng nối lại, `StatusChip`
   chuyển qua "đang nối" rồi "đang chảy".
4. Bật/tắt "Cho phép điều khiển" — luồng nối lại tương tự (chưa có thao tác
   chạm thật vì đó là phase 06).
5. Bấm "Dừng" → `StatusChip` "đã dừng"; bấm "Chạy lại" → nối lại.
6. Xoay máy thật bằng tay — `MetaChip "kích cỡ"` đổi theo, canvas đổi tỉ lệ
   không bị méo hình (kiểm `aspect-ratio` CSS ăn đúng theo sự kiện `size`).
7. Đóng tab giữa lúc đang chảy — quay lại `/mirror`, mở lại cùng máy, luồng cũ
   không còn ảnh hưởng gì tới luồng mới (server dọn phiên cũ — thuộc phạm vi
   phase 03/04, chỉ xác nhận không có triệu chứng lạ ở UI).

## 10. Ghi chú cho phase 06

- **Chỗ gắn pointer handler:** `Box` chứa canvas trong
  `src/features/device-mirror/components/MirrorSurface.tsx` (biến `attachCanvas`
  ref, cùng khối `sx` đang có `cursor: live ? 'crosshair' : 'default'`) — thêm
  `onPointerDown/onPointerMove/onPointerUp` và `onWheel` (cho `ScrollInput`)
  ngay trên `Box` đó. Toạ độ con trỏ cần chuẩn hoá về `[0,1]` bằng
  `getBoundingClientRect()` của chính `Box` trước khi gửi `nx/ny` — `canvas`
  bên trong đã được CSS kéo full kích cỡ container (`& canvas`) nên
  `Box.getBoundingClientRect()` và kích cỡ canvas hiển thị trùng khít.
- **Intent đã khai sẵn** trong `DeviceMirrorContract.ts`: `TouchInput`,
  `ScrollInput`, `KeyTapped`, `TextSubmitted`, `RotateRequested`,
  `DisplayPowerToggled`, `NotificationsRequested`, `SnapshotRequested` — VM xử
  lý bằng nhánh no-op (một khối `case` gộp, có bình luận "phase 06"), chỉ cần
  lấp nội dung (gọi `deps.mirror.sendControl(...)` theo `sessionId` hiện có),
  KHÔNG cần sửa lại chữ ký các Intent này trừ khi phát hiện thiếu trường lúc
  triển khai thật.
- **`canControl(state)`** (trong Contract) đã sẵn sàng: `true` khi
  `status === 'streaming' && controlEnabled && sessionId !== null`. Dùng nó để
  quyết định có gắn pointer handler thật hay chỉ hiện con trỏ đổi màu — hiện
  tại `MirrorSurface` mới nhận `live` (rộng hơn `canControl`, gồm cả lúc đang
  `connecting`) để đổi con trỏ; phase 06 cân nhắc đổi prop này thành
  `canControl` nếu muốn con trỏ chỉ đổi khi THẬT SỰ gửi lệnh được.
- **`SnapshotRequested`** nên dùng `deps.videoSink.snapshotPng()` (đã có sẵn ở
  `MirrorVideoSink`, trả `Result<Uint8Array>`) rồi `ctx.emit({ type:
  'DownloadFile', fileName: snapshotFileName(serial, new Date()), bytes,
  mimeType: 'image/png' })` — `snapshotFileName` đã viết và test sẵn trong
  Contract, `DownloadFile` Effect và cách xử lý nó (Blob → `<a download>`)
  cũng đã có sẵn trong `DeviceMirrorScreen.tsx`.
- **`displayOn`** trong State đã có, mặc định `true` — phase 06 tự cập nhật nó
  khi xử lý `DisplayPowerToggled` (đảo giá trị) và gửi `MirrorDisplayPowerMessage`
  tương ứng qua `sendControl`.

## 11. Câu hỏi chưa giải quyết

Không có. Mọi lệch với phase file/nhiệm vụ đã liệt kê ở mục 7 kèm lý do cụ
thể — phần lớn phát sinh từ một bộ luật ESLint (React Compiler) không được
nhắc tới trong tài liệu đọc trước, phát hiện được bằng cách chạy `pnpm lint`
thật và thực nghiệm trực tiếp (file dò tạm, xoá ngay sau khi xác nhận) thay vì
đoán.
