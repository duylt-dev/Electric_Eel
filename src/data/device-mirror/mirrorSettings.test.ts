import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readMirrorSettings } from './mirrorSettings'

const BASE_ENV: NodeJS.ProcessEnv = { NODE_ENV: 'development' }

describe('readMirrorSettings', () => {
  it('từ chối khi ADB tắt — dùng chung cờ ADB_ENABLED với Logcat', () => {
    const result = readMirrorSettings({ ...BASE_ENV, ADB_ENABLED: 'false' }, () => true)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.kind, 'forbidden')
  })

  it('dùng SCRCPY_SERVER_PATH khi có và file tồn tại', () => {
    const result = readMirrorSettings(
      { ...BASE_ENV, SCRCPY_SERVER_PATH: '/tuy/chinh/scrcpy-server' },
      (path) => path === '/tuy/chinh/scrcpy-server',
    )
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.value.jarPath, '/tuy/chinh/scrcpy-server')
  })

  it('SCRCPY_SERVER_PATH trỏ tới file không tồn tại → notFound', () => {
    const result = readMirrorSettings({ ...BASE_ENV, SCRCPY_SERVER_PATH: '/khong/co/that' }, () => false)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.kind, 'notFound')
  })

  it('SCRCPY_SERVER_PATH trống → dò lần lượt ba đường dẫn mặc định', () => {
    const result = readMirrorSettings({ ...BASE_ENV }, (path) => path === '/usr/local/share/scrcpy/scrcpy-server')
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.value.jarPath, '/usr/local/share/scrcpy/scrcpy-server')
  })

  it('không dò thấy đường dẫn mặc định nào → notFound', () => {
    const result = readMirrorSettings({ ...BASE_ENV }, () => false)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.kind, 'notFound')
  })

  it('SCRCPY_SERVER_VERSION trống → mặc định 3.3.4', () => {
    const result = readMirrorSettings({ ...BASE_ENV, SCRCPY_SERVER_PATH: '/a' }, () => true)
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.value.version, '3.3.4')
  })

  it('SCRCPY_SERVER_VERSION sai định dạng → validation', () => {
    const result = readMirrorSettings(
      { ...BASE_ENV, SCRCPY_SERVER_PATH: '/a', SCRCPY_SERVER_VERSION: 'ba-cham-ba' },
      () => true,
    )
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.kind, 'validation')
  })

  it('SCRCPY_SERVER_VERSION đúng định dạng x.y hoặc x.y.z → nhận', () => {
    const short = readMirrorSettings({ ...BASE_ENV, SCRCPY_SERVER_PATH: '/a', SCRCPY_SERVER_VERSION: '3.3' }, () => true)
    assert.equal(short.ok, true)
    if (short.ok) assert.equal(short.value.version, '3.3')

    const long = readMirrorSettings(
      { ...BASE_ENV, SCRCPY_SERVER_PATH: '/a', SCRCPY_SERVER_VERSION: '3.3.1' },
      () => true,
    )
    assert.equal(long.ok, true)
    if (long.ok) assert.equal(long.value.version, '3.3.1')
  })
})
