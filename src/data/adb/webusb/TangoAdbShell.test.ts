import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Adb } from '@yume-chan/adb'

import { TangoAdbShell, toDeviceCommand } from './TangoAdbShell'

/**
 * `Adb` giả chỉ có phần `subprocess` mà shell dùng. Mỗi lần spawn ghi lại lệnh
 * đã nhận và trả về một tiến trình in sẵn stdout/stderr rồi thoát với `code`.
 */
interface Scripted {
  readonly stdout: string
  readonly stderr?: string
  readonly code?: number
}

const encoder = new TextEncoder()

const streamOf = (text: string): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      // Chẻ làm hai mẩu để chắc chắn dòng được ghép lại.
      const mid = Math.floor(text.length / 2)
      controller.enqueue(encoder.encode(text.slice(0, mid)))
      controller.enqueue(encoder.encode(text.slice(mid)))
      controller.close()
    },
  })

function fakeAdb(script: Scripted, options: { shellV2?: boolean } = {}): {
  adb: Adb
  spawned: (readonly string[])[]
  killed: () => number
} {
  const spawned: (readonly string[])[] = []
  let kills = 0
  const shellV2 = options.shellV2 ?? true

  const spawnShell = async (command: readonly string[]) => {
    spawned.push(command)
    return {
      stdout: streamOf(script.stdout),
      stderr: streamOf(script.stderr ?? ''),
      exited: Promise.resolve(script.code ?? 0),
      kill: () => {
        kills += 1
      },
    }
  }
  const spawnNone = async (command: readonly string[]) => {
    spawned.push(command)
    return {
      output: streamOf(script.stdout),
      exited: Promise.resolve(undefined),
      kill: () => {
        kills += 1
      },
    }
  }

  const adb = {
    serial: 'A',
    subprocess: {
      shellProtocol: shellV2 ? { isSupported: true, spawn: spawnShell } : undefined,
      noneProtocol: { spawn: spawnNone },
    },
  } as unknown as Adb

  return { adb, spawned, killed: () => kills }
}

describe('toDeviceCommand', () => {
  it('bỏ `shell`, giữ nguyên `logcat`, từ chối lệnh không có tương đương', () => {
    assert.deepEqual(toDeviceCommand(['shell', 'pidof', '-s', 'com.a']), { ok: true, value: ['pidof', '-s', 'com.a'] })
    assert.deepEqual(toDeviceCommand(['logcat', '-c']), { ok: true, value: ['logcat', '-c'] })
    const devices = toDeviceCommand(['devices', '-l'])
    assert.equal(devices.ok, false)
    if (!devices.ok) assert.equal(devices.error.kind, 'validation')
  })
})

describe('TangoAdbShell.run', () => {
  it('trả stdout/stderr/mã thoát qua shell v2', async () => {
    const { adb, spawned } = fakeAdb({ stdout: '1234\n', stderr: '', code: 0 })
    const shell = new TangoAdbShell(adb)

    const output = await shell.run({ serial: 'A', args: ['shell', 'pidof', '-s', 'com.a'] })
    assert.equal(output.ok, true)
    if (output.ok) assert.deepEqual(output.value, { stdout: '1234\n', stderr: '', code: 0 })
    assert.deepEqual(spawned, [['pidof', '-s', 'com.a']])
  })

  it('giao thức cũ: mã thoát coi là 0, stderr rỗng', async () => {
    const { adb } = fakeAdb({ stdout: 'package:com.a\n' }, { shellV2: false })
    const output = await new TangoAdbShell(adb).run({ serial: 'A', args: ['shell', 'pm', 'list', 'packages'] })
    assert.equal(output.ok, true)
    if (output.ok) assert.deepEqual(output.value, { stdout: 'package:com.a\n', stderr: '', code: 0 })
  })

  it('từ chối lệnh gửi cho máy khác trước khi chạy', async () => {
    const { adb, spawned } = fakeAdb({ stdout: '' })
    const output = await new TangoAdbShell(adb).run({ serial: 'B', args: ['shell', 'id'] })
    assert.equal(output.ok, false)
    if (!output.ok) assert.equal(output.error.kind, 'validation')
    assert.deepEqual(spawned, [])
  })

  it('bị huỷ trước khi chạy thì không spawn', async () => {
    const { adb, spawned } = fakeAdb({ stdout: '' })
    const controller = new AbortController()
    controller.abort()
    const output = await new TangoAdbShell(adb).run({ serial: 'A', args: ['shell', 'id'] }, controller.signal)
    assert.equal(output.ok, false)
    if (!output.ok) assert.equal(output.error.kind, 'cancelled')
    assert.deepEqual(spawned, [])
  })
})

describe('TangoAdbShell.stream', () => {
  it('gọi onLine từng dòng trọn vẹn rồi trả mã thoát', async () => {
    const { adb, spawned } = fakeAdb({ stdout: 'dòng một\ndòng hai\n', code: 0 })
    const lines: string[] = []
    const exit = await new TangoAdbShell(adb).stream(
      { serial: 'A', args: ['logcat', '-v', 'threadtime', '--pid', '7'] },
      (line) => lines.push(line),
    )
    assert.deepEqual(lines, ['dòng một', 'dòng hai'])
    assert.equal(exit.ok, true)
    if (exit.ok) assert.equal(exit.value.code, 0)
    assert.deepEqual(spawned, [['logcat', '-v', 'threadtime', '--pid', '7']])
  })
})
