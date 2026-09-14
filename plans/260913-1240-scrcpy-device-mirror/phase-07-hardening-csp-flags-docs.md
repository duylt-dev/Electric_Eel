# Phase 07 — Hardening: CSP thực tế, lỗi, dọn phiên, `.env.example`, `LLM.md`, `architecture.md`, kịch bản tay

**Ước lượng:** 5h · **Ưu tiên:** P1 (chặn PR) · **Trạng thái:** pending
**File ownership:** `next.config.ts` (chỉ nếu cần), `LLM.md`, `docs/architecture.md`, `src/data/adb/ProcessAdbShell.ts` (một câu bình luận), `plans/260913-1240-scrcpy-device-mirror/reports/manual-test-script.md`, mọi file ở phase trước khi sửa lỗi phát hiện ở đây.
**Phụ thuộc:** 03–06 xong (hoặc 03–05 nếu chỉ xem).

## Context Links

- `.claude/CLAUDE.md` mục "Update rules" — bảng thay đổi ↔ file phải cập nhật trong cùng commit.
- `LLM.md` §3, §5, §7, §11 #12, §12; `docs/architecture.md` §6, §8 checklist.
- `next.config.ts` (CSP), `src/data/adb/ProcessAdbShell.ts` (header về vòng đời).

## Overview

Đóng vòng: kiểm CSP trên bản build thật (không chỉ `next dev`), kiểm mọi đường lỗi bằng tay, xác nhận không rò phiên/tiến trình, viết tài liệu **trong cùng nhánh** rồi chạy checklist §8 trước PR.

## Key Insights

- CSP kiểm trên `pnpm build && pnpm start`: dev có `'unsafe-eval'` che khuất khác biệt. Kỳ vọng **không** phải đổi CSP (decoder không dùng Worker/WASM). Nếu Console báo `worker-src`/`wasm` → nghĩa là Tango đã đổi cách dựng decoder → thêm `worker-src 'self' blob:` và `'wasm-unsafe-eval'` vào `script-src`, ghi lý do vào bình luận CSP và `LLM.md` §11 #7 (nhượng bộ mới).
- Ngoại lệ vòng đời (phiên sống ngoài request tạo ra nó) là **cố ý** → `LLM.md` §12, không phải §11. `docs/architecture.md` cần thêm một mục ngắn "Tài nguyên sống ngoài một request" vì đây là mẫu kiến trúc mới (luật: gắn với đúng một request đang mở + registry `globalThis` + `finally` dọn).
- Không ghi `AuditLog`: thêm "màn hình máy" vào dòng §11 #12 và câu ở `architecture.md` §6.

## Requirements

Kiểm tay (ghi thành `reports/manual-test-script.md`, mỗi mục có kết quả):
1. `pnpm build && pnpm start` (với `ADB_ENABLED=true` vì production tắt mặc định) → mở `/mirror/<serial>`: hình chạy; Console không có CSP violation; Network chỉ hai request tới `/api/adb/mirror/*`.
2. `ADB_ENABLED=false` → `/mirror` hiện Alert cùng câu với Logcat; `POST /api/adb/mirror/stream` → 403 JSON.
3. Bỏ `SCRCPY_SERVER_PATH` trên máy không có brew jar (giả bằng đường dẫn sai) → Alert nói cài `brew install scrcpy` + đặt biến; route → 404 JSON.
4. `SCRCPY_SERVER_VERSION=3.3.1` → lỗi nói đặt `SCRCPY_SERVER_VERSION=3.3.4`.
5. Rút cáp giữa phiên → màn báo lỗi `upstream/network` với câu hành động; registry rỗng; cắm lại → "Chạy lại" hoạt động.
6. Đóng tab đột ngột → trong ≤ 2s `adb shell ps -A | grep scrcpy` trống; mở lại được ngay (không 409).
7. Hai tab cùng serial → tab hai nhận 409 với câu rõ; đóng tab một → tab hai "Chạy lại" được.
8. Đăng xuất ở tab khác rồi bấm nút điều khiển → 401 → ShowMessage; luồng video kết thúc ở lần `pull` kế (kiểm `requireUser` chỉ ở đầu request nên luồng đang mở không tự đứt — ghi nhận là hành vi chấp nhận được, giống Logcat, vào §11 nếu chủ dự án muốn siết).
9. HMR: sửa một file trong `features/device-mirror` khi đang stream → không sinh phiên ma (`adb shell ps -A | grep -c app_process` không tăng).
10. Trình duyệt không WebCodecs (Firefox ESR cũ, hoặc tắt cờ) → trạng thái `unsupported` + câu hướng dẫn.

Tài liệu (cùng nhánh, trước PR):
- `LLM.md` §3: cây `domain/device-mirror/`, `data/device-mirror/`, `features/device-mirror/`, `features/mirror-picker/`, `features/adb-common/`, `app/(app)/mirror/**`, `app/api/adb/mirror/{stream,control}`; bảng ngoài `src/` không đổi.
- `LLM.md` §5: dòng mới "Mảnh UI dùng chung giữa các màn của cùng một họ công cụ, có biết domain → `features/<họ>-common/components/`".
- `LLM.md` §7: `/mirror`, `/mirror/[serial]` — đã đăng nhập + `ADB_ENABLED`; `POST /api/adb/mirror/stream`, `POST /api/adb/mirror/control` — đã đăng nhập, phiên phải thuộc chính mình.
- `LLM.md` §10: bẫy mới "Import `@yume-chan/*` ngoài `data/`" (ESLint chặn) và "Đặt `VideoDecoder`/canvas vào State" (hậu quả: re-render tạo decoder mới, mất khung).
- `LLM.md` §11 #12: thêm "màn hình máy". Thêm dòng mới nếu phát hiện (ví dụ dán chữ có dấu không chạy trên Samsung).
- `LLM.md` §12: "Bảng phiên mirror trong `globalThis` — trông như giữ tiến trình giữa các request, nhưng phiên vẫn thuộc đúng một request stream đang mở; registry chỉ để route control tra được; `globalThis` để sống qua HMR".
- `docs/architecture.md` §4 hoặc mục mới ngắn: mẫu "tài nguyên sống ngoài một request" (3 luật: một request chủ, registry trong `di/server.ts` qua `globalThis`, `finally` dọn); §6 câu về công cụ không ghi nhật ký thêm "màn hình máy"; §8 checklist thêm "Adapter trình duyệt giữ tài nguyên DOM/WebCodecs thì canvas đi qua prop từ Root, không qua State/Intent".
- `src/data/adb/ProcessAdbShell.ts` header: một câu "Công cụ Màn hình máy là ngoại lệ có chủ ý — xem `LLM.md` §12".
- `.env.example` đã sửa ở phase 03 — đối chiếu lại câu chữ.
- `AGENTS.md`/`CLAUDE.md`: không đổi (GitNexus/next tự ghi).

## Architecture

Không thêm thành phần. Sơ đồ phụ thuộc mới đưa vào `LLM.md` §2 chỉ nếu ranh giới đổi — không đổi (Tango nằm trong `data/`, đúng chiều mũi tên).

## Related Code Files

Sửa: `LLM.md`, `docs/architecture.md`, `src/data/adb/ProcessAdbShell.ts`, `next.config.ts` (chỉ khi CSP thật sự chặn), các file phase trước nếu kiểm tay lộ lỗi.
Tạo: `plans/260913-1240-scrcpy-device-mirror/reports/manual-test-script.md`.
Xoá: mọi mã spike còn sót (`src/app/(app)/mirror/spike`, `src/app/api/adb/mirror/spike`).

## Implementation Steps

1. **GitNexus:** `impact "ProcessAdbShell"` trước khi sửa bình luận (re-index; degraded → grep `ProcessAdbShell` → chỉ `di/server.ts`). `detect-changes --scope all` trước commit; `partial/truncated` → chạy lại.
2. Chạy 10 mục kiểm tay, ghi kết quả; sửa lỗi phát hiện trong file thuộc phase tương ứng (cùng nhánh).
3. CSP: nếu có violation → sửa `next.config.ts` với bình luận vì sao; không có → ghi "đã kiểm, không đổi" vào báo cáo và một dòng trong bình luận CSP nói decoder WebCodecs không cần `worker-src`.
4. Viết tài liệu theo danh sách Requirements. Snippet trong `LLM.md`/`architecture.md` chép từ mã thật, không bịa.
5. Xoá mã spike; `grep -rn "spike" src` trống.
6. Checklist `docs/architecture.md` §8 từng dòng; `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.
7. `node .gitnexus/run.cjs detect-changes --scope compare --base-ref main --repo .` → đính kết quả vào mô tả PR.

## Todo List

- [ ] GitNexus impact `ProcessAdbShell`; `detect-changes` sạch trước commit
- [ ] 10 mục kiểm tay có kết quả trong `manual-test-script.md`
- [ ] CSP kiểm trên bản build; kết luận ghi lại
- [ ] `LLM.md` §3/§5/§7/§10/§11/§12
- [ ] `docs/architecture.md` mẫu "tài nguyên sống ngoài một request", §6, §8
- [ ] `ProcessAdbShell.ts` một câu tham chiếu
- [ ] Xoá mã spike
- [ ] Checklist §8 + bốn lệnh xanh

## Success Criteria

- Bốn lệnh xanh trên bản build production; không CSP violation; không phiên ma sau 10 lần mở/đóng tab.
- Người mới đọc `LLM.md` biết đặt file mới của họ adb ở đâu và vì sao registry tồn tại.
- PR mô tả rõ: phạm vi (đầy đủ/chỉ xem), số đo trễ, những câu hỏi còn mở.

## Risk Assessment

| Rủi ro | Giảm nhẹ |
|---|---|
| Kiểm tay lộ lỗi lớn ở Tango trên Samsung (ví dụ dán chữ) | Ghi §11, không chặn PR nếu phần xem + chạm chạy |
| Tài liệu dài ra quá `docs.maxLoc` 800 của `.ck.json` | `LLM.md` hiện 449 dòng; thêm ≤ 40 dòng; `architecture.md` 331 → ≤ 360 |
| `detect-changes` degraded như `impact` | Ghi rõ vào PR là kiểm bằng grep + test, không coi là sạch |

## Security Considerations

- Xác nhận lại bằng tay: `curl` không cookie → 401 ở cả hai route; serial `-s x` → 400; `maxSize=99999` → 400; batch 65 thông điệp → 400; `sessionId` của người khác → 403.
- `detail` không xuống trình duyệt cho `upstream/notFound/forbidden` (thử đọc body lỗi).

## Next Steps

- Sau merge: mở plan nhỏ cho "để sau": tinyh264 fallback (+CSP), screencap gốc, audio, clipboard hai chiều, WebSocket nếu trễ vượt ngưỡng, nhiều pointer thật (màn cảm ứng).
