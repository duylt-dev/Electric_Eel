import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { createViewModel } from '@/core/mvi/createViewModel'
import { type Result, ok } from '@/core/result'
import { AppErrors, err } from '@/core/result'
import { isExplicitValue } from '@/domain/remote-config/entities/RemoteConfigTemplate'
import type {
  RemoteConfigTemplate,
  VersionedTemplate,
} from '@/domain/remote-config/entities/RemoteConfigTemplate'
import type { RemoteConfigRepository } from '@/domain/remote-config/repositories/RemoteConfigRepository'
import { ConfigEditorViewModel } from './ConfigEditorViewModel'
import type { ConfigEditorEffect } from './ConfigEditorContract'
import { currentResolved, hasUnsavedChanges, visiblePlacements } from './ConfigEditorContract'

/**
 * Test cho ViewModel, chạy không cần React.
 *
 * Đây là lý do tầng MVI được tách làm hai: `createViewModel` không biết gì về
 * React, nên kiểm thử chỉ còn là gọi `onIntent` rồi đọc `store.getState()` —
 * đúng như test một ViewModel bên Android. Không render, không jsdom, không
 * chờ hiệu ứng phụ.
 */

const readTemplate = (name: string) => readFileSync(join(process.cwd(), 'docs', name), 'utf8').trim()

const templateFixture = (): RemoteConfigTemplate => ({
  conditions: [{ name: 'Việt Nam', expression: "device.country in ['VN']", tagColor: 'BLUE' }],
  parameters: {
    admob_id: { defaultValue: { value: readTemplate('admob_id-template.json') }, valueType: 'JSON' },
    config_show_ads: {
      defaultValue: { value: readTemplate('config_show_ads-template.json') },
      valueType: 'JSON',
    },
    // Tham số của nhóm khác. Không được mất khi tool này ghi lại template.
    other_team_flag: { defaultValue: { value: 'true' }, valueType: 'BOOLEAN' },
  },
})

class FakeRemoteConfig implements RemoteConfigRepository {
  published: VersionedTemplate | null = null
  publishCount = 0
  lastEtagSent: string | null = null
  failPublishWith: 'conflict' | null = null

  constructor(private template: RemoteConfigTemplate = templateFixture()) {}

  fetchTemplate(): Promise<Result<VersionedTemplate>> {
    return Promise.resolve(ok({ template: this.template, etag: 'etag-1' }))
  }

  validateTemplate(): Promise<Result<void>> {
    return Promise.resolve(ok(undefined))
  }

  publishTemplate(
    _appSlug: string,
    template: RemoteConfigTemplate,
    etag: string,
  ): Promise<Result<VersionedTemplate>> {
    this.publishCount += 1
    this.lastEtagSent = etag

    if (this.failPublishWith === 'conflict') {
      return Promise.resolve(err(AppErrors.conflict('Có người publish trước.')))
    }
    this.published = { template, etag: 'etag-2' }
    return Promise.resolve(ok(this.published))
  }
}

const makeViewModel = (repo: RemoteConfigRepository = new FakeRemoteConfig()) => {
  const effects: ConfigEditorEffect[] = []
  const vm = createViewModel(ConfigEditorViewModel.definition, {
    remoteConfig: repo,
    appSlug: 'love-test',
  })
  vm.connectEffects((effect) => effects.push(effect))
  return { vm, effects }
}

/** Cho vòng lặp sự kiện chạy hết các promise đã xếp hàng. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('ConfigEditorViewModel', () => {
  it('tải cấu hình và dựng được các biến thể', async () => {
    const { vm } = makeViewModel()

    vm.onIntent({ type: 'Load' })
    assert.equal(vm.store.getState().status, 'loading')

    await settle()

    const state = vm.store.getState()
    assert.equal(state.status, 'ready')
    assert.equal(state.draft?.showAds.variants.length, 1, 'chỉ có giá trị mặc định')
    assert.equal(currentResolved(state)?.showAds?.listConfig.length, 66)

    // Điều kiện "Việt Nam" có tồn tại trên template nhưng chưa tham số nào có
    // giá trị riêng cho nó, nên thiết bị khớp điều kiện đó vẫn nhận đúng giá
    // trị mặc định. Sinh thêm một tổ hợp trùng lặp chỉ tạo ra một tab giống hệt
    // tab bên cạnh, nên cố ý không sinh.
    assert.equal(state.draft?.conditions.length, 1, 'điều kiện vẫn nằm trên template')
    assert.equal(state.draft?.resolved.length, 1, 'chưa có bản riêng thì chưa có tổ hợp mới')
  })

  it('một tham số có bản riêng thì tham số kia rơi về mặc định', async () => {
    const { vm } = makeViewModel()
    vm.onIntent({ type: 'Load' })
    await settle()

    // Chỉ admob_id có bản riêng cho Việt Nam; config_show_ads thì không.
    vm.onIntent({ type: 'OverrideCreated', parameter: 'admob', conditionName: 'Việt Nam' })
    vm.onIntent({ type: 'ConditionSelected', conditionName: 'Việt Nam' })
    vm.onIntent({ type: 'AdUnitRemoved', spaceName: 'exitapp_native1' })

    const state = vm.store.getState()
    assert.equal(state.draft?.resolved.length, 2, 'giờ mới có tổ hợp riêng cho Việt Nam')

    const vietnam = state.draft?.resolved.find((variant) => variant.conditionName === 'Việt Nam')
    const base = state.draft?.resolved.find((variant) => variant.conditionName === null)

    assert.equal(vietnam?.admob?.listAds.length, 71, 'bản riêng đã bớt một ad unit')
    assert.equal(base?.admob?.listAds.length, 72, 'bản mặc định giữ nguyên')
    assert.equal(
      vietnam?.showAds?.listConfig.length,
      base?.showAds?.listConfig.length,
      'config_show_ads không có bản riêng nên dùng chung bản mặc định',
    )
  })

  it('bật một vị trí là một thay đổi chưa lưu', async () => {
    const { vm } = makeViewModel()
    vm.onIntent({ type: 'Load' })
    await settle()

    assert.equal(hasUnsavedChanges(vm.store.getState()), false)

    vm.onIntent({ type: 'PlacementChanged', configName: 'exitapp', patch: { isOn: false } })

    const state = vm.store.getState()
    assert.equal(hasUnsavedChanges(state), true)
    const placement = currentResolved(state)?.showAds?.listConfig.find((p) => p.configName === 'exitapp')
    assert.equal(placement?.isOn, false)
  })

  it('sửa xong thì lời xác nhận cảnh báo cũ bị thu hồi', async () => {
    const { vm } = makeViewModel()
    vm.onIntent({ type: 'Load' })
    await settle()

    vm.onIntent({ type: 'WarningsAcknowledged', value: true })
    assert.equal(vm.store.getState().warningsAcknowledged, true)

    vm.onIntent({ type: 'PlacementChanged', configName: 'exitapp', patch: { isOn: false } })
    assert.equal(
      vm.store.getState().warningsAcknowledged,
      false,
      'danh sách cảnh báo vừa đổi nên phải đọc lại',
    )
  })

  it('bộ lọc và ô tìm kiếm thu hẹp danh sách vị trí', async () => {
    const { vm } = makeViewModel()
    vm.onIntent({ type: 'Load' })
    await settle()

    const total = visiblePlacements(vm.store.getState()).length

    vm.onIntent({ type: 'FilterChanged', filter: 'enabled' })
    const enabled = visiblePlacements(vm.store.getState()).length
    assert.ok(enabled > 0 && enabled < total, 'lọc "đang bật" phải ít hơn tất cả')

    vm.onIntent({ type: 'FilterChanged', filter: 'all' })
    vm.onIntent({ type: 'SearchChanged', value: 'onboard' })
    const searched = visiblePlacements(vm.store.getState())
    assert.ok(searched.length > 0)
    assert.ok(searched.every((placement) => placement.configName.toLowerCase().includes('onboard')))
  })

  it('tạo giá trị riêng cho điều kiện thì khởi đầu bằng bản sao của mặc định', async () => {
    const { vm } = makeViewModel()
    vm.onIntent({ type: 'Load' })
    await settle()

    vm.onIntent({ type: 'OverrideCreated', parameter: 'showAds', conditionName: 'Việt Nam' })

    const state = vm.store.getState()
    const variants = state.draft?.showAds.variants ?? []
    assert.equal(variants.length, 2)

    const [base, override] = variants
    assert.equal(override?.conditionName, 'Việt Nam')
    assert.equal(override?.raw, base?.raw, 'bản sao phải giống hệt bản mặc định')
  })

  it('sửa trên biến thể riêng không đụng tới giá trị mặc định', async () => {
    const { vm } = makeViewModel()
    vm.onIntent({ type: 'Load' })
    await settle()

    vm.onIntent({ type: 'OverrideCreated', parameter: 'showAds', conditionName: 'Việt Nam' })
    vm.onIntent({ type: 'ConditionSelected', conditionName: 'Việt Nam' })
    vm.onIntent({ type: 'ShowAdsRootChanged', field: 'disableAllConfig', value: true })

    const state = vm.store.getState()
    const forVietnam = state.draft?.resolved.find((v) => v.conditionName === 'Việt Nam')
    const forDefault = state.draft?.resolved.find((v) => v.conditionName === null)

    assert.equal(forVietnam?.showAds?.disableAllConfig, true)
    assert.equal(forDefault?.showAds?.disableAllConfig, false, 'mặc định phải giữ nguyên')
  })

  it('publish gửi kèm đúng ETag và giữ nguyên tham số của nhóm khác', async () => {
    const repo = new FakeRemoteConfig()
    const { vm, effects } = makeViewModel(repo)
    vm.onIntent({ type: 'Load' })
    await settle()

    vm.onIntent({ type: 'PlacementChanged', configName: 'exitapp', patch: { isOn: false } })
    vm.onIntent({ type: 'WarningsAcknowledged', value: true })
    vm.onIntent({ type: 'PublishRequested' })
    await settle()

    assert.equal(repo.publishCount, 1)
    assert.equal(repo.lastEtagSent, 'etag-1', 'phải gửi ETag của bản vừa tải')

    const otherTeam = repo.published?.template.parameters?.other_team_flag?.defaultValue
    assert.ok(isExplicitValue(otherTeam), 'tham số của nhóm khác không được biến mất')
    assert.equal(otherTeam.value, 'true')
    assert.ok(effects.some((effect) => effect.type === 'PublishSucceeded'))
  })

  it('lệch ETag báo lỗi xung đột và không nuốt lặng', async () => {
    const repo = new FakeRemoteConfig()
    repo.failPublishWith = 'conflict'
    const { vm, effects } = makeViewModel(repo)

    vm.onIntent({ type: 'Load' })
    await settle()
    vm.onIntent({ type: 'WarningsAcknowledged', value: true })
    vm.onIntent({ type: 'PublishRequested' })
    await settle()

    const state = vm.store.getState()
    assert.equal(state.publishing, false)
    assert.equal(state.error?.kind, 'conflict')
    assert.ok(effects.some((effect) => effect.type === 'ShowMessage' && effect.severity === 'error'))
  })

  it('nhập JSON hỏng thì giữ nguyên văn và báo lỗi, không mất nội dung', async () => {
    const { vm, effects } = makeViewModel()
    vm.onIntent({ type: 'Load' })
    await settle()

    const broken = '{ "listConfig": [ }'
    vm.onIntent({ type: 'RawImported', parameter: 'showAds', raw: broken })

    const variant = vm.store.getState().draft?.showAds.variants.find((v) => v.conditionName === null)
    assert.equal(variant?.raw, broken, 'nguyên văn phải còn')
    assert.equal(variant?.document, null)
    assert.ok(variant?.parseError !== null)
    assert.ok(effects.some((effect) => effect.type === 'ShowMessage' && effect.severity === 'error'))
  })

  it('bỏ thay đổi đưa bản nháp về đúng bản đã tải', async () => {
    const { vm } = makeViewModel()
    vm.onIntent({ type: 'Load' })
    await settle()

    vm.onIntent({ type: 'PlacementChanged', configName: 'exitapp', patch: { isOn: false } })
    assert.equal(hasUnsavedChanges(vm.store.getState()), true)

    vm.onIntent({ type: 'DiscardChanges' })
    assert.equal(hasUnsavedChanges(vm.store.getState()), false)
  })

  it('huỷ ViewModel thì kết quả tải về không còn ghi vào state', async () => {
    const { vm } = makeViewModel()
    vm.onIntent({ type: 'Load' })
    vm.dispose()
    await settle()

    assert.equal(vm.store.getState().status, 'loading', 'state đóng băng ở thời điểm huỷ')
    assert.equal(vm.isDisposed, true)
  })
})
