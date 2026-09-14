'use client'

/* eslint-disable no-restricted-imports -- mã spike phase 01, phase 03/05 thay bằng adapter trong data/ rồi xoá */
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useRef, useState } from 'react'

import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy'
import { ScrcpyVideoCodecId } from '@yume-chan/scrcpy'
import { WebCodecsVideoDecoder, WebGLVideoFrameRenderer } from '@yume-chan/scrcpy-decoder-webcodecs'

/**
 * Trang TẠM của spike phase 01 — phase 05 thay bằng `features/device-mirror/`
 * thật (Contract/ViewModel/Screen). Ở đây `useState` giữ luôn dữ liệu vì đây
 * KHÔNG phải màn hình sản phẩm, chỉ để mắt người xác nhận khung hình vẽ được.
 *
 * Framing đọc từ route phải khớp CHÍNH XÁC với `encodeMessage`/
 * `encodeFramePayload` ở `src/app/api/adb/mirror/spike/route.ts`:
 * `[u32 BE len][u8 kind][payload]`, kind 2 = configuration, kind 3 = data
 * (`payload = [u8 keyframe][u64 BE pts][data]`).
 */
const KIND_CONFIG = 2
const KIND_FRAME = 3
const RTT_SAMPLES = 20

type Status = 'idle' | 'connecting' | 'streaming' | 'error'

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength)
  out.set(a, 0)
  out.set(b, a.byteLength)
  return out
}

/** Tách một message hoàn chỉnh khỏi đầu buffer, nếu đã đủ byte. */
function takeMessage(buffer: Uint8Array): { kind: number; payload: Uint8Array; rest: Uint8Array } | null {
  if (buffer.byteLength < 4) return null
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const len = view.getUint32(0, false)
  if (buffer.byteLength < 4 + len) return null
  const kind = view.getUint8(4)
  const payload = buffer.slice(5, 4 + len)
  return { kind, payload, rest: buffer.slice(4 + len) }
}

function toMediaStreamPacket(kind: number, payload: Uint8Array): ScrcpyMediaStreamPacket | null {
  if (kind === KIND_CONFIG) return { type: 'configuration', data: payload }
  if (kind === KIND_FRAME) {
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
    return { type: 'data', keyframe: view.getUint8(0) === 1, pts: view.getBigUint64(1, false), data: payload.slice(9) }
  }
  return null
}

export default function MirrorSpikePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [serial, setSerial] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [packetCount, setPacketCount] = useState(0)
  const [ttffMs, setTtffMs] = useState<number | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [rtt, setRtt] = useState<{ p50: number; p95: number } | null>(null)
  const [rttRunning, setRttRunning] = useState(false)

  const start = useCallback(async () => {
    setError(null)
    setPacketCount(0)
    setTtffMs(null)
    setSize(null)
    setStatus('connecting')

    if (!WebCodecsVideoDecoder.isSupported) {
      setError('Trình duyệt này không hỗ trợ WebCodecs — dùng Chrome hoặc Edge bản mới.')
      setStatus('error')
      return
    }
    const canvas = canvasRef.current
    if (canvas === null) return

    const decoder = new WebCodecsVideoDecoder({
      codec: ScrcpyVideoCodecId.H264,
      renderer: new WebGLVideoFrameRenderer(canvas),
    })
    decoder.sizeChanged(({ width, height }) => setSize({ width, height }))
    const writer = decoder.writable.getWriter()

    const startedAt = performance.now()
    let firstKeyframeSeen = false

    try {
      const response = await fetch('/api/adb/mirror/spike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial }),
      })
      if (!response.ok || response.body === null) {
        const failure = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(failure?.error?.message ?? `Route trả về mã ${String(response.status)}.`)
      }
      setStatus('streaming')

      const reader = response.body.getReader()
      // Chú thích kiểu tường minh: nếu để suy luận từ `new Uint8Array(0)`, TS
      // khoá biến này vào `Uint8Array<ArrayBuffer>` — hẹp hơn kiểu trả về của
      // `.slice()`/`concatBytes()` (`Uint8Array<ArrayBufferLike>`) và gãy ở
      // mỗi lần gán lại bên dưới.
      let buffer: Uint8Array = new Uint8Array(0)

      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer = concatBytes(buffer, value)

        let message = takeMessage(buffer)
        while (message !== null) {
          buffer = message.rest
          const packet = toMediaStreamPacket(message.kind, message.payload)
          if (packet !== null) {
            await writer.write(packet)
            setPacketCount((count) => count + 1)
            if (!firstKeyframeSeen && packet.type === 'data' && packet.keyframe === true) {
              firstKeyframeSeen = true
              setTtffMs(Math.round(performance.now() - startedAt))
            }
          }
          message = takeMessage(buffer)
        }
      }
      setStatus('idle')
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown))
      setStatus('error')
    }
  }, [serial])

  /** 20 lượt POST thân rỗng — route trả 204 ngay, không mở phiên video. */
  const measureRtt = useCallback(async () => {
    setRttRunning(true)
    const samples: number[] = []
    for (let i = 0; i < RTT_SAMPLES; i++) {
      const startedAt = performance.now()
      await fetch('/api/adb/mirror/spike', { method: 'POST' })
      samples.push(performance.now() - startedAt)
    }
    samples.sort((a, b) => a - b)
    const p50 = samples[Math.floor(samples.length * 0.5)] ?? 0
    const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))] ?? 0
    setRtt({ p50: Math.round(p50), p95: Math.round(p95) })
    setRttRunning(false)
  }, [])

  return (
    <Stack spacing={2} sx={{ p: 3, maxWidth: 720 }}>
      <Typography variant="h5">Spike: Mirror màn hình (tạm)</Typography>
      <Typography variant="body2" color="text.secondary">
        Trang chẩn đoán của phase 01 — sẽ bị thay bằng màn hình thật ở phase 05.
      </Typography>

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <TextField
          label="Serial thiết bị"
          size="small"
          value={serial}
          onChange={(event) => setSerial(event.target.value)}
          placeholder="vd: RF8Y60B9NCZ"
        />
        <Button
          variant="contained"
          onClick={() => void start()}
          disabled={status === 'connecting' || status === 'streaming'}
        >
          Bắt đầu
        </Button>
        <Button variant="outlined" onClick={() => void measureRtt()} disabled={rttRunning}>
          Đo RTT (20 lượt)
        </Button>
      </Stack>

      {error !== null && <Alert severity="error">{error}</Alert>}

      <Box>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', maxWidth: 480, border: '1px solid #444', background: '#000' }}
        />
      </Box>

      <Typography variant="body2">
        Trạng thái: {status} · Gói đã nhận: {packetCount} · TTFF:{' '}
        {ttffMs === null ? '—' : `${String(ttffMs)}ms`} · Kích cỡ:{' '}
        {size === null ? '—' : `${String(size.width)}×${String(size.height)}`}
      </Typography>

      {rtt !== null && (
        <Typography variant="body2">
          RTT control (thân rỗng): p50 = {rtt.p50}ms, p95 = {rtt.p95}ms
        </Typography>
      )}
    </Stack>
  )
}
