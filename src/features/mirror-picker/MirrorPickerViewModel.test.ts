import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createViewModel } from '@/core/mvi/createViewModel'
import { type Result, ok } from '@/core/result'
import type { AdbDevice } from '@/domain/adb/entities/AdbDevice'
import type { AdbRepository } from '@/domain/adb/repositories/AdbRepository'
import { MirrorPickerViewModel } from './MirrorPickerViewModel'
import type { MirrorPickerEffect } from './MirrorPickerContract'

/**
 * Test cho ViewModel, chạy không cần React — đúng mẫu `ConfigEditorViewModel.test.ts`:
 * gọi `onIntent` rồi đọc `store.getState()`, không render gì.
 */

const device = (serial: string, state: AdbDevice['state'] = 'device'): AdbDevice => ({
  serial,
  state,
  model: null,
  product: null,
})

class FakeAdbRepository implements AdbRepository {
  constructor(private readonly devices: AdbDevice[]) {}

  listDevices(): Promise<Result<AdbDevice[]>> {
    return Promise.resolve(ok(this.devices))
  }

  listPackages(): Promise<Result<string[]>> {
    return Promise.resolve(ok([]))
  }

  clearBuffer(): Promise<Result<void>> {
    return Promise.resolve(ok(undefined))
  }

  streamLogcat(): Promise<Result<void>> {
    return Promise.resolve(ok(undefined))
  }
}

const makeViewModel = (devices: AdbDevice[]) => {
  const effects: MirrorPickerEffect[] = []
  const vm = createViewModel(MirrorPickerViewModel.definition, { adb: new FakeAdbRepository(devices) })
  vm.connectEffects((effect) => effects.push(effect))
  return { vm, effects }
}

/** Cho vòng lặp sự kiện chạy hết các promise đã xếp hàng. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('MirrorPickerViewModel', () => {
  it('0 máy → không tự chọn gì', async () => {
    const { vm } = makeViewModel([])
    await settle()

    const state = vm.store.getState()
    assert.equal(state.status, 'ready')
    assert.equal(state.selectedSerial, null)
  })

  it('1 máy dùng được → tự chọn nó, không bắt bấm', async () => {
    const { vm } = makeViewModel([device('RF8Y60B9NCZ')])
    await settle()

    assert.equal(vm.store.getState().selectedSerial, 'RF8Y60B9NCZ')
  })

  it('2 máy trở lên → không đoán, để trống', async () => {
    const { vm } = makeViewModel([device('AAA'), device('BBB')])
    await settle()

    assert.equal(vm.store.getState().selectedSerial, null)
  })

  it('MirrorOpened khi chưa chọn máy → ShowMessage, không mở gì', async () => {
    const { vm, effects } = makeViewModel([])
    await settle()

    vm.onIntent({ type: 'MirrorOpened' })
    await settle()

    assert.ok(effects.some((effect) => effect.type === 'ShowMessage'))
    assert.ok(!effects.some((effect) => effect.type === 'OpenMirror'))
  })

  it('MirrorOpened khi đã chọn máy → OpenMirror đúng serial', async () => {
    const { vm, effects } = makeViewModel([device('RF8Y60B9NCZ')])
    await settle()

    vm.onIntent({ type: 'MirrorOpened' })
    await settle()

    const opened = effects.find(
      (effect): effect is Extract<MirrorPickerEffect, { type: 'OpenMirror' }> => effect.type === 'OpenMirror',
    )
    assert.equal(opened?.serial, 'RF8Y60B9NCZ')
  })
})
