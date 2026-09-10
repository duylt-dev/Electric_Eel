import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { deviceLabel, isSafeSerial, parseDevicesOutput } from './AdbDevice'

describe('parseDevicesOutput', () => {
  it('đọc serial, trạng thái và model của từng máy', () => {
    const devices = parseDevicesOutput(
      [
        'List of devices attached',
        'emulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 transport_id:1',
        'R58M12ABCDE            device product:oriole model:Pixel_6 transport_id:3',
      ].join('\n'),
    )

    assert.equal(devices.length, 2)
    assert.equal(devices[0]?.serial, 'emulator-5554')
    assert.equal(devices[0]?.model, 'sdk_gphone64_arm64')
    assert.equal(devices[1]?.serial, 'R58M12ABCDE')
    assert.equal(devices[1]?.model, 'Pixel_6')
  })

  it('giữ lại máy chưa cho phép gỡ lỗi, dù nó không kèm model', () => {
    const devices = parseDevicesOutput('List of devices attached\nR58M12ABCDE   unauthorized usb:338690048')

    // Ẩn máy này đi thì người vừa cắm cáp thấy danh sách trống và tưởng tool hỏng.
    assert.equal(devices.length, 1)
    assert.equal(devices[0]?.state, 'unauthorized')
    assert.equal(devices[0]?.model, null)
  })

  it('bỏ qua dòng tiêu đề, dòng trống và thông báo khởi động daemon', () => {
    const devices = parseDevicesOutput(
      [
        '* daemon not running; starting now at tcp:5037',
        '* daemon started successfully',
        'List of devices attached',
        '',
      ].join('\n'),
    )
    assert.deepEqual(devices, [])
  })

  it('không nhận serial mở đầu bằng dấu gạch ngang', () => {
    // Một serial như vậy sẽ bị chính adb đọc thành cờ dòng lệnh.
    const devices = parseDevicesOutput('List of devices attached\n-danger   device')
    assert.deepEqual(devices, [])
  })
})

describe('isSafeSerial', () => {
  it('nhận serial thật', () => {
    for (const serial of ['emulator-5554', 'R58M12ABCDE', '192.168.1.20:5555', '1234abcd']) {
      assert.equal(isSafeSerial(serial), true, serial)
    }
  })

  it('từ chối thứ có thể biến thành cờ hoặc lệnh khác', () => {
    for (const serial of ['-s', '--help', 'a b', 'a;rm -rf /', '', 'a$(id)']) {
      assert.equal(isSafeSerial(serial), false, serial)
    }
  })
})

describe('deviceLabel', () => {
  it('ưu tiên model, và thay gạch dưới bằng khoảng trắng', () => {
    assert.equal(
      deviceLabel({ serial: 'x', state: 'device', model: 'Pixel_6', product: null }),
      'Pixel 6',
    )
  })

  it('lùi về serial khi adb không nói model', () => {
    assert.equal(
      deviceLabel({ serial: 'R58M12', state: 'device', model: null, product: null }),
      'R58M12',
    )
  })
})
