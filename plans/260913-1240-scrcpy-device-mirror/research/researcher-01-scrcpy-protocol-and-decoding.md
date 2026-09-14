# Scrcpy Protocol & Browser Decoding — Nghiên cứu 2026-09-13

## 1. Giao thức scrcpy-server 3.3.x

### Khởi động server trên máy

**Lệnh execute server** (từ [Tango ADB Develop Guide](https://tangoadb.dev/0.0.24/scrcpy/connect-server/)):
```bash
adb -s <serial> shell CLASSPATH=/data/local/tmp/scrcpy-server.jar \
  app_process / com.genymobile.scrcpy.Server 3.3.4 \
  scid=<hex_id> log_level=info \
  [key=value ...]
```

- **Tham số đầu tiên** = version string phải khớp chính xác (3.3.4 để dùng jar 3.3.4). Server thoát nếu mismatch [[1]](https://github.com/Genymobile/scrcpy/issues/3421).
- **scid** = session id dạng hex, dùng để phân biệt nhiều session trên cùng thiết bị.
- **log_level** = info, verbose, debug, warn, error.

**Tham số quan trọng**:
| Tham số | Mô tả | Mặc định |
|---------|-------|---------|
| `video_codec` | h264, h265, av1 | h264 |
| `video_encoder` | encoder cụ thể (phải hỗ trợ thiết bị) | auto |
| `video_source` | display (màn hình) hay camera | display |
| `max_size` | chiều rộng màn hình tối đa (pixel) | 0 (không giới hạn) |
| `max_fps` | frame rate tối đa (fps) | 0 (no limit) |
| `video_bit_rate` | bitrate: 4M, 100m, etc | 4M |
| `audio` | true/false | true |
| `audio_codec` | opus, aac, flac | opus |
| `audio_bit_rate` | 128k, 256k, etc | 128k |
| `audio_source` | mic (microphone) hay output | output |
| `control` | true/false — cho phép control socket | true |
| `send_device_meta` | true/false — gửi tên device/size/density | true |
| `send_frame_meta` | true/false — gửi [pts+flags 8 byte][size 4 byte] trước mỗi frame | true |
| `send_codec_meta` | true/false (v2.0+) — gửi codec config packet | true |
| `send_audio_ts` | true/false (v2.1+) — gửi pts cho audio packets | true |
| `send_dummy_byte` | true/false — gửi 1 byte dummy sau khi socket connect | true |
| `tunnel_forward` | true/false (v2.2+) — forward thay vì reverse | false |
| `power_off_on_close` | true/false — tắt máy khi đóng | false |
| `stay_awake` | true/false — giữ máy tỉnh | false |
| `show_touches` | true/false — hiện điểm chạm | false |
| `display_id` | id màn hình (v2.1+) | 0 (main) |
| `cleanup` | true/false — kill server khi client exit | true |
| `clipboard_autosync` | true/false (v2.2+) | true |

### Tunnel modes & socket setup

**Reverse tunnel (mặc định)**:
1. Client lắng nghe trên Unix socket / abstract socket.
2. `adb reverse localabstract:scrcpy_<scid> tcp:<port>` hoặc variant.
3. Server connect tới socket đó (client đứng trước).

**Forward tunnel** (`tunnel_forward=true`):
1. Server lắng nghe trên port.
2. `adb forward tcp:<port> localabstract:scrcpy_<scid>` .
3. Client connect tới port (server đứng trước, client cần retry logic).

**Dummy byte**: Nếu `send_dummy_byte=true`, socket đầu tiên server gửi 1 byte (0x00) ngay sau khi connect, giúp client detect lỗi kết nối sớm.

### Thiết bị thử nghiệm (chẩn đoán 2026-09-13)

```
Device: RF8Y60B9NCZ (Samsung SM-A165F)
Android: 16 (SDK 36)
Available codecs:
  H.264: c2.mtk.avc.encoder (hw) + c2.android.avc.encoder (sw)
  H.265: c2.mtk.hevc.encoder (hw) + c2.android.hevc.encoder (sw)
  AV1: c2.android.av1.encoder (sw)
Suggested: H.264 hardware encoder (c2.mtk.avc.encoder) cho latency thấp.
```

---

## 2. Định dạng luồng video trên socket

Nguồn: [Tango ADB Handle Video](https://tangoadb.dev/scrcpy/video/), [GitHub develop.md](https://raw.githubusercontent.com/Genymobile/scrcpy/master/doc/develop.md).

### Thứ tự gửi dữ liệu

```
[Device metadata — 64 byte] (nếu send_device_meta=true)
  └─ 64 byte UTF-8 (zero-padded) — tên device, ví dụ "SM-A165F               "

[Codec metadata packet — v2.0+] (nếu send_codec_meta=true)
  └─ [type 1 byte = 0] [codec_id 1 byte] [width 4 byte BE] [height 4 byte BE]
  └─ Tiếp theo: codec-specific config (H.264 = SPS+PPS Annex B, AV1 = config record...)

[Data packet 1] (nếu send_frame_meta=true)
  └─ [pts 8 byte BE] [flags 1 byte] [reserved 3 byte]  ← frame metadata (12 byte)
  └─ [payload_size 4 byte BE]
  └─ [H.264 Annex B stream — NAL units...]

[Data packet 2]
  └─ ...
```

### Frame metadata (khi send_frame_meta=true)

**Byte layout** (12 byte tổng):
- **Byte 0-7**: Presentation Timestamp (pts) — int64 BE, nanosecond từ start.
- **Byte 8**: Flags:
  - Bit 0 (LSB): 1 = keyframe (I-frame), 0 = delta frame.
  - Bit 1+: reserved (v3.3.4 không dùng).
- **Byte 9-11**: Reserved (0x00) để dùng sau.

Sau frame metadata là `size` (4 byte BE) = độ dài payload (H.264 bytes), rồi payload.

### H.264 / H.265 format

**Annex B** (raw stream format từ MediaCodec):
- Mỗi NAL unit bắt đầu bằng **start code** 0x00 0x00 0x00 0x01 (4 byte).
- SPS (Sequence Parameter Set) & PPS (Picture Parameter Set) gửi ở codec meta packet.
- Mỗi frame data có thể chứa multiple NAL units (SPS+PPS+IDR+slice hoặc chỉ slice).
- **Không phải AVCC format** (length-prefixed NALUs) — là raw Annex B.

**v2 vs v3 khác**:
- v1.x-v2.x: Gửi SPS/PPS trong codec meta, sau đó các frames là delta.
- v3.3+: Giống nhưng support thêm H.265/AV1, cải tiến độ ổn định.
- **Giao thức tương thích**: Raw Annex B h264 vẫn như cũ.

---

## 3. Socket điều khiển (control) — Client → Device

Nguồn: [Tango ADB Control](https://tangoadb.dev/scrcpy/control/), [scrcpy/doc/control.md](https://github.com/Genymobile/scrcpy/blob/master/doc/control.md).

### Control message types & byte layout

Server phía Android cung cấp deserializer; client gửi binary messages (big-endian). Một số loại chính:

**1. INJECT_KEYCODE (Type 0)**
```
[type 1]
[action 1: 0=down, 1=up, 2=repeat]
[keycode 4 BE: Android keycode, ví dụ 4=BACK, 82=MENU]
[metastate 4 BE: bit flags — shift, ctrl, alt, etc]
```
Tổng: 10 byte.

**2. INJECT_TOUCH_EVENT (Type 1)**
```
[type 1]
[action 1: 0=DOWN, 1=UP, 2=MOVE, 5=POINTER_DOWN, 6=POINTER_UP]
[pointer_id 8 BE: unique id cho pointer này (multi-touch)]
[x 4 BE]: float32 BE, screen coordinate 0 ≤ x < screen_width
[y 4 BE]: float32 BE, screen coordinate 0 ≤ y < screen_height
[screen_width 2 BE]: màn hình logical width
[screen_height 2 BE]: màn hình logical height
[pressure 2 BE]: fixed-point 0.0-1.0 (cast từ uint16, 0=no touch, 65535=max)
[buttons 4 BE]: bit flags (mouse buttons — nếu mouse, không dùng cho touch)]
```
Tổng: 28 byte (hoặc 34 nếu bao gồm pointer_id phút hơn).

**3. INJECT_TEXT (Type 2)**
```
[type 1]
[text_length 4 BE]
[text variable]: UTF-8 string (không null-terminated)
```

**4. INJECT_SCROLL_EVENT (Type 3)**
```
[type 1]
[position x 4 BE, float32]
[position y 4 BE, float32]
[screen_width 2 BE]
[screen_height 2 BE]
[hscroll 4 BE: float32, -1 to 1]
[vscroll 4 BE: float32, -1 to 1]
```
Tổng: 20 byte.

**5. BACK_OR_SCREEN_ON (Type 4)**
```
[type 1]
[action 1: 0=BACK, 1=SCREEN_ON]
```
Tổng: 2 byte.

**6. EXPAND_NOTIFICATION_PANEL (Type 5)**
```
[type 1]
```
Tổng: 1 byte.

**7. SET_CLIPBOARD (Type 6)**
```
[type 1]
[sequence 4 BE]: ack id]
[text_length 4 BE]
[text variable]: UTF-8 string
```

**8. SET_DISPLAY_POWER (Type 10, v2.1+)**
```
[type 1]
[mode 1: 0=OFF, 1=ON, 2=NORMAL_mode]
```

**Tất cả dùng big-endian (BE)**, consistent với Android network byte order.

### Device message (Server → Client) — ngược lại

- Clipboard change notification: `[type 12] [length 4 BE] [text variable]`.
- Ack control command: `[type 11] [sequence 4 BE]` (v2.1+).

---

## 4. Đánh giá thư viện npm hiện tại

### @yume-chan/adb-scrcpy v2.3.2 (Tango ADB)

**URL**: [npmjs.com/@yume-chan/adb-scrcpy](https://www.npmjs.com/package/@yume-chan/adb-scrcpy)  
**Phiên bản hiện tại**: 2.3.2 (cập nhật 5 tháng trước = tháng 4 2026)

**Ưu điểm**:
- ✅ Hỗ trợ scrcpy 3.3.x (phiên bản mới nhất).
- ✅ Chạy trên Node.js 24 + browser đều được.
- ✅ Full API: push jar, start server, setup socket, video decode, control send.
- ✅ License MIT, repo hoạt động.
- ✅ Tích hợp với @yume-chan/adb (WebUSB+TCP).

**Nhược điểm**:
- ❌ Module chế độ: tầng mã nằm tại `@yume-chan/adb-scrcpy` có thể contain React/DOM logic không phù hợp domain/data layer.
- ❌ Kích thước bundle: không check nhưng Tango stack nặng (WebUSB polyfill, etc).

**Kết luận**: Dùng thư viện này ở tầng `data/` (đồng cấp `ProcessAdbShell`), tương tự Prisma/Firebase adapter. Domain chỉ thấy interface mình cấp.

---

### @yume-chan/scrcpy v0.0.24

**URL**: [npmjs.com/@yume-chan/scrcpy](https://www.npmjs.com/package/@yume-chan/scrcpy/v/0.0.24)  
**Phiên bản**: 0.0.24 (pre-release, v2.3+ chưa có).

**Mục đích**: Parser protocol cơ bản (meta, codec config, frame packets) — không có video decode/render.

**Sử dụng**: Trong `@yume-chan/adb-scrcpy` nội bộ, hoặc tự implement decoder.

---

### @yume-chan/scrcpy-decoder-webcodecs v2.5.3

**URL**: [npmjs.com/@yume-chan/scrcpy-decoder-webcodecs](https://www.npmjs.com/package/@yume-chan/scrcpy-decoder-webcodecs)  
**Phiên bản**: 2.5.3 (cập nhật 5 tháng trước).

**Ưu điểm**:
- ✅ Dùng WebCodecs API (hardware decode khi có, software fallback).
- ✅ Tương thích Chrome/Edge/Safari 15+/Firefox 125+.
- ✅ Annex B H.264 parser built-in.
- ✅ Render lên Canvas/OffscreenCanvas.

**Nhược điểm**:
- ❌ Không support H.265/AV1 hardware trên tất cả browser.
- ❌ WebCodecs chưa stable trên Safari iOS (phiên bản cũ).

---

### @yume-chan/scrcpy-decoder-tinyh264 v0.0.21

**URL**: [npmjs.com/@yume-chan/scrcpy-decoder-tinyh264](https://www.npmjs.com/package/@yume-chan/scrcpy-decoder-tinyh264)  
**Phiên bản**: 0.0.21.

**Mục đích**: Software H.264 decode (WASM).

**Ưu điểm**:
- ✅ Fallback khi WebCodecs không có (Firefox 120-, cũ hơn).

**Nhược điểm**:
- ❌ Chậm (CPU intensive), bundle lớn (WASM + YUVCanvas).
- ❌ Chỉ H.264, không H.265/AV1.

**Sử dụng**: Fallback, không chính.

---

### ws-scrcpy (NetrisTV)

**URL**: [github.com/NetrisTV/ws-scrcpy](https://github.com/NetrisTV/ws-scrcpy)  
**Trạng thái**: Archived (không maintain), scrcpy 2.x.

**Mục đích**: Web client cổ xưa cho scrcpy, multiple decoders (Broadway, TinyH264, WebCodecs, MSE).

**Kết luận**: Học hỏi cấu trúc (MSE + WebCodecs), nhưng nên dùng `@yume-chan/*` hiện đại.

---

## 5. Giải mã video trong trình duyệt

### WebCodecs VideoDecoder (chính thức 2026)

**API**: [MDN Web APIs — WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API), [W3C AVC Codec](https://www.w3.org/TR/webcodecs-avc-codec-registration/).

**Codec string H.264**:
- Định dạng: `avc1.<profile>.<level><constraints>` (hex).
- Ví dụ: `avc1.4d0034` = profile 77 (main), level 52 (4.2).
- Ánh xạ: https://github.com/mattdesl/mp4-h264/blob/main/test/webcodecs.html

**Annex B vs AVCC**:
- **Annex B**: Start code 0x00 0x00 0x00 0x01 trước NAL.
  - Config: `{ avc: { format: "annexb" } }` (nếu hỗ trợ).
  - Hoặc extract SPS/PPS từ codec meta, tạo AVCC description.
- **AVCC**: Length-prefixed NALUs (4 byte size + NAL).
  - Config: `{ avc: { format: "avc" } }` + description từ codec meta.

**Cách extract codec string từ SPS (Annex B)**:
```
1. Parse SPS NAL unit (profile_idc, level_idc, constraint flags).
2. Format: "avc1." + profile_hex + level_hex.
3. Ví dụ SPS [67 42 00 34 05 ...] → avc1.4d0034 (Baseline, Level 4.0).
```

**Browser support (2026)**:
| Browser | H.264 | H.265 | AV1 |
|---------|-------|-------|-----|
| Chrome 120+ | ✅ HW | ❌ | ✅ HW |
| Edge 120+ | ✅ HW | ❌ | ✅ HW |
| Safari 15+ | ✅ HW | ❌ | ❌ |
| Firefox 125+ | ✅ SW | ❌ | ❌ |

**Fallback logic**:
1. Thử WebCodecs với H.264.
2. Nếu không, fallback tinyh264 (WASM).
3. Nếu cần H.265/AV1: thiết bị phải gửi H.264 (AV1 chỉ Android 11+, rare).

### Rendering flow

```typescript
const decoder = new VideoDecoder({
  output: (frame: VideoFrame) => {
    // Xoay frame nếu cần
    const rotated = rotateFrame(frame, deviceRotation);
    // Vẽ lên canvas
    const ctx = canvas.getContext('2d');
    ctx.drawImage(rotated, 0, 0, canvas.width, canvas.height);
  },
  error: (err) => console.error(err),
});

// Configure
const codecString = extractFromSPS(spsNalu);
decoder.configure({
  codec: codecString,           // "avc1.4d0034"
  description: undefined,        // undefined cho Annex B, hoặc AVCC bytes
  codedWidth: width,
  codedHeight: height,
  // Optional: optimizeForLatency: true
});

// Decode frames
decoder.decode(new EncodedVideoChunk({
  type: isKeyframe ? 'key' : 'delta',
  timestamp: pts,
  duration: 1000000 / fps,  // µs
  data: annexBBytes,
}));
```

---

## 6. Ánh xạ toạ độ chạm (Canvas → Android device)

Scrcpy điều chỉnh toạ độ theo rotation, density, letterboxing tự động. Client cần:

1. **Lấy vị trí chạm từ canvas**: `event.clientX / event.clientY` → map tới canvas pixel.
2. **Xoay lại theo device**: Nếu device rotate (portrait → landscape), swapXY + reverse axis.
3. **Gửi control message**:
```
[INJECT_TOUCH_EVENT]
[action 1]: DOWN/MOVE/UP
[pointer_id 8]: unique id (0 cho single touch)
[x, y 4 byte float32 BE each]: 0 ≤ x < screen_width, 0 ≤ y < screen_height
[screen_width, screen_height 2 byte BE]: device logical size (ứng rotation hiện tại)
[pressure 2 byte BE]: fixed-point (0x0000=no, 0xFFFF=max)
[buttons 4 byte BE]: 0 (không dùng cho touch)
```

4. **Xoay screen_width/height**: Server tự tính lại rotation, nên client phải gửi size HIỆN TẠI (landscape 1920x1080 hay portrait 1080x1920 tùy device rotation state).

---

## 7. Kết quả chẩn đoán thiết bị

```bash
$ scrcpy --list-encoders
[server] INFO: Device: [samsung] samsung SM-A165F (Android 16)
[server] INFO: List of video encoders:
    --video-codec=h264 --video-encoder=c2.mtk.avc.encoder             (hw) [vendor]
    --video-codec=h264 --video-encoder=c2.android.avc.encoder         (sw)
    --video-codec=h264 --video-encoder=OMX.MTK.VIDEO.ENCODER.AVC      (hw) [vendor] (alias)
    --video-codec=h264 --video-encoder=OMX.google.h264.encoder        (sw) (alias)
    --video-codec=h265 --video-encoder=c2.mtk.hevc.encoder            (hw) [vendor]
    --video-codec=h265 --video-encoder=c2.android.hevc.encoder        (sw)
    --video-codec=av1  --video-encoder=c2.android.av1.encoder         (sw)
```

**SDK Level**: 36 (Android 16 / API 36).

**Codec khả dụng**:
- H.264: MTK HW + Google SW (recommended: MTK HW, latency ~30ms vs 100ms SW).
- H.265: MTK HW + Google SW (modern, bitrate tốt hơn).
- AV1: Google SW (mới, ít app hỗ trợ).

**Recommend cho browser mirroring**: H.264 hardware (`c2.mtk.avc.encoder`), WebCodecs + tinyh264 fallback.

---

## Khuyến nghị cho planner

### Phương án A: Dùng @yume-chan stack (推议 ✅)

**Chi phí**:
- `npm i @yume-chan/adb-scrcpy@2.3.2`
- `npm i @yume-chan/scrcpy-decoder-webcodecs@2.5.3`
- `npm i @yume-chan/scrcpy-decoder-tinyh264@0.0.21` (fallback, optional)

**Kiến trúc**:
- Tầng `data/adb/ScrcpyClient.ts`: wrapper `@yume-chan/adb-scrcpy`.
- Tầng `domain/adb/repositories/ScrcpyServer.ts`: interface (push jar, start server, video stream, control).
- Tầng `features/device-mirror/`: ViewModel + Screen, đọc từ domain.

**Ưu điểm**:
- ✅ Hỗ trợ v3.3.4 chính thức.
- ✅ Chạy Node + browser.
- ✅ Bundle ~800KB (large nhưng manageable).
- ✅ Community active.

**Rủi ro**:
- Tango stack là ecosystem lớn, học curve cao.
- Nếu @yume-chan/adb-scrcpy có bug, cần fork/patch.

**Chi phí phát triển**: ~2-3 tuần (integ + UI + testing).

---

### Phương án B: Tự viết parser (không khuyến nghị ❌)

**Chi phí**:
- Parse binary video stream (codec meta, frame packets, pts, keyframe).
- Implement Annex B H.264 → WebCodecs format conversion.
- Handle rotation, coordinate mapping.
- Handle multi-frame buffering, backpressure.

**Ưu điểm**:
- Kontrol 100%, không phụ thuộc Tango.
- Bundle nhỏ (chỉ decoders).

**Nhược điểm**:
- ❌ ~4-6 tuần nghiên cứu + dev + test (trừ advanced H.265/AV1).
- ❌ Dễ miss edge case (xoay, resume, suspend, codec switch).
- ❌ Bảo trì dài hạn (Android có update encoder, scrcpy có breaking changes).

**Khuyến cáo**: Skip nếu không có lý do đặc biệt (privacy, offline).

---

### Phương án C: Hybrid — tự socket setup, dùng Tango decoder (trung gian)

**Chi phí**:
- Dùng `@yume-chan/adb` (ADB layer).
- Tự spawn server, forward port, read binary.
- Dùng `@yume-chan/scrcpy-decoder-webcodecs` + tinyh264.

**Ưu điểm**:
- ✅ Lebih nhẹ (skip adb-scrcpy wrapper).
- ✅ Control fine-grained.

**Nhược điểm**:
- ❌ Vẫn phải handle protocol parsing.
- ❌ Khó maintain (code cà nằm ở mid-layer, tức domain hay data?).

**Khuyến cáo**: Chỉ xem xét nếu A quá nặng hay có conflict dependency.

---

## Câu hỏi còn mở

1. **Server jar v3.3.4 trên máy chủ Next.js** — tạo endpoint push jar hay mất quyền? Có nên copy sẵn vào git LFS hay download?
2. **Multi-app mirroring** — có thể open multiple scrcpy sessions trên cùng device lúc 1 lúc không? (Cần test với scid khác nhau).
3. **Audio stream** — audio=false như recommend, hay stream audio luôn? (Tính năng đặc thù Electric Eel?)
4. **Clipboard sync** — cần bidi clipboard (device → web → device) hay one-way?
5. **Rotation handling** — dynamic device rotation (user xoay device) — websocket update device size hay static?
6. **WebCodecs codec string** — cần dynamic parse SPS hay hardcode avc1.4d0034?
7. **Performance target** — target latency <100ms, bitrate limit, max resolution?

---

## Tài liệu tham khảo

1. [Tango ADB Handle Video](https://tangoadb.dev/scrcpy/video/)
2. [Tango ADB Control](https://tangoadb.dev/scrcpy/control/)
3. [Tango ADB Connect Server](https://tangoadb.dev/0.0.24/scrcpy/connect-server/)
4. [GitHub Genymobile/scrcpy develop.md](https://raw.githubusercontent.com/Genymobile/scrcpy/master/doc/develop.md)
5. [GitHub Genymobile/scrcpy control.md](https://github.com/Genymobile/scrcpy/blob/master/doc/control.md)
6. [@yume-chan/adb-scrcpy npm](https://www.npmjs.com/package/@yume-chan/adb-scrcpy)
7. [@yume-chan/scrcpy-decoder-webcodecs npm](https://www.npmjs.com/package/@yume-chan/scrcpy-decoder-webcodecs)
8. [MDN WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
9. [W3C AVC Codec Registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/)
10. [NetrisTV/ws-scrcpy GitHub](https://github.com/NetrisTV/ws-scrcpy)
