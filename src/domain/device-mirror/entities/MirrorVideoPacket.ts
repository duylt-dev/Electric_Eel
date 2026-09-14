/**
 * Một gói video từ scrcpy-server, sau khi domain đơn giản hoá kiểu của Tango.
 *
 * ─── Header gốc của scrcpy (không phải thứ ta parse — đọc để hiểu VÌ SAO) ───
 *
 * scrcpy-server gửi mỗi gói kèm 12 byte header trước dữ liệu H.264:
 *
 *     byte 0-7   PTS (u64 BE) — hai bit CAO NHẤT (63, 62) là CỜ, không phải
 *                phần của con số: bit 63 = CONFIG (gói cấu hình, không có PTS
 *                thật), bit 62 = KEY_FRAME.
 *     byte 8-11  kích cỡ payload (u32 BE)
 *
 * `@yume-chan/scrcpy` (Tango) đã tách 12 byte đó hộ ta:
 * `AdbScrcpyVideoStream.stream` là `ReadableStream<ScrcpyMediaStreamPacket>`,
 * trả thẳng object JS — `{ type: 'configuration', data }` hoặc
 * `{ type: 'data', keyframe?: boolean, pts?: bigint, data }` (xem
 * `spike-report.md` §2 mục 1). Domain KHÔNG tự đọc bit nào của header gốc, và
 * không cần tới nếu Tango còn giữ nguyên cách parse này.
 *
 * ─── Vì sao domain đổi tên field và bỏ optional ───
 *
 * `keyframe` và `pts` của Tango là OPTIONAL (`?`) vì cùng một kiểu còn phải tả
 * cả gói `configuration` (không có hai field này). Domain tách hẳn thành union
 * theo `type` nên nhánh `frame` không cần optional nữa — `keyframe`/`pts` LUÔN
 * có mặt khi `type === 'frame'`. Việc quy đổi (`keyframe === true`, `pts ??
 * 0n`) là việc của adapter phase 03 khi đọc từ Tango, KHÔNG phải của domain —
 * xem `MirrorDeviceGateway`.
 *
 * `pts` là **micro-giây (µs)**, không phải nano-giây — đo trực tiếp trên máy
 * thật ở phase 01 (`ptsStep` giữa hai khung liên tiếp đúng bằng 100000 khi màn
 * hình đổi mỗi 100ms; nếu là ns thì bước phải là 100.000.000). Nhầm đơn vị này
 * thì mọi phép tính fps hay độ trễ hiển thị sai 1000 lần, mà không có gì báo
 * lỗi — số vẫn "trông hợp lý" ở một đơn vị khác.
 */
export type MirrorVideoPacket =
  | { readonly type: 'config'; readonly data: Uint8Array }
  | { readonly type: 'frame'; readonly keyframe: boolean; readonly pts: bigint; readonly data: Uint8Array }
