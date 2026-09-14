import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createViewModel } from '@/core/mvi/createViewModel'
import { type AppError, AppErrors, type Result, err, ok } from '@/core/result'
import type { MirrorRequest } from '@/domain/device-mirror/entities/MirrorRequest'
import type { MirrorStreamEvent } from '@/domain/device-mirror/entities/MirrorStreamEvent'
import type { MirrorVideoPacket } from '@/domain/device-mirror/entities/MirrorVideoPacket'
import type { MirrorRepository } from '@/domain/device-mirror/repositories/MirrorRepository'
import type { MirrorVideoSink } from '@/domain/device-mirror/repositories/MirrorVideoSink'
import { DeviceMirrorViewModel } from './DeviceMirrorViewModel'
import type { DeviceMirrorEffect } from './DeviceMirrorContract'

/**
 * Test cho ViewModel, chạy không cần React — đúng mẫu `ConfigEditorViewModel.test.ts`.
 *
 * Fake `MirrorRepository` phát một KỊCH BẢN sự kiện cố định mỗi lần `stream()`
 * được gọi (một kịch bản cho mỗi lần gọi liên tiếp), rồi trả kết quả cuối đã
 * định. Mọi `request` nhận được đều được ghi lại để khẳng định lần gọi thứ hai
 * (đổi chất lượng / đổi cờ điều khiển) mang đúng tham số mới.
 */
interface StreamScript {
  events: MirrorStreamEvent[]
  /**
   * `'pending'` = luồng vẫn còn mở sau khi phát hết sự kiện (không bao giờ
   * resolve) — dùng để đọc state NGAY GIỮA phiên, trước khi có gì làm nó rơi
   * về `stopped`. Kịch bản thật của scrcpy hiếm khi tự đóng ngay sau `meta`.
   */
  outcome: Result<void> | 'pending'
}

class FakeMirrorRepository implements MirrorRepository {
  readonly requests: MirrorRequest[] = []
  /** `signal` của từng lượt `stream()`, cùng chỉ số với `requests` — để khẳng định lượt cũ ĐÃ bị huỷ. */
  readonly signals: AbortSignal[] = []
  private callIndex = 0

  constructor(private readonly scripts: StreamScript[]) {}

  async stream(
    request: MirrorRequest,
    onEvent: (event: MirrorStreamEvent) => void,
    signal: AbortSignal,
  ): Promise<Result<void>> {
    this.requests.push(request)
    this.signals.push(signal)
    const script = this.scripts[this.callIndex] ?? this.scripts.at(-1)
    this.callIndex += 1
    if (script === undefined) {
      throw new Error('FakeMirrorRepository: chưa cấu hình kịch bản nào.')
    }

    for (const event of script.events) {
      if (signal.aborted) return err(AppErrors.cancelled('Thao tác đã bị huỷ.'))
      onEvent(event)
      // Nhường một tick cho `ctx.signal.aborted` có cơ hội trở thành true nếu
      // một lượt mới cùng khoá vừa huỷ lượt này.
      await Promise.resolve()
    }

    if (script.outcome === 'pending') {
      return new Promise<Result<void>>(() => {
        /* không bao giờ resolve trong đời test — mô phỏng luồng còn đang mở. */
      })
    }
    return script.outcome
  }

  sendControl(): Promise<Result<void>> {
    return Promise.resolve(ok(undefined))
  }
}

class FakeVideoSink implements MirrorVideoSink {
  pushCount = 0
  private readonly errorListeners = new Set<(error: AppError) => void>()

  constructor(readonly supported: boolean = true) {}

  push(_packet: MirrorVideoPacket): void {
    this.pushCount += 1
  }

  onError(listener: (error: AppError) => void): () => void {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  /** Mô phỏng decoder hỏng giữa phiên. */
  failDecoder(error: AppError): void {
    for (const listener of this.errorListeners) listener(error)
  }

  snapshotPng(): Promise<Result<Uint8Array>> {
    return Promise.resolve(ok(new Uint8Array()))
  }

  dispose(): void {}
}

const makeViewModel = (repo: FakeMirrorRepository, sink: FakeVideoSink = new FakeVideoSink()) => {
  const effects: DeviceMirrorEffect[] = []
  const vm = createViewModel(DeviceMirrorViewModel.definition, {
    mirror: repo,
    videoSink: sink,
    serial: 'RF8Y60B9NCZ',
  })
  vm.connectEffects((effect) => effects.push(effect))
  return { vm, effects, sink }
}

/** Cho vòng lặp sự kiện chạy hết các promise đã xếp hàng. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const META: MirrorStreamEvent = {
  type: 'meta',
  sessionId: 's1',
  deviceName: 'Pixel 7',
  width: 1080,
  height: 2400,
  codec: 'h264',
  control: false,
}

describe('DeviceMirrorViewModel', () => {
  it('trình duyệt không hỗ trợ WebCodecs → unsupported, không gọi stream', async () => {
    const repo = new FakeMirrorRepository([{ events: [], outcome: ok(undefined) }])
    const { vm, effects } = makeViewModel(repo, new FakeVideoSink(false))
    await settle()

    assert.equal(vm.store.getState().status, 'unsupported')
    assert.equal(repo.requests.length, 0)
    assert.ok(effects.some((effect) => effect.type === 'ShowMessage' && effect.severity === 'error'))
  })

  it('sự kiện meta → streaming + sessionId + deviceName + frameSize', async () => {
    const repo = new FakeMirrorRepository([
      {
        events: [
          {
            type: 'meta',
            sessionId: 's1',
            deviceName: 'Pixel 7',
            width: 1080,
            height: 2400,
            codec: 'h264',
            control: false,
          },
        ],
        outcome: 'pending',
      },
    ])
    const { vm } = makeViewModel(repo)
    await settle()

    const state = vm.store.getState()
    assert.equal(state.status, 'streaming')
    assert.equal(state.sessionId, 's1')
    assert.equal(state.deviceName, 'Pixel 7')
    assert.deepEqual(state.frameSize, { width: 1080, height: 2400 })
  })

  it('sự kiện video → gọi push trên sink, không setState', async () => {
    const repo = new FakeMirrorRepository([
      {
        events: [{ type: 'video', packet: { type: 'config', data: new Uint8Array() } }],
        outcome: 'pending',
      },
    ])
    const { vm, sink } = makeViewModel(repo)
    await settle()

    assert.equal(sink.pushCount, 1)
    // Chưa có sự kiện `meta` nào tới nên state vẫn ở 'connecting' — `video`
    // một mình không đổi bất cứ trường nào khác của state.
    assert.equal(vm.store.getState().status, 'connecting')
    assert.equal(vm.store.getState().sessionId, null)
  })

  it('sự kiện size → đổi frameSize', async () => {
    const repo = new FakeMirrorRepository([
      { events: [{ type: 'size', width: 2400, height: 1080 }], outcome: 'pending' },
    ])
    const { vm } = makeViewModel(repo)
    await settle()

    assert.deepEqual(vm.store.getState().frameSize, { width: 2400, height: 1080 })
  })

  it('luồng kết thúc bình thường (ok) → stopped', async () => {
    const repo = new FakeMirrorRepository([{ events: [], outcome: ok(undefined) }])
    const { vm } = makeViewModel(repo)
    await settle()

    assert.equal(vm.store.getState().status, 'stopped')
  })

  it('lỗi khác cancelled → failed + ShowMessage', async () => {
    const repo = new FakeMirrorRepository([{ events: [], outcome: err(AppErrors.upstream('scrcpy hỏng')) }])
    const { vm, effects } = makeViewModel(repo)
    await settle()

    assert.equal(vm.store.getState().status, 'failed')
    assert.ok(
      effects.some((effect) => effect.type === 'ShowMessage' && effect.message === 'scrcpy hỏng'),
    )
  })

  it('lỗi cancelled → không chuyển failed (huỷ không phải lỗi)', async () => {
    const repo = new FakeMirrorRepository([{ events: [], outcome: err(AppErrors.cancelled('Thao tác đã bị huỷ.')) }])
    const { vm, effects } = makeViewModel(repo)
    await settle()

    assert.notEqual(vm.store.getState().status, 'failed')
    assert.ok(!effects.some((effect) => effect.type === 'ShowMessage' && effect.severity === 'error'))
  })

  it('meta mang 0×0 (Tango chưa đọc SPS) → frameSize vẫn null tới khi size tới', async () => {
    const repo = new FakeMirrorRepository([
      {
        events: [
          { type: 'meta', sessionId: 's1', deviceName: 'SM-A165F', width: 0, height: 0, codec: 'h264', control: false },
          { type: 'size', width: 664, height: 1440 },
        ],
        outcome: 'pending',
      },
    ])
    const { vm } = makeViewModel(repo)
    await settle()

    assert.deepEqual(vm.store.getState().frameSize, { width: 664, height: 1440 })
  })

  // ─── Vòng đời luồng: intent cùng khoá PHẢI huỷ luồng đang chảy (H1, code review) ───

  it('StreamStopped → stopped VÀ luồng mở lúc onStart bị huỷ (signal.aborted)', async () => {
    const repo = new FakeMirrorRepository([{ events: [META], outcome: 'pending' }])
    const { vm } = makeViewModel(repo)
    await settle()
    assert.equal(repo.signals[0]?.aborted, false)

    vm.onIntent({ type: 'StreamStopped' })
    await settle()

    assert.equal(vm.store.getState().status, 'stopped')
    assert.equal(repo.signals[0]?.aborted, true)
    assert.equal(repo.requests.length, 1)
  })

  it('QualityChanged lúc đang chảy → huỷ luồng cũ, mở lại với quality mới', async () => {
    const repo = new FakeMirrorRepository([
      { events: [META], outcome: 'pending' },
      { events: [META], outcome: 'pending' },
    ])
    const { vm } = makeViewModel(repo)
    await settle()

    vm.onIntent({ type: 'QualityChanged', quality: { maxSize: 0, maxFps: 30, bitRateMbps: 2 } })
    await settle()

    assert.equal(repo.signals[0]?.aborted, true)
    assert.equal(repo.requests.length, 2)
    assert.deepEqual(
      [repo.requests[1]?.maxSize, repo.requests[1]?.maxFps, repo.requests[1]?.bitRateMbps],
      [0, 30, 2],
    )
    assert.equal(vm.store.getState().status, 'streaming')
  })

  it('QualityChanged lúc đã dừng → chỉ ghi nhớ, KHÔNG tự mở luồng', async () => {
    const repo = new FakeMirrorRepository([{ events: [META], outcome: 'pending' }])
    const { vm } = makeViewModel(repo)
    await settle()
    vm.onIntent({ type: 'StreamStopped' })
    await settle()

    vm.onIntent({ type: 'QualityChanged', quality: { maxSize: 1024, maxFps: 30, bitRateMbps: 2 } })
    await settle()

    assert.equal(repo.requests.length, 1)
    assert.equal(vm.store.getState().status, 'stopped')
    assert.equal(vm.store.getState().quality.maxSize, 1024)

    // "Chạy lại" dùng đúng tham số đã ghi nhớ.
    vm.onIntent({ type: 'StreamRequested' })
    await settle()
    assert.equal(repo.requests[1]?.maxSize, 1024)
  })

  it('ControlToggled lúc đang chảy → nối lại với control mới; lúc đã dừng → không', async () => {
    const repo = new FakeMirrorRepository([{ events: [META], outcome: 'pending' }])
    const { vm } = makeViewModel(repo)
    await settle()

    vm.onIntent({ type: 'ControlToggled', enabled: true })
    await settle()
    assert.equal(repo.signals[0]?.aborted, true)
    assert.deepEqual(repo.requests.map((request) => request.control), [false, true])

    vm.onIntent({ type: 'StreamStopped' })
    await settle()
    vm.onIntent({ type: 'ControlToggled', enabled: false })
    await settle()
    assert.equal(repo.requests.length, 2)
    assert.equal(vm.store.getState().controlEnabled, false)
  })

  it('decoder hỏng giữa phiên (sink.onError) → failed + ShowMessage + huỷ luồng', async () => {
    const repo = new FakeMirrorRepository([{ events: [META], outcome: 'pending' }])
    const { vm, effects, sink } = makeViewModel(repo)
    await settle()

    sink.failDecoder(AppErrors.upstream('Trình duyệt không giải mã được luồng video.'))
    await settle()

    const state = vm.store.getState()
    assert.equal(state.status, 'failed')
    assert.equal(state.error?.message, 'Trình duyệt không giải mã được luồng video.')
    assert.equal(repo.signals[0]?.aborted, true)
    assert.ok(effects.some((effect) => effect.type === 'ShowMessage' && effect.severity === 'error'))
    // Đổi chất lượng lúc đã hỏng không tự mở lại — người dùng bấm "Chạy lại".
    vm.onIntent({ type: 'QualityChanged', quality: { maxSize: 1024, maxFps: 30, bitRateMbps: 2 } })
    await settle()
    assert.equal(repo.requests.length, 1)
  })
})
