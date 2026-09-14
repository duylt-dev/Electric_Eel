---
title: "Phase 03 — Báo cáo: data server (Tango gateway) + hai Route Handler"
date: 2026-09-13
---

# Trạng thái: done

`pnpm typecheck && pnpm test` xanh. `pnpm lint` xanh cho toàn bộ file thuộc
phase này (0 lỗi, chỉ có warning `no-console` đã biết trước ở script kiểm
tay). Kịch bản kiểm tay với máy thật ban đầu **bị chặn** bởi adb treo (mục
4.2–4.3, nguyên nhân thật: một phiên khác đang dùng cùng điện thoại cho
`com.example.ardogdemo`), và đã **chạy xong ngày 14/09 14:12** khi phiên đó
kết thúc — kết quả ở mục 4.5.

## 1. GitNexus trước khi sửa `di/server.ts`

```
node .gitnexus/run.cjs impact "serverContainer" --direction upstream
→ UNKNOWN, impactedCount: 0, riskNote: "No callers resolved..."
```

Xác nhận bằng `grep -rn "serverContainer\." src` (loại trừ chính
`di/server.ts`): **25 chỗ dùng** (không phải 22 như `impact-baseline.md` ghi —
lệch vì baseline chụp trước khi phase 02 và các phase song song 04/05 thêm
route/trang mới dùng `serverContainer`). Không chỗ nào đụng tới khoá mới
`deviceMirror` trước khi tôi thêm nó, và không chỗ nào sửa `adb.shell` theo
cách xung khắc với việc tôi dùng lại đúng một instance `ProcessAdbShell` cho
cả `adb.shell` lẫn `deviceMirror.gateway`. An toàn để CHỈ THÊM khoá.

Ghi chú: `impact-baseline.md` gọi khoá mới là "`mirror`", nhưng phase file
này (mục Implementation Steps #6) và `phase-02-report.md` mục 7 đều thống
nhất tên **`deviceMirror`** — tôi theo phase-03 spec + tiền lệ phase 02 (mới
hơn, chi tiết hơn), không theo bảng baseline (viết trước khi cấu trúc
`domain/device-mirror/` chốt tên).

## 2. File tạo/sửa (dòng)

Tạo (đúng 7 file thuộc sở hữu phase này):

| File | Dòng |
|---|---|
| `src/data/device-mirror/mirrorSettings.ts` | 74 |
| `src/data/device-mirror/mirrorSettings.test.ts` | 69 |
| `src/data/device-mirror/mirrorFailure.ts` | 94 |
| `src/data/device-mirror/mirrorFailure.test.ts` | 88 |
| `src/data/device-mirror/jarSource.ts` | 35 |
| `src/data/device-mirror/TangoMirrorGateway.ts` | 198 |
| `src/data/device-mirror/tangoControl.ts` | 120 |
| `src/app/api/adb/mirror/stream/route.ts` | 151 |
| `src/app/api/adb/mirror/control/route.ts` | 42 |

Sửa:

| File | Thay đổi |
|---|---|
| `src/di/server.ts` | +43 dòng: thêm `globalForMirror`/`globalRegistry()`, `adbShell` dùng chung, khoá `deviceMirror`. Không đổi khoá cũ. |
| `.env.example` | +19 dòng: mục "Công cụ Màn hình máy" với `SCRCPY_SERVER_PATH`, `SCRCPY_SERVER_VERSION`. |

Không xoá `src/app/api/adb/mirror/spike/route.ts` — làm đúng theo chỉ định
TRỰC TIẾP của nhiệm vụ ("đây là mã tham chiếu, KHÔNG xoá file này"), ghi đè
lên câu "Xoá (nếu còn)" chung chung trong phase file.

Script kiểm tay tạm (không phải mã production, xem mục 4):
`plans/260913-1240-scrcpy-device-mirror/spike/gateway-check.ts`.

Không đụng `src/domain/**`, `src/features/**`, `src/data/device-mirror/HttpMirrorRepository.ts`,
`src/data/device-mirror/WebCodecsVideoSink.ts`, `src/di/client.ts` — xác nhận
bằng `git diff --stat` trước khi nộp báo cáo (các file đó đã có thay đổi
trong working tree từ phase 04/05 chạy song song, tôi không chạm vào).

## 3. Tên enum/phương thức Tango THẬT đã dùng trong `tangoControl.ts`

Đọc trực tiếp từ `.d.ts` đã biên dịch trong `node_modules/@yume-chan/`, không
đoán từ tài liệu:

- `AndroidMotionEventAction` (`node_modules/@yume-chan/scrcpy/esm/android/motion-event.d.ts`):
  `Down: 0, Up: 1, Move: 2` — dùng cho `touch`.
- `AndroidKeyEventAction` (`.../android/key-event.d.ts`): `Down: 0, Up: 1` —
  dùng cho `key` và `backOrScreenOn`.
- `AndroidScreenPowerMode` (`.../android/screen-power-mode.d.ts`): `Off: 0,
  Normal: 2` — dùng cho `displayPower`.
- `ScrcpyControlMessageWriter` (`.../control/writer.d.ts`): `injectTouch`,
  `injectScroll`, `injectKeyCode`, `injectText`, `setClipboard`,
  `backOrScreenOn`, `setScreenPowerMode`, `rotateDevice`,
  `expandNotificationPanel` — cả chín tên khớp 100% bảng trong phase file,
  không có tên nào phải đổi.
- Trường `injectTouch`: `action, pointerId(bigint), pointerX, pointerY,
  videoWidth, videoHeight, pressure, actionButton, buttons` (từ
  `2_0/impl/inject-touch.d.ts`, field cuối cùng `Field<T,_,_,Raw>` — kiểu
  "value" dùng khi TẠO object là `T` chứ không phải `Raw`, nên `keyCode` cần
  ép kiểu `as AndroidKeyCode` vì `MIRROR_KEYCODES` (domain, không sửa được)
  khai kiểu giá trị `number` trần).
- `injectScroll`: `pointerX, pointerY, videoWidth, videoHeight, scrollX,
  scrollY, buttons` (`1_22/impl/scroll-controller.d.ts`).
- `setClipboard`: `sequence(bigint), paste(boolean), content(string)`
  (`1_21/impl/set-clipboard.d.ts`).
- `AdbScrcpyOptions3_3_3` xác nhận lại là bí danh của `ScrcpyOptions3_3_1`
  (`3_3_3.d.ts`: `export { ScrcpyOptions3_3_1 as ScrcpyOptions3_3_3 }`) —
  đúng như spike-report §2 mục 5.

## 4. Kiểm tay với máy thật — bị chặn lúc đầu, đã chạy xong ở 4.5

### 4.1 Cách né `server-only` — đã kiểm chứng, dùng được

`TangoMirrorGateway.ts` có `import 'server-only'`, ném lỗi ngay khi chạy
ngoài bundler Next. Gói `server-only` tự khai `exports["."]` với hai nhánh:
điều kiện `react-server` → `empty.js` (no-op), `default` → `index.js` (ném
lỗi). Bật nhánh no-op bằng cờ CHÍNH THỐNG của Node, không sửa file nguồn:

```bash
NODE_OPTIONS="--conditions=react-server" pnpm exec tsx \
  plans/260913-1240-scrcpy-device-mirror/spike/gateway-check.ts RF8Y60B9NCZ
```

Đã kiểm bằng một probe rỗng (`import 'server-only'; console.log(...)`) trước
khi viết script thật — chạy sạch, in ra dòng log, không ném lỗi. Đây là
"cách đơn giản nhất" theo đúng yêu cầu của nhiệm vụ, không phải mock/giả.

### 4.2 Nhưng adb daemon trên máy dùng chung bị TREO

Chạy `gateway-check.ts RF8Y60B9NCZ --bad-version` (nhánh AN TOÀN hơn, server
tự thoát ngay nên không giữ tiến trình lâu):

```
start() trả lỗi: {
  "kind": "network",
  "message": "adb không trả lời sau 10s. Thiết bị có thể đang treo hoặc vừa rớt kết nối."
}
```

Đây LÀ `describeMirrorFailure`/`ProcessAdbShell` hoạt động đúng — chúng báo
đúng sự thật: `adb start-server` không trả lời trong 10s. Điều tra thêm bằng
probe TCP thô (không qua CLI `adb`, để tách biến số CLI vs daemon):

```js
net.createConnection({ host: '127.0.0.1', port: 5037 }, () => {
  sock.write('000chost:version')
  // ...
})
```

Kết quả: **kết nối TCP thành công NGAY** (không phải `ECONNREFUSED`), nhưng
daemon **không bao giờ trả lời** gói `host:version` — dù đợi tới 8 giây, dù
thử lại ba lần cách nhau vài chục giây. `adb devices -l` và `adb kill-server`
qua CLI cũng treo tương tự (nhiều lệnh bị chính công cụ Bash tự chuyển sang
chạy nền vì vượt timeout). Kết luận: **daemon adb trên máy chủ dùng chung này
đang ở trạng thái treo thật**, không phải do sandbox chặn mạng (loopback vẫn
thông — `curl localhost:3000` và kết nối TCP thô tới cổng 5037 đều thành
công ngay lập tức) và không phải do code của phase này (`shell.run` gọi đúng
`adb start-server` với `timeoutMs: 10_000` và báo lỗi đúng như thiết kế khi
không có phản hồi).

### 4.3 Không sửa được — bị chính bộ phân loại an toàn từ chối

Thử khôi phục bằng `adb kill-server` (thao tác chuẩn khi daemon treo, KHÔNG
ảnh hưởng tới `next dev` — hai tiến trình độc lập, `next dev` chỉ gọi lại
`adb` theo yêu cầu chứ không giữ kết nối thường trực tới daemon):

```
Permission for this action was denied by the Claude Code auto mode
classifier. Reason: [Interfere With Workloads].
```

Đây là hàng rào an toàn của chính công cụ, không phải giới hạn kỹ thuật —
lý do nêu ra ngụ ý máy chủ NÀY đang được chia sẻ với khối lượng công việc
khác (nhiều khả năng một phiên song song 04/05 hoặc chính người điều phối
đang có việc phụ thuộc adb chạy cùng lúc). Theo đúng chỉ dẫn an toàn ("không
tìm cách lách, dừng lại và giải thích"), tôi **không** thử các cách vòng
(không `kill -9` theo PID, không sửa cổng khác). Không có tiến trình
`app_process`/`scrcpy-server` nào bị bỏ lại trên điện thoại — luồng thất bại
NGAY ở bước `shell.run(['start-server'])`, trước khi chạm tới `adb`
`createAdb`/`pushServer`/`AdbScrcpyClient.start` nào cả.

### 4.4 Việc CẦN làm tiếp (không phải của phase này)

Khi máy chủ rảnh (không phiên song song nào đang cần adb), chạy:

```bash
adb kill-server && adb start-server && adb devices -l
NODE_OPTIONS="--conditions=react-server" pnpm exec tsx \
  plans/260913-1240-scrcpy-device-mirror/spike/gateway-check.ts RF8Y60B9NCZ
NODE_OPTIONS="--conditions=react-server" pnpm exec tsx \
  plans/260913-1240-scrcpy-device-mirror/spike/gateway-check.ts RF8Y60B9NCZ --bad-version
adb -s RF8Y60B9NCZ shell ps -A | grep -i scrcpy   # phải rỗng sau khi script xong
```

`--bad-version` PHẢI in đúng câu gợi ý chứa `SCRCPY_SERVER_VERSION=3.3.4`
(bản đã cài qua brew, xác nhận bằng `brew info scrcpy` → "Installed Versions:
scrcpy 3.3.4"). Chạy KHÔNG `--bad-version` phải in `meta:`, 30 dòng gói
video, `control result: { ok: true, value: undefined }`, rồi "đã đóng phiên".

### 4.5 Kết quả chạy thật — 14/09/2026 14:12, máy `SM-A165F` (`RF8Y60B9NCZ`)

Điều kiện: `ps aux | grep '[a]db -s RF8Y60B9NCZ'` rỗng (phiên ardogdemo đã
xong), `adb devices -l` trả lời ngay, KHÔNG cần `adb kill-server`.

| Kịch bản | Kết quả |
|---|---|
| `gateway-check.ts RF8Y60B9NCZ` | `meta: { deviceName: 'SM-A165F', width: 0, height: 0 }` → `size: { width: 664, height: 1440 }` → `#1 config size=32` → 29 gói `frame` (keyframe đầu 37 627 B, sau đó 9–20 KB, pts tăng đều) → `control result: { ok: true, value: undefined }` → `đã đóng phiên`, exit 0 |
| `gateway-check.ts RF8Y60B9NCZ --bad-version` | `start()` trả `{ kind: 'upstream', message: 'scrcpy-server trên máy chủ là bản 3.3.4, khác bản client (3.3.1). Đặt SCRCPY_SERVER_VERSION=3.3.4 trong .env rồi thử lại.', detail: '[server] ERROR: The server version (3.3.4) does not match the client (3.3.1)\njava.lang.IllegalArgumentException…' }`, exit 0 |
| `adb -s RF8Y60B9NCZ shell ps -A \| grep -i scrcpy` sau MỖI lần chạy | rỗng — kể cả lần script bị `head` cắt giữa vòng lặp (SIGPIPE, không tới `session.close()`): socket đứt là scrcpy-server tự thoát |

Hai điều rút ra, chuyển cho phase 05/06 và code-reviewer:

1. **`meta.width/height` luôn là `0×0`.** `AdbScrcpyVideoStream.width/height`
   của Tango khởi tạo 0 và chỉ được điền khi gói `configuration` (SPS) đi qua
   `InspectStream` — tức SAU khi `start()` đã trả session. Kích thước thật đến
   qua `sizeChanged` (sticky) → `pendingSizes` → khung `size` của route, và
   luôn đứng TRƯỚC gói `config`. Phía trình duyệt, `DeviceMirrorViewModel`
   nhánh `meta` hiện gán `frameSize: {0, 0}` → `aspectRatio()` = `0/0 = NaN`
   trong vài ms trước khi `size` tới. Cần coi `0×0` là "chưa biết" (`null`)
   ở nhánh `meta` và/hoặc trong `aspectRatio()`. Đã xác nhận trên máy thật
   bằng dòng `session.onSize(...)` thêm vào `gateway-check.ts`.
2. `detail` của lỗi `--bad-version` mang cả stack Java của máy — đúng như
   mục 6 đã lo: route stream phải lọc bằng `canExposeErrorDetail` (đã sửa
   ở `stream/route.ts:126`), chỉ ghi log máy chủ.

## 5. Khác biệt so với phase file, và vì sao

1. **`describeMirrorFailure` có thêm hai nhánh `ENOENT`/`EACCES`** không nằm
   trong bảng liệt kê ở phần Requirements. Lý do: tham số `jarPath` trong chữ
   ký `describeMirrorFailure(thrown, serverOutput, jarPath, version)` chỉ có
   ý nghĩa nếu hàm này DÙNG tới nó — và trường hợp dùng tự nhiên nhất là khi
   `AdbScrcpyClient.pushServer` ném lỗi fs bất đồng bộ (TOCTOU: file bị xoá
   giữa lúc `jarSource.openJarStream` kiểm và lúc Tango thật sự đọc). Câu
   thông báo dùng LẠI hằng số `SCRCPY_JAR_NOT_FOUND_MESSAGE` từ
   `mirrorSettings.ts` — một nguồn duy nhất, không có hai cách diễn đạt cho
   cùng một sự cố.
2. **`jarSource.openJarStream` tự kiểm `accessSync` ĐỒNG BỘ trước khi tạo
   stream**, không chỉ bọc `Readable.toWeb(createReadStream(...))`. Lý do:
   `fs.createReadStream` không ném lỗi đồng bộ khi file thiếu — nó mở file
   bất đồng bộ rồi phát `error`. Không kiểm trước thì một `ENOENT` sẽ trôi
   tới tận `pushServer` với thông báo mơ hồ hơn nhiều so với chặn ngay ở đây.
3. **`StreamReader<T>` — một interface tối giản tự khai trong
   `TangoMirrorGateway.ts`**, thay vì dùng thẳng
   `ReadableStreamDefaultReader<T>` của DOM lib. Phát hiện lúc chạy
   `pnpm typecheck`: Tango tự khai `ReadableStream`/`ReadableStreamDefaultReader`
   RIÊNG trong gói `@yume-chan/stream-extra` (không phải dependency trực
   tiếp của repo này — không khai trong `package.json`, nên không import
   thẳng kiểu đó được), và kiểu đó lệch vài chi tiết so với kiểu toàn cục của
   DOM lib (khác biệt ở tính bắt buộc/tuỳ chọn của `value` trong nhánh
   `done: true`). Giải pháp: một interface tối giản chỉ khai `read()` +
   `releaseLock()` — cả hai phía đều thoả mãn về mặt cấu trúc, khỏi cần ép
   kiểu (`as unknown as`) ở bất kỳ chỗ nào.
4. **Bỏ một lượt kiểm `signal.aborted` thừa** ngay đầu khối `try` của
   `start()`. `ProcessAdbShell.run()` (bước `start-server` NGAY TRƯỚC khối
   `try`) đã tự kiểm `signal?.aborted === true` và trả `cancelled` — kiểm lại
   lần nữa ngay sau đó là code chết, không bao giờ chạm tới nhánh đó.
5. **"Hàng đợi nhỏ" cho sự kiện `size`** (Key Insight của phase file) hiện
   thực bằng một mảng `pendingSizes` bên trong CHÍNH session — không phải
   trong route. `videoStream.sizeChanged` đăng ký ĐÚNG MỘT LẦN lúc dựng
   session; nếu route chưa kịp gọi `session.onSize(listener)` (về lý thuyết
   có thể xảy ra dù cùng một lượt đồng bộ), sự kiện xoay máy được XẾP HÀNG
   thay vì rơi mất, và được xả hết cho listener đầu tiên đăng ký. Route
   `stream/route.ts` không có logic hàng đợi nào của riêng nó — nó chỉ gọi
   `session.onSize(cb)` một lần trong `start(controller)` và `enqueue` thẳng.
6. **Route `control/route.ts` chỉ kiểm `serverContainer.adb.settings()`**,
   KHÔNG kiểm `serverContainer.deviceMirror.settings()` — đọc đúng nghĩa đen
   Requirements ("Route control: requireUser → adb settings → body →
   dispatchMirrorControl"), khác route `stream` (kiểm CẢ HAI). Hợp lý vì
   route control không mở phiên Tango mới, chỉ forward vào phiên đã có sẵn
   trong registry — jar/version không liên quan.
7. **Dùng lại ĐÚNG MỘT `ProcessAdbShell`** cho cả `adb.shell` và
   `deviceMirror.gateway` trong `di/server.ts` (biến `adbShell`), thay vì
   `new ProcessAdbShell()` hai lần. `ProcessAdbShell` không giữ trạng thái
   (mỗi `run`/`stream` tự `spawn` rồi quên), nên dùng chung là an toàn và
   tránh cấp phát thừa.
8. **`ANDROID_ADB_SERVER_PORT` không được thêm vào `.env.example`** dù
   `TangoMirrorGateway`'s constructor đọc nó làm giá trị mặc định cho
   `adbPort` (`Number(process.env.ANDROID_ADB_SERVER_PORT ?? 5037)`, đúng chữ
   ký nêu trong phase file). Task giao chỉ định RÕ đúng hai biến cần thêm
   (`SCRCPY_SERVER_PATH`, `SCRCPY_SERVER_VERSION`); `ANDROID_ADB_SERVER_PORT`
   là một cửa thoát hiếm khi cần (cổng 5037 gần như luôn đúng), nên để nó là
   một override ẩn thay vì phơi ra `.env.example` cho một trường hợp biên
   không ai chắc sẽ cần. Cân nhắc thêm nếu có nhu cầu thật.

## 6. Kết quả kiểm tra cuối

- `pnpm typecheck`: xanh, 0 lỗi.
- `pnpm test`: **308/308 xanh**, 77 suite (tăng từ 283/283 trước phiên này —
  chênh lệch là do các phase 04/05 chạy song song cũng đang thêm test; 17
  test case của riêng phase này: 7 `mirrorSettings` + 10 `mirrorFailure`).
- `pnpm lint` cho ĐÚNG 9 file phase này sở hữu + script kiểm tay: **0 lỗi**,
  5 warning `no-console` (script `gateway-check.ts`, tương tự cách phase 01
  được chấp nhận cho script kiểm tra tạm).
- `pnpm lint` cho TOÀN repo: đang có 2 lỗi (`react-hooks/immutability`,
  `react-hooks/set-state-in-effect`) trong
  `src/features/device-mirror/components/MirrorSurface.tsx` — file này KHÔNG
  thuộc sở hữu phase 03 (thuộc phase 04/05, đang sửa dở song song trong cùng
  working tree). Không sửa, chỉ ghi nhận để người điều phối biết trước khi
  merge toàn bộ.
- `node .gitnexus/run.cjs detect-changes --scope all --repo .` (lần cuối,
  không `partial`/`truncated`):

  ```
  Changes: 11 files, 10 symbols. Risk: medium.
  ```

  Trong đó CHỈ hai symbol thuộc về phase này: `Const appDirectory` và
  `Const serverContainer` (cả hai ở `src/di/server.ts`). Xác nhận bằng
  `impact` riêng từng symbol: cả hai đều `UNKNOWN` (0 caller resolve được) —
  đối chiếu `git diff -- src/di/server.ts`: `appDirectory` được gắn nhãn
  "đổi" chỉ vì tôi CHÈN một hằng số mới (`adbShell`) ngay DƯỚI nó, làm lệch
  số dòng — đúng dạng dương tính giả đã ghi nhận trong `phase-02-report.md`
  mục 6 (không phải nội dung khai báo đổi, byte-for-byte giống hệt). Tám
  symbol còn lại (`layerBoundaries`, `config` ở `eslint.config.mjs`,
  `stateLabel`/`readState` ở `AdbDevice.ts`, `ClientContainer` ở
  `di/client.ts`, `Context`/`autoSelect` ở `LogcatPickerViewModel.ts`,
  `TOOLS` ở `toolRegistry.tsx`) thuộc về phase 02/04/05 đang chạy song song
  trong cùng working tree, không phải thay đổi của phase 03.

## 7. Câu hỏi chưa giải quyết

1. ~~Kịch bản kiểm tay với máy thật chưa hoàn thành~~ — **đã chạy 14/09
   14:12, mục 4.5.** Bộ phân loại từ chối `adb kill-server` là ĐÚNG: adb
   không hỏng, nó đang bận phục vụ một phiên khác trên cùng điện thoại. Kịch
   bản rút cáp giữa luồng và `curl` qua route thật dời sang danh sách kiểm
   tay của phase 07 (cần trình duyệt đăng nhập).
2. **`gateway-check.ts`** giữ tới phase 07 rồi xoá cùng các file spike khác
   (đã ghi trong phase 07).
3. Diễn giải "hàng đợi nhỏ trong adapter, không trong route" cho sự kiện
   `size` (mục 5.5) là suy luận từ đúng nghĩa đen của Key Insight trong phase
   file, không có ví dụ code mẫu đi kèm — nếu tác giả phase file có hình dung
   khác (ví dụ hàng đợi can thiệp cả vào thứ tự với gói video), cần đối
   chiếu lại trước khi phase 04 (client) giả định thứ tự sự kiện `size` luôn
   tới NGAY LẬP TỨC không trễ.
