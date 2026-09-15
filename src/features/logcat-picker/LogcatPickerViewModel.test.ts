import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createViewModel } from '@/core/mvi/createViewModel'
import { AppErrors, type Result, err, ok } from '@/core/result'
import type { AdbDevice } from '@/domain/adb/entities/AdbDevice'
import type { DeviceWatchEvent } from '@/domain/adb/entities/DeviceWatchEvent'
import type { PackageLabelEvent } from '@/domain/adb/entities/PackageLabelEvent'
import type { AdbRepository } from '@/domain/adb/repositories/AdbRepository'
import { LogcatPickerViewModel } from './LogcatPickerViewModel'

/**
 * Fake `AdbRepository` với MỘT máy (để `autoSelectDevice` tự chọn nó), ba app,
 * và một kịch bản nhãn dùng chung cho mọi lần `streamPackageLabels`. Ghi lại
 * `signal` để khẳng định đổi máy huỷ luồng cũ.
 */
class FakeAdb implements AdbRepository {
  readonly labelSignals: AbortSignal[] = []
  /** `hold` = sau khi phát hết sự kiện vẫn giữ luồng mở cho tới khi bị huỷ — như máy chủ đang đọc dở. */
  constructor(
    private readonly labelEvents: PackageLabelEvent[],
    private readonly hold = false,
  ) {}

  async listDevices(): Promise<Result<AdbDevice[]>> {
    return ok([{ serial: 'A', state: 'device', model: 'SM-A165F', product: null }])
  }
  /** Báo một máy rồi giữ luồng mở như máy chủ thật — chỉ về khi bị huỷ. */
  async watchDevices(
    onEvent: (event: DeviceWatchEvent) => void,
    signal: AbortSignal,
  ): Promise<Result<void>> {
    const devices = await this.listDevices()
    if (devices.ok) onEvent({ type: 'devices', devices: devices.value })
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
    return err(AppErrors.cancelled('Đã dừng.'))
  }
  async listPackages(): Promise<Result<string[]>> {
    return ok(['com.a', 'com.b', 'com.c'])
  }
  async streamPackageLabels(
    _serial: string,
    onEvent: (event: PackageLabelEvent) => void,
    signal: AbortSignal,
  ): Promise<Result<void>> {
    this.labelSignals.push(signal)
    for (const event of this.labelEvents) {
      await Promise.resolve()
      if (signal.aborted) break
      onEvent(event)
    }
    if (this.hold && !signal.aborted) {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
      return err(AppErrors.cancelled('Đã dừng.'))
    }
    return ok(undefined)
  }
  async clearBuffer(): Promise<Result<void>> {
    return ok(undefined)
  }
  async streamLogcat(): Promise<Result<void>> {
    return ok(undefined)
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5))

describe('LogcatPickerViewModel — nhãn app', () => {
  it('điền nhãn máy dần vào state sau khi có danh sách', async () => {
    const adb = new FakeAdb([
      { type: 'label', packageName: 'com.a', label: 'App A' },
      { type: 'label', packageName: 'com.c', label: 'App C' },
      { type: 'done' },
    ])
    const vm = createViewModel(LogcatPickerViewModel.definition, { adb })
    vm.start()
    await settle()

    const state = vm.store.getState()
    assert.equal(state.packagesStatus, 'ready')
    assert.deepEqual(state.deviceLabels, { 'com.a': 'App A', 'com.c': 'App C' })
    assert.equal(state.labelsStatus, 'ready')
    vm.dispose()
  })

  it('máy chủ không có aapt2 → unavailable kèm lời nhắn, danh sách vẫn ready', async () => {
    const adb = new FakeAdb([{ type: 'unavailable', message: 'Không tìm thấy aapt2' }, { type: 'done' }])
    const vm = createViewModel(LogcatPickerViewModel.definition, { adb })
    vm.start()
    await settle()

    const state = vm.store.getState()
    assert.equal(state.packagesStatus, 'ready')
    assert.equal(state.labelsStatus, 'unavailable')
    assert.equal(state.labelsMessage, 'Không tìm thấy aapt2')
    vm.dispose()
  })

  it('đổi máy thì bỏ nhãn cũ và huỷ luồng đang đọc', async () => {
    const adb = new FakeAdb([{ type: 'label', packageName: 'com.a', label: 'App A' }], true)
    const vm = createViewModel(LogcatPickerViewModel.definition, { adb })
    vm.start()
    await settle()
    assert.deepEqual(vm.store.getState().deviceLabels, { 'com.a': 'App A' })
    assert.equal(vm.store.getState().labelsStatus, 'loading')

    vm.onIntent({ type: 'DeviceSelected', serial: 'B' })
    assert.deepEqual(vm.store.getState().deviceLabels, {})
    assert.equal(adb.labelSignals[0]?.aborted, true)
    await settle()
    assert.equal(vm.store.getState().selectedSerial, 'B')
    assert.equal(adb.labelSignals.length, 2)
    vm.dispose()
  })
})

/**
 * Fake mà TEST điều khiển được luồng thiết bị: đẩy từng sự kiện bằng `push`
 * để dựng kịch bản cắm / rút cáp trong lúc app đang nạp.
 */
class ScriptedAdb extends FakeAdb {
  private emit: ((event: DeviceWatchEvent) => void) | null = null

  override async watchDevices(
    onEvent: (event: DeviceWatchEvent) => void,
    signal: AbortSignal,
  ): Promise<Result<void>> {
    this.emit = onEvent
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
    return err(AppErrors.cancelled('Đã dừng.'))
  }
  push(event: DeviceWatchEvent): void {
    this.emit?.(event)
  }
}

const device = (serial: string, state: AdbDevice['state'] = 'device'): AdbDevice => ({
  serial,
  state,
  model: null,
  product: null,
})

describe('LogcatPickerViewModel — theo dõi thiết bị', () => {
  it('cắm máy là tự chọn và nạp app; rút máy là bỏ chọn và bỏ danh sách', async () => {
    const adb = new ScriptedAdb([{ type: 'done' }])
    const vm = createViewModel(LogcatPickerViewModel.definition, { adb })
    vm.start()
    await settle()
    assert.equal(vm.store.getState().status, 'loading')

    adb.push({ type: 'devices', devices: [] })
    assert.equal(vm.store.getState().status, 'ready')
    assert.equal(vm.store.getState().selectedSerial, null)

    adb.push({ type: 'devices', devices: [device('A')] })
    await settle()
    assert.equal(vm.store.getState().selectedSerial, 'A')
    assert.deepEqual(vm.store.getState().packageNames, ['com.a', 'com.b', 'com.c'])

    adb.push({ type: 'devices', devices: [] })
    await settle()
    assert.equal(vm.store.getState().selectedSerial, null)
    assert.deepEqual(vm.store.getState().packageNames, [])
    assert.equal(vm.store.getState().packagesStatus, 'idle')
    vm.dispose()
  })

  it('chọn máy KHÔNG làm chết luồng theo dõi: sự kiện sau đó vẫn vào state', async () => {
    const adb = new ScriptedAdb([{ type: 'done' }])
    const vm = createViewModel(LogcatPickerViewModel.definition, { adb })
    vm.start()
    await settle()
    adb.push({ type: 'devices', devices: [device('A'), device('B')] })
    assert.equal(vm.store.getState().selectedSerial, null)

    vm.onIntent({ type: 'DeviceSelected', serial: 'B' })
    await settle()
    assert.equal(vm.store.getState().selectedSerial, 'B')

    adb.push({ type: 'devices', devices: [device('A'), device('B', 'offline')] })
    await settle()
    // Máy đang chọn rớt → tự chọn A vì chỉ còn một máy dùng được.
    assert.equal(vm.store.getState().selectedSerial, 'A')
    assert.equal(vm.store.getState().devices.length, 2)
    vm.dispose()
  })

  it('lỗi một nhịp thì đỏ khối thiết bị nhưng danh sách cũ vẫn giữ', async () => {
    const adb = new ScriptedAdb([{ type: 'done' }])
    const vm = createViewModel(LogcatPickerViewModel.definition, { adb })
    vm.start()
    await settle()
    adb.push({ type: 'devices', devices: [device('A')] })
    adb.push({ type: 'failed', message: 'adb lỡ nhịp' })

    const state = vm.store.getState()
    assert.equal(state.status, 'failed')
    assert.equal(state.error?.message, 'adb lỡ nhịp')
    assert.equal(state.devices.length, 1)
    vm.dispose()
  })
})
