# Next.js 16.3: Đường truyền và vòng đời để mirror scrcpy

**Phạm vi:** Vận chuyển luồng video nhị phân độ trễ thấp & sự kiện điều khiển hai chiều qua Next.js Route Handler, vòng đời phiên, bảo mật, quan sát lỗi.

**Tiền lệ trực tiếp:** Logcat (`src/app/api/adb/logcat/route.ts`) dùng `ReadableStream`, `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, header `X-Accel-Buffering: no`, sống theo `request.signal`.

---

## 1. Đường xuống (video): ReadableStream + NDJSON framing

### Cách chọn: ReadableStream

Theo `node_modules/next/dist/docs/01-app/02-guides/streaming.md` và `01-app/01-getting-started/15-route-handlers.md`: Route Handler chấp nhận `Response` với `ReadableStream<Uint8Array>`. Streaming tự động; Next.js **không đệm** bên trong đối với kích thước lớn (`X-Accel-Buffering: no` chỉ chặn proxy, không chặn Next).

**Độ trễ:** HTTP/1.1 (localhost dev) không có pipelining nên khô khoác — mỗi chunk chờ ACK từ trình duyệt rồi mới gửi chunk kế.  Tuy nhiên:
- Backpressure tự động: `ReadableStream` chỉ `enqueue()` khi `controller.desiredSize > 0` để tránh tích tụ buffer bên server
- **Không có timeout ngầm** tại `next dev` với streaming (chỉ `maxDuration` kiểm soát tổng thời gian; xem `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`)
- Trình duyệt đọc chậm → `desiredSize` sẽ âm → server giãn cách `enqueue()` tự động

### Framing (length-prefixed NDJSON)

Logcat hiện dùng NDJSON (một JSON/dòng) — dùng lại.  Cho video nhị phân:
```ts
// Ghi trên server
const frame = new Uint8Array(…);  // video frame, ~100KB
const len = frame.length;
const lenBuf = new Uint8Array(4);
new DataView(lenBuf.buffer).setUint32(0, len, false); // big-endian
controller.enqueue(lenBuf);
controller.enqueue(frame);
```

Phía trình duyệt, `response.body.getReader()`:
```ts
while (true) {
  const {value, done} = await reader.read();
  if (done) break;
  // Gom value vào buffer, khi có đủ 4 byte → đọc length → chờ frame
}
```

**Chi phí:** 4 byte/frame là đáng kể so với video — SSE base64 mất 33%, length-prefix mất chưa đến 1%. WebSocket header tiêu tốn ~2 byte overhead/frame.

### CSP & Workers

`next.config.ts` hiện có:
- `connect-src 'self'` — fetch POST đến Route Handler ✓
- `worker-src` **không khai** → Web Worker chịu `default-src 'self'` ✓
- `blob:` **được phép** trong `img-src` (để canvas → blob → `<img src=blob:>` hoặc WebCodecs) ✓

Web Worker decrypt H.264 được. WASM decoder cũng cần `blob:` cho .wasm import — hiện CSP cho phép.

---

## 2. Đường lên (điều khiển): 5 phương án

### (A) POST lô sự kiện (gom 16ms = 1 frame)

```ts
const events = [];
const send = () => {
  fetch('/api/adb/scrcpy/event', {
    method: 'POST',
    body: JSON.stringify(events),
    keepalive: true,  // request sống sót tab đóng
  });
  events = [];
};
requestAnimationFrame(() => { if (events.length) send(); });
```

**Độ trễ:** 16ms gom + HTTP round-trip (~50ms dev) = **~66ms round-trip, 33ms tới server**.  
**Ưu:** Đơn giản, không cần protocol mới, CSP cho phép.  
**Nhược:** Gom có giới hạn, sự kiện không khẩn cấp (phím lên/xuống sẽ trễ 33ms).

### (B) POST duplex: `ReadableStream` cho body

```ts
const controller = new ReadableStreamDefaultController();
const requestBody = new ReadableStream(…);
fetch('/api/adb/scrcpy/event', {
  method: 'POST',
  body: requestBody,
  duplex: 'half',  // body là stream, response cũng stream
}).then(r => r.body.pipeTo(…));
```

**Hỗ trợ trình duyệt:** Chromium chỉ cho phép `duplex: 'half'` qua **HTTP/2+**. Localhost dev thường chạy HTTP/1.1 → gãy. Safari 16+, Firefox 128+ hỗ trợ nhưng cần HTTP/2.

**Độ trễ:** Tưởng tượng là tốt, nhưng HTTP/1.1 dev không dùng được.

**Kết luận:** Loại.

### (C) WebTransport

```ts
const transport = new WebTransport('https://localhost:3000/webtransport');
const writer = transport.datagrams.writable.getWriter();
```

**Hỗ trợ:** Chrome 118+, Edge, Safari 17+ (deadline). Firefox chưa.  
**CSP:** `connect-src` cần `webtransport:` nếu có. Hiện `next.config.ts` không khai — phải thêm.  
**Khó:** Cần custom server hoặc middleware QUIC, không phải Route Handler tiêu chuẩn.

**Kết luận:** Quá mới cho production 2026; xem như dự phòng sau.

### (D) WebSocket qua custom server (port riêng)

```ts
// server.ts
import { createServer } from 'http'
import next from 'next'
import { WebSocketServer } from 'ws'

const app = next({ dev: process.env.NODE_ENV !== 'production' })
const handle = app.getRequestHandler()
const httpServer = createServer((req, res) => handle(req, res))
const wss = new WebSocketServer({ noServer: true })

httpServer.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws/scrcpy') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      // Lấy user từ cookie Auth.js JWT
      const token = req.headers.cookie?.match(/auth-token=([^;]+)/)?.[1]
      if (!token) { ws.close(); return; }
      
      ws.on('message', handleScrcpyEvent)
    })
  }
})
```

**Lợi thế:** Bidirectional tinh khôi, độ trễ tối thiểu (~10ms localhost).  
**Nhược:**
- Custom server: `next dev` → `node server.ts`, mất Hot Module Reload tự động
- CSP: thêm `connect-src 'self' ws://localhost:3000` (chỉ dev; prod dùng `wss:`)
- **Next.js 16.3 custom server vẫn hỗ trợ**, nhưng:
  - Không có `next dev` chuẩn (phải chạy `node server.js`)
  - HMR phải cấu hình tay (thêm `ws://localhost:3000/_next/webpack-hmr`)
  - Turbopack / webpack cần tuning

**Cách xác thực:**
- Cookie auth: `next-auth` lưu JWT trong cookie `__Secure-auth-token` (secure mode) hoặc `auth-token` (dev)
- Handshake: decode JWT trực tiếp trong handler (giống `requireUser()`) hay gọi `/api/auth/session` async trước khi upgrade ✗ (slow)
- **Tốt nhất:** expose endpoint `/api/auth/verify` POST `{token}` → `{userId, serial}` và gọi từ server trước upgrade

### (E) WebSocket trên port khác qua `instrumentation.ts`

```ts
// instrumentation.ts
import { WebSocketServer } from 'ws'
import { createServer } from 'http'

const wsServer = createServer()
const wss = new WebSocketServer({ server: wsServer })

wss.on('connection', (ws, req) => {
  // Decode cookie / query token
  const token = new URL(req.url, 'http://localhost').searchParams.get('token')
  // … verify & track
})

wsServer.listen(3001)  // Port khác; CSP: connect-src cần wss://localhost:3001
```

**Lợi thế:** Tách riêng WebSocket khỏi Next.js, không cần custom server.  
**Nhược:**
- Khởi động không đồng bộ: `register()` chạy **trước** Next.js ready (xem docs), có khả năng race condition
- Chia sẻ xác thực khó: cookie chỉ gửi qua same-origin (localhost:3000 vs localhost:3001 là khác); phải dùng query parameter → thoát URL → bảo mật
- CSP `connect-src wss://localhost:3001` khó cấu hình động (localhost:3000 vs production domain)

**Kết luận loại** cho scrcpy.

---

## 3. Khuyến nghị transport

**Phương án chính:** **(A) POST lô 16ms + fallback duplex**.

1. **Bình thường:** (A) POST lô qua `requestAnimationFrame`, gom tối đa 50 sự kiện / frame
2. **Khi HTTP/2 available (production):** Detect via `navigator.connection.type` hoặc cử chỉ test — chuyển sang (B) duplex
3. **Triển khai:** Cấu hình bộ gom tại `src/features/device-mirror/eventBuffer.ts` (hàm thuần, test được); phía trình duyệt dùng hook `useScrcpyEventBuffer()`

**Chi phí:**
- (A): +50ms latency đóng góp lớn nhất; tập chợ điều khiển trễ nhưng thấu được
- (B): phức tạp protocol, cần HTTP/2 detector, giữ code path cho production

---

## 4. Ghép kênh & vòng đời phiên

### Mô hình phiên

```ts
interface ScrcpySession {
  id: string                 // uuid
  userId: string
  serial: string
  timedAt: Date              // heartbeat cuối cùng
  process: ChildProcess      // adb forward + scrcpy-server
  ffmpegWs?: WebSocketServer // nếu dùng WebSocket
}

const sessions = new Map<string, ScrcpySession>()
```

**Tạo phiên:** POST `/api/adb/scrcpy/start` → kiểm quyền (`requireAppAccess`), sinh `sessionId`, spawn `adb forward tcp:NNN localhost:1313` (scrcpy port), giữ process lại.

**Hai kênh:**
- **Video:** GET `/api/adb/scrcpy/video?sessionId=xxx` → trả `ReadableStream`, gọi `sessions.get(xxx).process`
- **Control:** POST `/api/adb/scrcpy/event?sessionId=xxx` ← nhận JSON sự kiện, ghi qua `adb shell input` hoặc socket tới scrcpy-server

**Đóng phiên:**
- Tab đóng → trình duyệt không gửi heartbeat trong 30s → server timeout, kill process
- Hoặc POST `/api/adb/scrcpy/stop?sessionId=xxx` rõ ràng

**Số phiên đồng thời:** Mỗi user tối 1 phiên/serial (scrcpy-server chỉ chấp 1 client). Nên check `sessions` trước khi spawn.

### Vòng đời tiến trình

```ts
async function startScrcpySession(serial, userId) {
  if (sessions.has(serial)) return err('Session tồn tại')
  
  const sessionId = generateUUID()
  
  // 1. adb forward
  const fwd = await shell.run({serial, args: ['forward', 'tcp:27183', 'localabstract:scrcpy']})
  
  // 2. spawn scrcpy-server
  const proc = spawn(SCRCPY_SERVER_JAR, […options], { signal: ctx.signal })
  
  // 3. Lưu lại
  const session: ScrcpySession = {id: sessionId, userId, serial, timedAt: new Date(), process: proc}
  sessions.set(sessionId, session)
  
  // 4. Heartbeat: client gửi ping mỗi 10s
  // Server: nếu không nhận ping 30s → kill
  
  // 5. cleanup
  proc.on('exit', () => {
    sessions.delete(sessionId)
    shell.run({serial, args: ['forward', '--remove', 'tcp:27183']})
  })
  
  return ok({sessionId})
}
```

**Module scope bảng phiên:**
- HMR dev: nếu viết `const sessions = new Map()` ở module level → HMR **không khởi động lại module được** (tiến trình con sống sót reload, leak)
- **Cách tránh:** Dùng `globalThis` + kiểm tra khởi tạo:

```ts
globalThis.scrcpySessions ??= new Map()
export const sessions = globalThis.scrcpySessions
```

Hoặc dùng singleton trong DI container (`serverContainer.scrcpy.sessions()`).

---

## 5. Bảo mật

### Xác thực

Cả hai kênh (video & event) phải gọi `requireUser()` đầu tiên:

```ts
export async function GET(req: Request) {
  const user = await requireUser()
  if (!user.ok) return jsonError(user.error)
  
  const {sessionId} = Object.fromEntries(new URL(req.url).searchParams)
  const session = sessions.get(sessionId)
  if (!session || session.userId !== user.value.id) {
    return jsonError(AppErrors.forbidden('Session không phải của bạn'))
  }
```

### Kiểm serial & tham số adb

Đã có `isSafeSerial()` — dùng. Tham số scrcpy (max_size, bit_rate, max_fps) **chỉ nhận enum / số**:

```ts
const options = {
  max_size: Math.min(body.max_size || 1920, 2560),  // ceil
  bit_rate: Math.min(body.bit_rate || 8000000, 50000000),
  max_fps: Math.min(body.max_fps || 60, 120),
}
// Không cho custom đường dẫn hay shell command
```

### SCRCPY_ENABLED cờ

Dùng cùng cơ chế `ADB_ENABLED`:

```ts
// adbSettings.ts
export function isScrcpyEnabled(env = process.env): boolean {
  const raw = env.SCRCPY_ENABLED?.trim().toLowerCase()
  if (raw && TRUE_VALUES.has(raw)) return true
  if (raw && FALSE_VALUES.has(raw)) return false
  return env.NODE_ENV !== 'production'  // mặc định bật ở dev
}

export function readScrcpySettings(env = process.env): Result<{jarPath: string}> {
  if (!isScrcpyEnabled(env)) {
    return err(AppErrors.forbidden('scrcpy không bật'))
  }
  const jarPath = env.SCRCPY_SERVER_JAR_PATH
  if (!jarPath) return err(AppErrors.notFound('SCRCPY_SERVER_JAR_PATH thiếu'))
  return ok({jarPath})
}
```

### AuditLog

Theo `LLM.md` §11 #12: **dịch chuỗi & logcat KHÔNG ghi** (tiết kiệm DB). Scrcpy tương tự — hàng chục lượt/ngày, mỗi lượt chỉ nói "ai vừa xem".  
**Mặc định: KHÔNG ghi**. Nếu cần: thêm `SCRCPY_STREAM` vào `AuditAction` enum, gọi `audit.record()` trong route.

### CSP

Thêm vào `next.config.ts`:
```ts
`connect-src 'self'${isDevelopment ? ' ws: wss:' : ''}`,
// worker-src không cần nếu không dùng web worker
```

---

## 6. Quan sát & xử lý lỗi

### Báo lỗi qua luồng video

Nếu scrcpy-server thoát trước khi video đầy đủ:
```ts
if (closed) return
try {
  controller.enqueue(…)
} catch {
  // browser closed, stop gracefully
  closed = true
}

// Khi process exit
proc.on('exit', (code) => {
  if (code !== 0 && !closed) {
    // Gửi frame đặc biệt: {type: 'error', kind: 'unknown', message: '…'}
    // Phía browser: readNdjson() → nó là error, từ bỏ stream
  }
  // …cleanup
})
```

### Ánh xạ lỗi → AppError

Theo `docs/architecture.md` §3: hàm hỏng trả `Result<T, AppError>`.

```ts
export async function getScrcpySession(sessionId: string): Promise<Result<ScrcpySession>> {
  const session = sessions.get(sessionId)
  if (!session) return err(AppErrors.notFound('Phiên hết hạn'))
  
  // spawn lỗi
  const proc = spawn(jar, [...])
  proc.on('error', (thrown) => {
    // AppErrors.notFound(jar not found) / AppErrors.unknown(spawn failed)
  })
  
  return ok(session)
}
```

---

## 7. Kiểm thử

Theo `LLM.md` §9: `node:test` + `tsx`, không framework thêm.

### Hàm thuần

- `framing.ts`: encode/decode length-prefixed frame → kiểm assert byte
- `scrcpySession.ts`: tạo/tìm phiên → giả `processStore`, kiểm lifecycle

```ts
// scrcpySession.test.ts
import { test } from 'node:test'
import { createScrcpySession } from './scrcpySession'

test('session cleanup on process exit', async (t) => {
  const mockProc = { kill: () => {}, on: (ev, cb) => ev === 'exit' && cb(0) }
  const mockShell = { run: async () => ok({…}) }
  const result = await createScrcpySession('ABC123', 'user-1', {mockProc, mockShell})
  assert(result.ok)
  // Trigger process 'exit' → session xoá khỏi map
  assert(!sessions.has(result.value.sessionId))
})
```

### Route Handler

Tích hợp tay: khởi động `next dev`, fetch `/api/adb/scrcpy/start`, xác minh tiến trình spawn, kiểm heartbeat timeout.

---

## Khuyến nghị cho planner

**Phương án chính:**
1. POST lô 16ms cho control (A) + duplex dự phòng (B)
2. ReadableStream cho video, length-prefixed
3. Vòng đời phiên: DI container + `globalThis` fallback
4. Custom server để WebSocket nếu sau này cần độ trễ < 30ms

**Dự phòng:** WebTransport nếu production target HTTP/2+.

**Các file sẽ chạm:**
- `src/data/adb/ScrcpySessionManager.ts` (mới) — spawn, lifetime
- `src/app/api/adb/scrcpy/start/route.ts` (mới) — xác thực, tạo phiên
- `src/app/api/adb/scrcpy/video/route.ts` (mới) — stream ReadableStream
- `src/app/api/adb/scrcpy/event/route.ts` (mới) — nhận điều khiển
- `src/data/adb/adbSettings.ts` (sửa) — thêm `isScrcpyEnabled` / `readScrcpySettings`
- `next.config.ts` (sửa) — CSP `worker-src` nếu dùng Web Worker decoder
- `instrumentation.ts` (sửa) — assert `SCRCPY_SERVER_JAR_PATH` hoặc ghi log warning

---

## Câu hỏi còn mở

1. **HTTP/2 detection:** Trình duyệt có cách nào phát hiện HTTP/2 trước khi fetch để chọn duplex vs POST lô không? (PerformanceNavigationTiming? `navigator.connection`?)
2. **WebSocket authentication:** Có nên verify token qua `/api/auth/verify` hay decode JWT trực tiếp? Async verify chậm nhưng an toàn hơn.
3. **Session timeout:** 30s không hoạt động → cleanup có quá ngắn không? (Hoặc 60-90s?)
4. **Khởi động scrcpy:** Có cần hiển thị loading UI cho 1-2s spawn-time không, hay ẩn?
5. **Nhiều máy dev:** `SCRCPY_SERVER_JAR_PATH` bắt buộc hay tùy chọn? (Nếu tùy chọn, báo gì khi thiếu — 404 hay 403?)
