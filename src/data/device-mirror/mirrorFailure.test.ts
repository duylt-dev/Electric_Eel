import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AdbScrcpyExitedError } from '@yume-chan/adb-scrcpy'

import { AppErrors } from '../../core/result'
import { describeMirrorFailure } from './mirrorFailure'

/** Output nguyên văn chép từ `spike-report.md` §1.2 (chế độ `bad-version`). */
const BAD_VERSION_OUTPUT = [
  '[server] ERROR: The server version (3.3.4) does not match the client (3.3.3)',
  'java.lang.IllegalArgumentException: The server version (3.3.4) does not match the client (3.3.3)',
  '\tat com.genymobile.scrcpy.Options.parse(Options.java:299)',
  '\tat com.genymobile.scrcpy.Server.internalMain(Server.java:238)',
]

describe('describeMirrorFailure', () => {
  it('ECONNREFUSED → network, nói rõ phải start-server', () => {
    const thrown = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5037'), { code: 'ECONNREFUSED' })
    const error = describeMirrorFailure(thrown, [], '/opt/homebrew/share/scrcpy/scrcpy-server', '3.3.4')
    assert.equal(error.kind, 'network')
    assert.match(error.message, /adb start-server/)
  })

  it('ENOENT khi đẩy jar → notFound, cùng câu với mirrorSettings', () => {
    const thrown = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    const error = describeMirrorFailure(thrown, [], '/tmp/khong-ton-tai', '3.3.4')
    assert.equal(error.kind, 'notFound')
    assert.match(error.message, /brew install scrcpy/)
  })

  it('EACCES khi đẩy jar → forbidden; đường dẫn máy chủ ở `detail` (chỉ log), KHÔNG ở `message`', () => {
    const thrown = Object.assign(new Error('EACCES'), { code: 'EACCES' })
    const error = describeMirrorFailure(thrown, [], '/opt/scrcpy-server', '3.3.4')
    assert.equal(error.kind, 'forbidden')
    assert.match(error.message, /SCRCPY_SERVER_PATH/)
    assert.doesNotMatch(error.message, /\/opt\/scrcpy-server/)
    assert.equal(error.detail, '/opt/scrcpy-server')
  })

  it('AppError ném từ raceAbort (huỷ / hết giờ) → trả nguyên, không quy thành unknown', () => {
    const cancelled = describeMirrorFailure(AppErrors.cancelled('Đã huỷ.'), [], '/x', '3.3.4')
    assert.equal(cancelled.kind, 'cancelled')
    const timedOut = describeMirrorFailure(AppErrors.network('scrcpy-server không trả lời sau 15s.'), [], '/x', '3.3.4')
    assert.equal(timedOut.kind, 'network')
  })

  it('AdbScrcpyExitedError với dòng "does not match" → upstream, trích đúng bản SERVER (3.3.4)', () => {
    const thrown = new AdbScrcpyExitedError(BAD_VERSION_OUTPUT)
    const error = describeMirrorFailure(thrown, [], '/opt/homebrew/share/scrcpy/scrcpy-server', '3.3.3')
    assert.equal(error.kind, 'upstream')
    assert.match(error.message, /SCRCPY_SERVER_VERSION=3\.3\.4/)
    assert.ok(error.detail?.includes('does not match'))
  })

  it('output gom riêng (không qua AdbScrcpyExitedError) vẫn trích được bản version lệch', () => {
    const thrown = new Error('videoStream never resolved')
    const error = describeMirrorFailure(thrown, BAD_VERSION_OUTPUT, '/opt/scrcpy-server', '3.3.3')
    assert.equal(error.kind, 'upstream')
    assert.match(error.message, /SCRCPY_SERVER_VERSION=3\.3\.4/)
  })

  it('dòng "device not found"/"no devices" → notFound', () => {
    const error = describeMirrorFailure(
      new Error('adb error'),
      ['error: device \'RF8Y60B9NCZ\' not found'],
      '/opt/scrcpy-server',
      '3.3.4',
    )
    assert.equal(error.kind, 'notFound')
  })

  it('"unauthorized" trong message hoặc output → forbidden', () => {
    const error = describeMirrorFailure(new Error('device unauthorized'), [], '/opt/scrcpy-server', '3.3.4')
    assert.equal(error.kind, 'forbidden')
  })

  it('AdbScrcpyExitedError khác (không version, không device, không unauthorized) → upstream với detail = output', () => {
    const thrown = new AdbScrcpyExitedError(['Aborted '])
    const error = describeMirrorFailure(thrown, [], '/opt/scrcpy-server', '3.3.4')
    assert.equal(error.kind, 'upstream')
    assert.equal(error.detail, 'Aborted ')
  })

  it('còn lại → unknown, giữ detail để chẩn đoán', () => {
    const error = describeMirrorFailure(new Error('bí ẩn'), [], '/opt/scrcpy-server', '3.3.4')
    assert.equal(error.kind, 'unknown')
    assert.match(error.detail ?? '', /bí ẩn/)
  })

  it('capOutputLines cắt output dài về tối đa 200 dòng, giữ phần CUỐI', () => {
    const long = Array.from({ length: 250 }, (_, i) => `dòng ${String(i)}`)
    const thrown = new AdbScrcpyExitedError([...long, 'does not match'])
    const error = describeMirrorFailure(thrown, [], '/opt/scrcpy-server', '3.3.4')
    assert.equal(error.detail?.split('\n').length, 200)
    assert.ok(error.detail?.endsWith('does not match'))
  })
})
