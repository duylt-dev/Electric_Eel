---
title: "Phase 03–05 — Sửa theo tester + code-reviewer"
date: 2026-09-14
---

# Trạng thái: done — 318/318 test, typecheck 0 lỗi, lint 0 lỗi

Nguồn: `tester-phase-03-05.md` (PASS-WITH-GAPS) và `code-review-phase-03-05.md`
(REQUEST-CHANGES: 3 High, 7 Medium, 15 Low). Bảng dưới: từng phát hiện → đã
làm gì, ở đâu. Không sửa gì ngoài danh sách này trừ hai chỗ ghi rõ "phát sinh".

## High — cả ba đã sửa

| # | Sửa | File |
|---|---|---|
| H1 luồng `onStart` không bị intent cùng khoá huỷ | `ViewModelDefinition.startKey`; `run(null, …, definition.startKey)` → job khởi động vào cùng bảng `running`. Khai `startKey` ở 4 VM: `DeviceMirror`/`AdbLogcat` (`'stream'`), hai picker (`'adb'`). Test hồi quy: fake ghi `signals[]`, assert `signals[0].aborted === true` sau `StreamStopped`/`QualityChanged`/`ControlToggled` | `core/mvi/{types,createViewModel}.ts`, 4 ViewModel, `DeviceMirrorViewModel.test.ts` |
| H2 StrictMode gọi `useState(() => createViewModel())` hai lần → VM mồ côi giữ máy | `createViewModel(def, deps, { autoStart })` + `instance.start()` (no-op lần hai/sau dispose). Provider dựng với `autoStart: false`, gọi `start()` trong `useEffect` — nơi có cleanup `dispose()` đi kèm. Test giữ hành vi cũ (`autoStart` mặc định `true`) | `core/mvi/{types,createViewModel}.ts`, `defineViewModel.tsx` |
| H3 không `adb.close()` → rò socket `wait-for-any-disconnect` tới 5037 mỗi phiên | `closeTangoResources(scrcpy, adb)`: `scrcpy.close()` rồi `adb.close()`, trần 3s, gọi ở `session.close()` VÀ mọi nhánh lỗi/huỷ trong `start()` (kể cả khi mới `createAdb` xong) | `data/device-mirror/tangoSession.ts` (mới), `TangoMirrorGateway.ts` |

## Medium — 7/7 đã sửa

| # | Sửa |
|---|---|
| M1 `start()` không trần thời gian, không nghe `signal` | `raceAbort(promise, signal, step)` bọc 4 bước Tango (`createAdb`, `pushServer`, `AdbScrcpyClient.start`, `videoStream`), 15s/bước, ném `AppErrors.cancelled`/`network`; `describeMirrorFailure` trả nguyên `AppError` (test mới) |
| M2 lỗi framing không `cancel()` body; `push` ném khi `len=0` | `await reader.cancel()` trước khi trả `upstream`; codec coi `len < 1` là khung hỏng → sự kiện `failed` + bỏ đệm (test `len = 0` mới) |
| M3 decoder hỏng → UI vẫn "đang chảy" | Cổng `MirrorVideoSink.onError(listener)`. Sink báo một lần khi `write` reject. `mirrorStream.ts`: controller con của `ctx.signal` — nhận lỗi → `local.abort()` + `failed` + `ShowMessage`; `outcome` về `cancelled` nên không đè `failed` (test mới) |
| M4 đổi chất lượng có thể 409 do race abort | Chọn (a): `startMirrorSession` — serial bận bởi CHÍNH người này → `release` + `close` phiên cũ rồi mở mới; người khác → 409 (2 test: tiếp quản + `release` trễ không đụng phiên mới) |
| M5 `QualityChanged`/`ControlToggled` mở luồng khi đã dừng | Chỉ `stream()` nếu `isLive(state)`; `StreamRequested` bỏ qua khi `unsupported`. Screen: `FormControl disabled` cho Switch + QualityBar khi `connecting`/`unsupported`, `FormHelperText` nói hậu quả (test: đổi lúc dừng → 1 request, "Chạy lại" dùng tham số mới) |
| M6 tỉ lệ canvas phụ thuộc CSS transfer `aspect-ratio` | `MirrorSurface` dùng kích cỡ NỘI TẠI của canvas (`setSize` của renderer đặt `canvas.width/height`): `width/height: auto; max-width: 100%; max-height`. Bỏ prop `aspect` và `aspectRatio()` |
| M7 `text` strip trước khi kiểm độ dài | Kiểm `raw.text.length > MAX_TEXT_LENGTH * 4` trước `stripControlChars` |

## Low — 12/15 đã sửa, 3 dời

| # | Kết quả |
|---|---|
| L1 `jarPath` trong `message` | → `JAR_UNREADABLE_MESSAGE` + `detail: jarPath` ở cả `jarSource.ts` và `mirrorFailure.ts`; test cập nhật (assert `detail`, `message` KHÔNG chứa đường dẫn) |
| L2 `existsSync` nhận thư mục | `statSync(p, { throwIfNoEntry: false })?.isFile()` làm mặc định của `exists` |
| L3 route: `onSize` không gỡ, nhánh `aborted` không release | `unsubscribeSize`, `iterator.return()` và `releaseAndClose()` ở nhánh `aborted` của `pull` |
| L4 hai POST `/control` xen kẽ; lỗi writer → `unknown` | `controlQueue` nối chuỗi theo phiên trong `tangoSession.ts`; `applyControl` quy lỗi writer về `upstream` (test mới) |
| L5 `bindAbort` giả định cùng signal | `MirrorControlPump` dùng `WeakSet<AbortSignal>` — gắn một listener/signal, không giữ chân signal đã xong. Phần "VM truyền rootSignal" vẫn dời phase 06 |
| L6 backpressure decoder | **Dời phase 07** (đo `decodeQueueSize` trên máy yếu) |
| L7 `rgba`/`#fff` cứng | `color-mix(in srgb, m3('scrim') 35%, transparent)` + `m3('inverseOnSurface')` |
| L8 QualityBar lặp 3 khối | Mảng `FIELDS` + `map` (97 dòng) |
| L9 `connecting` giữ `sessionId`/`frameSize` cũ | Xoá cả hai khi vào `connecting` |
| L10 `decodeURIComponent` ném → 500 | `decodeSerial()` bọc try ở `mirror/[serial]/page.tsx`. `logcat/[package]/page.tsx` cùng lỗi — **chưa sửa**, ghi §11 LLM.md ở phase 07 |
| L11 `capOutputLines` thừa | Bỏ ở gateway |
| L12 `jsonError` không dùng `canExposeErrorDetail` | Dùng |
| L13 hai file sát 200 dòng | Tách `tangoSession.ts` (128) khỏi gateway (151); tách `MirrorControlPump.ts` (98) khỏi repository (130); tách `mirrorStream.ts` (105) khỏi ViewModel (125) |
| L14 chú thích `MirrorOpened` sai | Sửa: nó CÓ huỷ lượt làm mới đang bay, và đó là điều muốn |
| L15 `/unauthorized/i` trên `thrown.message` | **Giữ** — chuỗi đó do adb server trả (`device unauthorized`), không phải scrcpy output; chưa thấy ca bắt nhầm thật |

## `DeviceMirrorRoot.tsx` — chọn phương án F (sink lười)

`WebCodecsVideoSink`: hàm dựng không chạm DOM; `attach(container)` tạo
canvas + decoder + writer lần đầu (và lần đầu sau `dispose()`); `dispose()`
trả tài nguyên nhưng cho `attach` lại. Root: `useState(() => createVideoSink())`
(an toàn SSR + StrictMode), `useEffect(() => () => sink.dispose())`,
`attachSurface` = ref callback → `sink.attach(el)`. Bỏ `null` gate, bỏ
microtask, bỏ prop `canvas` — Screen nhận `attachSurface`, `MirrorSurface`
nhận `attach`. React 19 StrictMode chạy lại ref callback sau khi gỡ, nên
gỡ → `dispose()` → gắn lại → `attach()` dựng lại đúng đường.

## Phát sinh ngoài hai báo cáo

1. **`meta` luôn `0×0`** (đo trên máy thật, `phase-03-report.md` §4.5):
   `knownFrameSize(w, h)` trong Contract trả `null` khi một chiều ≤ 0; VM dùng
   ở cả `meta` và `size`. Test Contract + VM (kịch bản `meta 0×0` → `size 664×1440`).
2. **Luật ESLint "không React/MUI/data trong ViewModel"** mở rộng từ
   `features/**/*ViewModel.ts` → `features/**/*.ts` để phủ luôn các file tách ra
   (`mirrorStream.ts`). Kiểm: không file `.ts` nào trong `features/` vi phạm.
3. **`tangoControl.ts` bỏ `import 'server-only'`** (cố ý, có chú thích) để
   `tangoControl.test.ts` chạy được trong `node:test` (đề xuất P2 của tester):
   4 test — ASCII/`injectText` vs có dấu/`setClipboard`, scale toạ độ theo
   `size()` hiện tại + `pressure/buttons` khi nhả, thứ tự tuần tự 7 loại, lỗi
   writer → `upstream`. Hai người gọi duy nhất vẫn mang `server-only`.

## Kiểm tra

- `pnpm typecheck` 0 lỗi · `pnpm lint` 0 lỗi / 13 warning `no-console` (chỉ
  spike + `gateway-check.ts`, +1 do thêm dòng `size:`) · `pnpm test` **318/318**
  (78 suite; +10 test so với trước review).
- `next dev` đang chạy biên dịch lại được: `POST /api/adb/mirror/{stream,control}`
  → 401 khi chưa đăng nhập; `/mirror/RF8Y60B9NCZ` → 307 `/login`.
- GitNexus: `impact`/`detect-changes` lỗi LadybugDB 43 ≠ 42 → đang
  `analyze --force --index-only` dựng lại; đối chiếu người gọi bằng grep
  (`createViewModel`: Provider + 3 test; `ViewModelInstance`: một hiện thực;
  `MirrorVideoSink`: `WebCodecsVideoSink` + fake test).

## Còn lại cho người dùng / phase sau

- **Chưa ai thấy hình bằng mắt** — sau H1/H2/H3, kịch bản tay đầu tiên trên
  `next dev`: đăng nhập → `/mirror` → mở `RF8Y60B9NCZ`: không 409 lần đầu;
  Dừng → canvas đứng + `adb shell ps -A | grep scrcpy` rỗng ≤ 3s; đổi chất
  lượng 5 lần → `lsof -nP -p <pid next> | grep :5037 | wc -l` không tăng; xoay
  máy → tỉ lệ đúng; hai tab cùng máy → tab sau thắng, tab trước báo "đóng bất ngờ".
- Phase 06: L5 phần `rootSignal`; phase 07: L6, `logcat/[package]` L10,
  `ANDROID_ADB_SERVER_PORT` vào `.env.example`, `pnpm build` với `node:net`
  (`serverExternalPackages`), cập nhật `LLM.md`/`architecture.md` theo danh
  sách cuối `code-review-phase-03-05.md` (thêm: `startKey`/`start()`/`autoStart`
  ở §MVI, sink lười + `attach()` ở §Root, `features/**/*.ts` cho luật ESLint).
