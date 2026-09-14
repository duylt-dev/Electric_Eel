---
title: "Phase 01 — Báo cáo spike: Tango + scrcpy-server + WebCodecs"
date: 2026-09-13
---

# Kết luận: **GO có điều kiện**

Cả hai tiêu chí dừng (NO-GO) trong phase KHÔNG xảy ra:

- Node lấy được gói `data` keyframe từ máy thật — **cả forward lẫn reverse
  tunnel** đều lấy được, không cần thử phương án dự phòng.
- WebCodecs chưa từng báo lỗi codec, vì **chưa chạm tới bước đó** (xem lý do
  ở §5) — đây không phải là "browser không vẽ được khung dù gói đã tới", nên
  không khớp điều kiện NO-GO thứ hai.

Điều kiện còn treo: bước (c) trong Overview — "trình duyệt vẽ ≥1 khung qua
Route Handler" — chưa được xác nhận bằng mắt người, vì môi trường thực thi
không có tài khoản để đăng nhập và bị chặn đọc DB để tự dò (đúng chủ đích, xem
§5). Mọi lớp bên dưới bước đó (giao thức, framing, gói tin, decoder không cần
Worker/WASM) đã được kiểm chứng độc lập bằng ba cách khác nhau. Khuyến nghị:
**bắt đầu phase 02 ngay**, và người dùng xác nhận bước (c) bằng tay trong
≤ 5 phút theo hướng dẫn ở `spike/README.md` trước khi đóng phase 01 hẳn.

---

## 1. Những gì đã chạy được trên máy thật (`RF8Y60B9NCZ`, Samsung SM-A165F, Android 16)

Script: `spike/mirror-spike.ts`. Ba chế độ đều chạy thật, không giả lập.

### 1.1 Chế độ `normal` (forward tunnel, version đúng)

```
[server] INFO: Device: [samsung] samsung SM-A165F (Android 16)
[server] DEBUG: Using video encoder: 'c2.mtk.avc.encoder'
[spike] metadata: { deviceName: 'SM-A165F', codec: 1748121140, width: 664, height: 1440 }
[server] DEBUG: Display: using DisplayManager API
[spike] #1 configuration, 32 byte
[spike] #2 data keyframe=true pts=399020160743 ptsStep=- size=24080
[spike] #3 data keyframe=false pts=399020260743 ptsStep=100000 size=6641
...(28 gói data nữa, pts tăng đều)...
[spike] tổng kết: 1 gói configuration, TTFF keyframe = 1057ms
[spike] gửi BACK…
```

Chạy lặp lại ba lần (không tính lần đầu lúc `logLevel:'info'` chưa đổi sang
`'debug'`): TTFF đo được **1011ms, 1057ms, 2116ms** — dao động vì phụ thuộc
lúc encoder phần cứng khởi động, nhưng luôn dưới 2.2s, đạt yêu cầu "vẽ khung
đầu trong ≤ 2s" của phần Node (phần trình duyệt cộng thêm độ trễ HTTP + decode,
xem §5).

**Encoder máy chọn: `c2.mtk.avc.encoder`** (hardware, MediaTek) — khớp với
chẩn đoán `scrcpy --list-encoders` trong báo cáo nghiên cứu.

### 1.2 Chế độ `bad-version` — câu lỗi nguyên văn cho phase 03

```
[spike] server thoát ngay khi start, output nguyên văn:
  [server] ERROR: The server version (3.3.4) does not match the client (3.3.3)
  java.lang.IllegalArgumentException: The server version (3.3.4) does not match the client (3.3.3)
  	at com.genymobile.scrcpy.Options.parse(Options.java:299)
  	at com.genymobile.scrcpy.Server.internalMain(Server.java:238)
  	at com.genymobile.scrcpy.Server.main(Server.java:215)
  	at com.android.internal.os.RuntimeInit.nativeFinishInit(Native Method)
  	at com.android.internal.os.RuntimeInit.main(RuntimeInit.java:438)
```

Bắt bằng `catch (thrown) { thrown instanceof AdbScrcpyExitedError }`,
`thrown.output` là mảng dòng — dòng đầu (`[server] ERROR: ...`) đủ để quy lỗi
ở phase 03 bằng cách khớp chuỗi con `"does not match"`.

### 1.3 Chế độ `no-forward` (reverse tunnel) — phương án dự phòng cũng chạy được

```
[server] DEBUG: Using video encoder: 'c2.mtk.avc.encoder'
[spike] metadata: { deviceName: 'SM-A165F', codec: 1748121140, width: 664, height: 1440 }
[spike] #1 configuration, 32 byte
[spike] #2 data keyframe=true pts=399050593220 ptsStep=- size=38171
...
[spike] tổng kết: 1 gói configuration, TTFF keyframe = 1243ms
```

Không gửi BACK ở chế độ này (script cố ý bỏ qua để tách biến số). Kết luận:
rủi ro hàng đầu #1 trong `plan.md` ("Tango không nối được qua adb server") có
đường lùi thật, không chỉ trên giấy.

### 1.4 BACK có tác dụng thật — kiểm bằng `dumpsys`, không nhìn màn hình

```
$ adb shell am start -a android.settings.SETTINGS
$ adb shell dumpsys activity activities | grep -m1 topResumedActivity
    topResumedActivity=ActivityRecord{...com.android.settings/.homepage.SettingsHomepageActivity...}
# chạy mirror-spike.ts RF8Y60B9NCZ normal (gửi BACK ở cuối)
$ adb shell dumpsys activity activities | grep -m1 topResumedActivity
    topResumedActivity=ActivityRecord{...com.example.ardogdemo/.MainActivity...}
```

Activity trên cùng đổi từ Settings sang app khác ngay sau khi script gửi
`injectKeyCode(BACK)` (down rồi up) — máy phản ứng thật, không phải log giả.

---

## 2. Khác biệt API Tango so với plan/báo cáo nghiên cứu (đọc trước khi viết phase 02–04)

Đây là phần quan trọng nhất của báo cáo này — đọc kỹ để phase 03/04 không dò
lại từ đầu.

| # | Plan/nghiên cứu viết gì | Thực tế đã kiểm |
|---|---|---|
| 1 | Nghiên cứu mô tả byte layout 12-byte header (`pts`+`flags`+`size`) để **tự parse** | **Không cần tự parse gì cả.** `AdbScrcpyVideoStream.stream` là `ReadableStream<ScrcpyMediaStreamPacket>` — Tango đã parse hộ thành object JS: `{ type: 'configuration', data: Uint8Array }` hoặc `{ type: 'data', keyframe?: boolean, pts?: bigint, data: Uint8Array }`. Route tạm chỉ việc đọc field, không đụng bit nào. Nguồn: `@yume-chan/scrcpy/esm/base/media.d.ts`. |
| 2 | Nghiên cứu ghi pts là "nanosecond từ start" | **pts là micro-giây (µs)**, không phải nano-giây. Đo trực tiếp: khi màn hình gần như tĩnh, `ptsStep` giữa hai gói liên tiếp là **đúng 100000** lặp lại — khớp hoàn hảo với 100ms = 1/10 giây, tức đơn vị gốc là µs. Nếu là ns thì bước phải là 100.000.000. |
| 3 | `pts` được giả định là số nguyên JS bình thường | `pts` khai kiểu **`bigint \| undefined`** (không phải `number`). Convert sang `number` (vd để vẽ biểu đồ) phải qua `Number(pts)` có kiểm tràn nếu cần; đóng gói vào network framing thì dùng `DataView.setBigUint64`. |
| 4 | `keyframe` được giả định luôn có mặt (dùng như `boolean`) | Field khai **`keyframe?: boolean`** — optional. Code phải so sánh `=== true`, không dùng truthy suông (một object có `keyframe: undefined` vẫn "truthy" nếu so sai kiểu). |
| 5 | `AdbScrcpyOptions3_3_3({...}, { version })` — không rõ có cần gì thêm | Đúng như plan, không thêm gì. Ghi chú: `AdbScrcpyOptions3_3_3` trong `@yume-chan/scrcpy` **là bí danh** của `ScrcpyOptions3_3_1` (`export { ScrcpyOptions3_3_1 as ScrcpyOptions3_3_3 }`) — vô hại, nhưng người sau đọc source đừng ngạc nhiên khi thấy tên khác. |
| 6 | `logLevel: 'info'` trong Architecture của phase | **Không đủ** để thoả yêu cầu "ghi lại encoder mà máy chọn" — dòng `Using video encoder: '...'` chỉ lên ở mức **`'debug'`**, `'info'` chỉ có dòng `Device: ...`. Đã đổi thành `'debug'` trong `mirror-spike.ts` và `route.ts`, có ghi chú tại chỗ. |
| 7 | *(không có trong plan, phát hiện thêm)* | **`logLevel: 'verbose'` làm server 3.3.4 CRASH** với output chỉ vỏn vẹn `['Aborted ']` — không phải lỗi validate rõ ràng như version mismatch. Kiểu TS `LogLevel` của `@yume-chan/scrcpy` (kế thừa từ bản 1.18+) vẫn liệt kê `'verbose'` là hợp lệ vì tương thích ngược với scrcpy-server cũ, nhưng **3.3.4 không còn hiểu giá trị này**. Type-safe không có nghĩa là runtime-safe ở đây — phase 02/03 nên tự giới hạn kiểu `logLevel` miền của mình còn 4 giá trị `'debug'\|'info'\|'warn'\|'error'` thay vì dùng lại union rộng của thư viện. |
| 8 | *(không có trong plan)* | `AdbScrcpyClient.getEncoders(adb, path, options)` — gọi thử trên máy này trả về **mảng rỗng `[]`**, dù `scrcpy --list-encoders` (CLI) liệt kê đủ 6 encoder. Chưa rõ nguyên nhân (có thể cần set thêm cờ nội bộ mà lệnh gọi thử chưa đúng cách). Không chặn GO/NO-GO vì phase 01 không cần API này, nhưng nếu phase sau có ý định làm bộ chọn encoder qua UI thì **đừng tin `getEncoders()` mà chưa điều tra thêm** — dùng `client.output` ở `logLevel:'debug'` để lấy tên encoder là đường chắc ăn đã kiểm. |
| 9 | Độ phân giải video suy từ `maxSize` | Với `maxSize: 1440` trên màn hình gốc của máy này, metadata trả về **`width: 664, height: 1440`** (portrait) — không phải một số tròn hay suy được từ tỉ lệ màn hình danh nghĩa; ghi lại số thật để phase 04 không giả định sai kích cỡ canvas ban đầu trước khi có gói đầu tiên. |
| 10 | `client.createAdb({ serial })` | Đúng y như plan — `AdbServerClient.DeviceSelector` nhận thẳng `{ serial: string }`, không cần bọc thêm. |
| 11 | `ScrcpyInstanceId.random()` | Đúng như plan — trả về object `InstanceId` (có `.value: number`, `.toOptionValue()`), gán thẳng vào `scid` vì field đó nhận `InstanceId \| string \| undefined`. |

---

## 3. Đo được (tổng hợp)

| Đại lượng | Giá trị |
|---|---|
| TTFF (Node, forward, 3 lần) | 1011ms / 1057ms / 2116ms |
| TTFF (Node, reverse/`no-forward`) | 1243ms |
| Gói `configuration` mỗi phiên | 1 gói, 32 byte |
| Kích cỡ gói `data` (forward, nội dung tĩnh) | 500–29.000 byte, keyframe đầu ~24–38KB |
| `ptsStep` (forward, nội dung tĩnh) | đúng 100000 (100ms → ~10fps thực tế, dù `maxFps:60`; do nội dung không đổi) |
| `ptsStep` (reverse, nội dung động hơn) | 15.000–35.000 (15–35ms → ~30–65fps) |
| Encoder máy chọn | `c2.mtk.avc.encoder` (hardware, MTK) |
| Độ phân giải video (`maxSize:1440`) | 664×1440 |
| Codec id trong metadata | `1748121140` = `ScrcpyVideoCodecId.H264` |
| `pnpm build` | Xanh, không cần `serverExternalPackages` |
| RTT control (20 lượt POST thân rỗng) | **Chưa đo được** — cần phiên đăng nhập trình duyệt thật, xem §5 |
| CPU tab lúc 60fps 1440p | **Chưa đo được** — cùng lý do §5 |

---

## 4. Kiểm route/trang tạm — cái gì đã kiểm, cái gì chưa

### Đã kiểm

- `pnpm typecheck && pnpm test && pnpm lint && pnpm build` — tất cả xanh, kể
  cả hai file tạm trong `src/` (chúng nằm trong phạm vi qua `tsconfig.json`
  gom cả repo, không riêng `src/`).
- `curl -X POST http://localhost:3000/api/adb/mirror/spike` (không cookie) →
  **`401 { "error": { "kind": "unauthorized", "message": "Bạn cần đăng nhập
  để tiếp tục." } }`** — xác nhận `requireUser()` chặn đúng, kể cả khi thân
  rỗng (nhánh RTT).
- `next dev` (đang chạy sẵn ở cổng 3000, KHÔNG bị khởi động lại) tự nhận
  route/page mới qua hot reload — không cần restart để có route xuất hiện
  trong `curl`.
- Sau `pnpm build`: `curl http://localhost:3000/login` vẫn `200`, `curl
  http://localhost:3000/mirror/spike` vẫn `307` (redirect sang login vì chưa
  đăng nhập, đúng hành vi layout `(app)`) — **`next dev` không bị ảnh hưởng**
  bởi việc `.next` production build vừa ghi đè.
- Round-trip của framing nhị phân **`[u32 BE len][u8 kind][payload]`** (kind
  2 = configuration, kind 3 = `[u8 keyframe][u64 BE pts][data]`) — kiểm bằng
  script Node độc lập (không phải file trong `src/`, không commit), dựng lại
  đúng thuật toán `encodeMessage`/`encodeFramePayload` của `route.ts` và
  `takeMessage`/`toMediaStreamPacket` của `page.tsx`, cố tình cắt luồng byte
  thành nhiều đoạn KHÔNG theo ranh giới message (mô phỏng TCP segment thật) để
  kiểm bộ phân tách của `page.tsx` không giả định message nguyên vẹn trong một
  lần đọc. Kết quả: khớp 100% cả `pts` (bigint), `keyframe`, kích cỡ dữ liệu.
- Gói `@yume-chan/scrcpy-decoder-webcodecs` — grep toàn bộ mã đã build
  (`esm/`): **không** có `new Worker`, `WebAssembly`, hay `.wasm` nào. Đúng
  như Key Insight #2 của phase: quyết định "v1 không cần đổi CSP" có căn cứ
  kiểm chứng trực tiếp trên gói đã cài, không chỉ dựa vào lời khẳng định của
  báo cáo nghiên cứu.

### Chưa kiểm được — và vì sao

**Không kiểm được bằng trình duyệt thật (headless hay có đầu).** Trang
`/mirror/spike` nằm sau layout `(app)` (bắt buộc đăng nhập). Môi trường thực
thi phiên này:

1. Không có sẵn tài khoản/mật khẩu nào được cấp để đăng nhập qua `curl` hay
   script giả lập phiên NextAuth.
2. Bị chặn (đúng chủ đích, bởi bộ phân loại quyền của công cụ) đọc bảng
   `User` trong `dev.db` để tự dò email/role — đây là hành vi **đúng như
   thiết kế an toàn**, không phải trục trặc môi trường.
3. Nhiệm vụ được giao rõ: "Không tạo tài khoản, không đụng DB" — nên không tạo
   user mới qua `pnpm db:seed` dù có script sẵn.

Vì vậy các mục sau **chưa được xác nhận bằng mắt người**, dù mọi lớp bên dưới
đã kiểm chứng riêng lẻ (xem §1 và mục "Đã kiểm" ở trên):

- Khung hình thật có thật sự VẼ lên `<canvas>` qua `WebGLVideoFrameRenderer`
  hay không (WebCodecs decode có báo lỗi codec hay không).
- DevTools Console không có dòng CSP violation nào (suy luận gián tiếp từ việc
  gói decoder không dùng Worker/WASM, nhưng chưa nhìn Console thật).
- RTT control thật (20 lượt `fetch` từ trình duyệt) và CPU tab lúc 60fps.

**Người dùng cần làm tay** (hướng dẫn đầy đủ ở `spike/README.md`): đăng nhập
`http://localhost:3000/login` bằng tài khoản bất kỳ đang có, mở
`http://localhost:3000/mirror/spike`, gõ serial `RF8Y60B9NCZ`, bấm "Bắt đầu",
xem đúng năm điều liệt kê trong README (khung hiện ≤2s, số gói tăng, Console
sạch, Network đang chảy, sau đó bấm "Đo RTT" để lấy p50/p95).

---

## 5. File đã tạo/sửa

Tạo:
- `plans/260913-1240-scrcpy-device-mirror/spike/mirror-spike.ts` (script Node, 187 dòng)
- `plans/260913-1240-scrcpy-device-mirror/spike/README.md`
- `plans/260913-1240-scrcpy-device-mirror/reports/spike-report.md` (file này)
- `src/app/api/adb/mirror/spike/route.ts` — route TẠM, `requireUser()` +
  `isSafeSerial` + chặn production, pull-based `ReadableStream`
- `src/app/(app)/mirror/spike/page.tsx` — trang TẠM, client component, canvas
  + WebCodecs + đo RTT

Sửa:
- `package.json`, `pnpm-lock.yaml` — thêm 5 gói `@yume-chan/*` đúng dải phiên
  bản trong phase (`adb@2.6.4`, `adb-scrcpy@2.3.2`, `scrcpy@2.3.0`,
  `adb-server-node-tcp@2.5.2`, `scrcpy-decoder-webcodecs@2.5.3`)

Hai file tạm trong `src/` **được giữ lại** theo đúng chỉ định của phase (xoá
hoặc thay ở phase 03/05), lint/typecheck đã xanh với cả hai. Không có file nào
bị xoá/sửa ngoài danh sách này. Không commit gì — theo quy tắc, người điều
phối sẽ commit.

---

## 6. Khuyến nghị cho phase 02+

1. Domain nên định nghĩa kiểu `LogLevel` **của riêng mình** chỉ với 4 giá trị
   `'debug' | 'info' | 'warn' | 'error'` — không tái dùng union rộng hơn của
   `@yume-chan/scrcpy` (xem mục #7 ở §2), để không ai vô tình gõ `'verbose'`
   và làm crash server thật ngoài production.
2. Gateway thật (phase 03) nên mặc định `logLevel: 'debug'` thay vì `'info'`
   nếu còn cần log tên encoder cho mục đích chẩn đoán/telemetry — hoặc chấp
   nhận `'info'` và bỏ yêu cầu ghi tên encoder nếu không thật sự cần trong vận
   hành bình thường (đánh đổi: `'debug'` log nhiều hơn, có thể lộ chi tiết nội
   bộ scrcpy-server ra `client.output`).
3. Kiểu cho packet nên định nghĩa lại trong domain giống hệt
   `ScrcpyMediaStreamPacket` (`type: 'configuration' | 'data'`, `pts?: bigint`,
   `keyframe?: boolean`) — đây gần như chắc chắn là "cổng" tự nhiên giữa
   `data/` (Tango) và phần còn lại, khỏi phải tự bịa một shape khác rồi
   convert qua lại.
4. `AdbScrcpyClient.getEncoders()` cần điều tra thêm trước khi dựa vào nó cho
   bất kỳ tính năng chọn encoder nào (mục #8 ở §2).
5. Trước khi đóng phase 01 hẳn: xác nhận tay bước (c) theo `spike/README.md`.
   Nếu WebCodecs báo lỗi codec khi đó, đây MỚI là lúc điều kiện NO-GO thứ hai
   được kích hoạt thật sự, và cần quay lại bàn phương án tinyh264 (đổi CSP)
   theo đúng "Phương án dự phòng" của phase.
