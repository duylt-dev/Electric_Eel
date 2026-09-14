import type { AppErrorKind } from '../../../core/result'
import type { MirrorStreamEvent } from './MirrorStreamEvent'

/**
 * Mã hoá/giải mã PAYLOAD của từng `kind` khung — tách khỏi
 * `mirrorFrameCodec.ts` chỉ để giữ mỗi file dưới 200 dòng (`development-rules.md`).
 * Hai file luôn đi cùng nhau về mặt khái niệm; xem doc comment ở
 * `mirrorFrameCodec.ts` cho ý nghĩa của từng `kind`.
 */
export const KIND_META = 1
export const KIND_CONFIG = 2
export const KIND_FRAME = 3
export const KIND_SIZE = 4
export const KIND_FAILED = 5

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export function encodeMeta(event: Extract<MirrorStreamEvent, { type: 'meta' }>): Uint8Array {
  return textEncoder.encode(
    JSON.stringify({
      sessionId: event.sessionId,
      deviceName: event.deviceName,
      width: event.width,
      height: event.height,
      codec: event.codec,
      control: event.control,
    }),
  )
}

export function encodeFailed(event: Extract<MirrorStreamEvent, { type: 'failed' }>): Uint8Array {
  return textEncoder.encode(
    JSON.stringify({
      kind: event.kind,
      message: event.message,
      ...(event.detail !== undefined ? { detail: event.detail } : {}),
    }),
  )
}

export function encodeFramePayload(keyframe: boolean, pts: bigint, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + 8 + data.byteLength)
  out[0] = keyframe ? 1 : 0
  new DataView(out.buffer).setBigUint64(1, pts, false)
  out.set(data, 9)
  return out
}

export function encodeSizePayload(width: number, height: number): Uint8Array {
  const out = new Uint8Array(4)
  const view = new DataView(out.buffer)
  view.setUint16(0, width, false)
  view.setUint16(2, height, false)
  return out
}

export function failedEvent(message: string): MirrorStreamEvent {
  return { type: 'failed', kind: 'unknown', message }
}

function decodeMeta(payload: Uint8Array): MirrorStreamEvent {
  try {
    const raw = JSON.parse(textDecoder.decode(payload)) as Record<string, unknown>
    if (
      typeof raw.sessionId !== 'string' ||
      typeof raw.deviceName !== 'string' ||
      typeof raw.width !== 'number' ||
      typeof raw.height !== 'number' ||
      raw.codec !== 'h264' ||
      typeof raw.control !== 'boolean'
    ) {
      return failedEvent('Gói meta thiếu hoặc sai kiểu trường.')
    }
    return {
      type: 'meta',
      sessionId: raw.sessionId,
      deviceName: raw.deviceName,
      width: raw.width,
      height: raw.height,
      codec: 'h264',
      control: raw.control,
    }
  } catch {
    return failedEvent('Gói meta không phải JSON hợp lệ.')
  }
}

function decodeFailed(payload: Uint8Array): MirrorStreamEvent {
  try {
    const raw = JSON.parse(textDecoder.decode(payload)) as Record<string, unknown>
    if (typeof raw.kind !== 'string' || typeof raw.message !== 'string') {
      return failedEvent('Gói failed thiếu hoặc sai kiểu trường.')
    }
    return {
      type: 'failed',
      kind: raw.kind as AppErrorKind,
      message: raw.message,
      ...(typeof raw.detail === 'string' ? { detail: raw.detail } : {}),
    }
  } catch {
    return failedEvent('Gói failed không phải JSON hợp lệ.')
  }
}

function decodeFrame(payload: Uint8Array): MirrorStreamEvent {
  if (payload.byteLength < 9) return failedEvent('Gói frame thiếu header.')
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const keyframe = (view.getUint8(0) & 0x1) !== 0
  const pts = view.getBigUint64(1, false)
  return { type: 'video', packet: { type: 'frame', keyframe, pts, data: payload.slice(9) } }
}

function decodeSize(payload: Uint8Array): MirrorStreamEvent {
  if (payload.byteLength < 4) return failedEvent('Gói size thiếu byte.')
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  return { type: 'size', width: view.getUint16(0, false), height: view.getUint16(2, false) }
}

export function decodeMessage(kind: number, payload: Uint8Array): MirrorStreamEvent {
  switch (kind) {
    case KIND_META:
      return decodeMeta(payload)
    case KIND_CONFIG:
      return { type: 'video', packet: { type: 'config', data: payload } }
    case KIND_FRAME:
      return decodeFrame(payload)
    case KIND_SIZE:
      return decodeSize(payload)
    case KIND_FAILED:
      return decodeFailed(payload)
    default:
      return failedEvent(`Kind khung không rõ: ${String(kind)}.`)
  }
}
