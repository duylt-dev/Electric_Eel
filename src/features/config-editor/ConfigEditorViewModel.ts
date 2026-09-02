import { defineViewModel } from '@/core/mvi'
import type { IntentContext } from '@/core/mvi'
import { clientContainer } from '@/di/client'
import {
  ADMOB_ID_PARAMETER_KEY,
  CONFIG_SHOW_ADS_PARAMETER_KEY,
} from '@/domain/ads/AdsDocumentCodec'
import { worstSeverity } from '@/domain/ads/AdsWorkspace'
import {
  addAdUnit,
  addPlacement,
  clearOverride,
  moveCondition,
  overrideForCondition,
  removeAdUnit,
  removeCondition,
  removePlacement,
  removePlacementField,
  setVariantRaw,
  updateAdUnit,
  updateAdmobRoot,
  updatePlacement,
  updateShowAdsRoot,
  upsertCondition,
} from '@/domain/ads/WorkspaceEdits'
import type { ParameterName } from '@/domain/ads/WorkspaceEdits'
import { loadAdsWorkspace } from '@/domain/ads/usecases/loadAdsWorkspace'
import { publishAdsWorkspace } from '@/domain/ads/usecases/publishAdsWorkspace'
import type { RemoteConfigRepository } from '@/domain/remote-config/repositories/RemoteConfigRepository'
import { initialConfigEditorState } from './ConfigEditorContract'
import type {
  ConfigEditorEffect,
  ConfigEditorIntent,
  ConfigEditorState,
} from './ConfigEditorContract'

/**
 * ViewModel của màn soạn cấu hình.
 *
 * Không có một dòng React nào trong file này, và luật ESLint chặn nếu ai đó
 * thêm vào — đúng như luật "no Compose import inside a ViewModel" bên Android.
 * Điều hướng và thông báo đều là Effect, không phải lời gọi trực tiếp.
 *
 * Phụ thuộc đi vào qua `deps`, kiểu là CỔNG ở tầng domain chứ không phải hiện
 * thực cụ thể. Nhờ vậy test cho ViewModel này chỉ cần truyền vào một repository
 * giả — không cần mạng, không cần Firebase, không cần render.
 */
export interface ConfigEditorDeps {
  remoteConfig: RemoteConfigRepository
  appSlug: string
}

type Context = IntentContext<ConfigEditorState, ConfigEditorEffect>

/** Áp một phép sửa lên bản nháp. Không có bản nháp thì không làm gì. */
const editDraft = (
  ctx: Context,
  edit: (workspace: NonNullable<ConfigEditorState['draft']>, conditionName: string | null) => typeof workspace,
): void => {
  ctx.setState((state) => {
    if (state.draft === null) return state
    return {
      ...state,
      draft: edit(state.draft, state.selectedCondition),
      // Sửa xong thì lời xác nhận cảnh báo cũ không còn giá trị: danh sách
      // cảnh báo vừa thay đổi, người dùng phải đọc lại.
      warningsAcknowledged: false,
    }
  })
}

async function load(ctx: Context, deps: ConfigEditorDeps, silent: boolean): Promise<void> {
  ctx.setState((state) => ({
    ...state,
    status: silent && state.status === 'ready' ? state.status : 'loading',
    error: null,
  }))

  const loaded = await loadAdsWorkspace(deps, { appSlug: deps.appSlug }, ctx.signal)
  if (ctx.signal.aborted) return

  if (!loaded.ok) {
    ctx.setState((state) => ({ ...state, status: 'failed', error: loaded.error }))
    return
  }

  ctx.setState((state) => ({
    ...state,
    status: 'ready',
    error: null,
    original: loaded.value,
    draft: loaded.value,
    warningsAcknowledged: false,
    // Điều kiện đang chọn có thể đã bị xoá ở phía Firebase trong lúc này.
    selectedCondition:
      state.selectedCondition !== null &&
      loaded.value.conditions.some((condition) => condition.name === state.selectedCondition)
        ? state.selectedCondition
        : null,
  }))
}

async function publish(ctx: Context, deps: ConfigEditorDeps): Promise<void> {
  const state = ctx.getState()
  if (state.draft === null || state.publishing) return

  ctx.setState((current) => ({ ...current, publishing: true }))

  const published = await publishAdsWorkspace(
    deps,
    { workspace: state.draft, acknowledgeWarnings: state.warningsAcknowledged },
    ctx.signal,
  )

  if (ctx.signal.aborted) return

  if (!published.ok) {
    ctx.setState((current) => ({ ...current, publishing: false }))
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: published.error.message })

    // Lệch ETag là trường hợp riêng: bản trên Firebase đã đổi, nên phải tải lại
    // để người dùng đối chiếu chứ không thể thử lại nguyên xi.
    if (published.error.kind === 'conflict') {
      ctx.setState((current) => ({ ...current, error: published.error }))
    }
    return
  }

  ctx.setState((current) => ({
    ...current,
    publishing: false,
    original: published.value,
    draft: published.value,
    warningsAcknowledged: false,
    publishedAt: Date.now(),
  }))
  ctx.emit({ type: 'PublishSucceeded' })
  ctx.emit({ type: 'ShowMessage', severity: 'success', message: 'Đã đẩy cấu hình lên Firebase.' })
}

function exportParameter(ctx: Context, parameter: ParameterName): void {
  const state = ctx.getState()
  if (state.draft === null) return

  const source = parameter === 'showAds' ? state.draft.showAds : state.draft.admob
  const variant =
    source.variants.find((candidate) => candidate.conditionName === state.selectedCondition) ??
    source.variants.find((candidate) => candidate.conditionName === null)

  if (variant === undefined) {
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: 'Không có nội dung để xuất.' })
    return
  }

  const key = parameter === 'showAds' ? CONFIG_SHOW_ADS_PARAMETER_KEY : ADMOB_ID_PARAMETER_KEY
  const suffix = state.selectedCondition === null ? '' : `-${state.selectedCondition.replace(/\W+/g, '-')}`

  ctx.emit({
    type: 'DownloadFile',
    fileName: `${key}${suffix}.json`,
    // Xuất ra bản có xuống dòng để người nhận đọc và so sánh được; bản gửi lên
    // Firebase thì vẫn gọn.
    content: JSON.stringify(JSON.parse(variant.raw), null, 2),
  })
}

export const ConfigEditorViewModel = defineViewModel<
  ConfigEditorState,
  ConfigEditorIntent,
  ConfigEditorEffect,
  ConfigEditorDeps
>({
  name: 'ConfigEditor',

  initialState: (deps) => initialConfigEditorState(deps.appSlug),

  /**
   * Gộp công việc theo khoá: tải lại nhiều lần thì lần sau huỷ lần trước, còn
   * publish thì không bao giờ chạy song song với chính nó.
   */
  intentKey: (intent) => {
    switch (intent.type) {
      case 'Load':
      case 'Reload':
        return 'load'
      case 'PublishRequested':
        return 'publish'
      default:
        return undefined
    }
  },

  onError: (error, _intent, ctx) => {
    ctx.emit({ type: 'ShowMessage', severity: 'error', message: error.message })
  },

  handleIntent: async (intent, ctx, deps) => {
    switch (intent.type) {
      case 'Load':
        await load(ctx, deps, false)
        return

      case 'Reload':
        await load(ctx, deps, true)
        return

      case 'DiscardChanges':
        ctx.setState((state) => ({
          ...state,
          draft: state.original,
          warningsAcknowledged: false,
        }))
        ctx.emit({ type: 'ShowMessage', severity: 'success', message: 'Đã bỏ mọi thay đổi chưa lưu.' })
        return

      case 'TabSelected':
        ctx.setState((state) => ({ ...state, tab: intent.tab }))
        return

      case 'ConditionSelected':
        ctx.setState((state) => ({
          ...state,
          selectedCondition: intent.conditionName,
          selectedPlacement: null,
        }))
        return

      case 'PlacementSelected':
        ctx.setState((state) => ({ ...state, selectedPlacement: intent.configName }))
        return

      case 'SearchChanged':
        ctx.setState((state) => ({ ...state, search: intent.value }))
        return

      case 'FilterChanged':
        ctx.setState((state) => ({ ...state, filter: intent.filter }))
        return

      case 'PlacementChanged':
        editDraft(ctx, (draft, condition) =>
          updatePlacement(draft, condition, intent.configName, intent.patch),
        )
        return

      case 'PlacementFieldCleared':
        editDraft(ctx, (draft, condition) =>
          removePlacementField(draft, condition, intent.configName, intent.field),
        )
        return

      case 'PlacementAdded':
        editDraft(ctx, (draft, condition) => addPlacement(draft, condition, intent.placement))
        ctx.setState((state) => ({ ...state, selectedPlacement: intent.placement.configName }))
        return

      case 'PlacementRemoved':
        editDraft(ctx, (draft, condition) => removePlacement(draft, condition, intent.configName))
        ctx.setState((state) => ({
          ...state,
          selectedPlacement: state.selectedPlacement === intent.configName ? null : state.selectedPlacement,
        }))
        return

      case 'AdUnitChanged':
        editDraft(ctx, (draft, condition) => updateAdUnit(draft, condition, intent.spaceName, intent.patch))
        return

      case 'AdUnitAdded':
        editDraft(ctx, (draft, condition) => addAdUnit(draft, condition, intent.unit))
        return

      case 'AdUnitRemoved':
        editDraft(ctx, (draft, condition) => removeAdUnit(draft, condition, intent.spaceName))
        return

      case 'ShowAdsRootChanged':
        editDraft(ctx, (draft, condition) => updateShowAdsRoot(draft, condition, intent.field, intent.value))
        return

      case 'AdmobRootChanged':
        editDraft(ctx, (draft, condition) => updateAdmobRoot(draft, condition, intent.field, intent.value))
        return

      case 'ConditionSaved':
        editDraft(ctx, (draft) => upsertCondition(draft, intent.condition, intent.previousName))
        return

      case 'ConditionRemoved':
        editDraft(ctx, (draft) => removeCondition(draft, intent.name))
        ctx.setState((state) => ({
          ...state,
          selectedCondition: state.selectedCondition === intent.name ? null : state.selectedCondition,
        }))
        return

      case 'ConditionMoved':
        editDraft(ctx, (draft) => moveCondition(draft, intent.from, intent.to))
        return

      case 'OverrideCreated':
        editDraft(ctx, (draft) => overrideForCondition(draft, intent.parameter, intent.conditionName))
        ctx.emit({
          type: 'ShowMessage',
          severity: 'success',
          message: `Đã tạo giá trị riêng cho điều kiện "${intent.conditionName}", khởi đầu bằng bản sao của giá trị mặc định.`,
        })
        return

      case 'OverrideCleared':
        editDraft(ctx, (draft) => clearOverride(draft, intent.parameter, intent.conditionName))
        return

      case 'RawImported': {
        editDraft(ctx, (draft, condition) =>
          setVariantRaw(draft, intent.parameter, condition, intent.raw),
        )
        const state = ctx.getState()
        const target = intent.parameter === 'showAds' ? state.draft?.showAds : state.draft?.admob
        const variant = target?.variants.find(
          (candidate) => candidate.conditionName === state.selectedCondition,
        )
        if (variant?.parseError != null) {
          ctx.emit({ type: 'ShowMessage', severity: 'error', message: variant.parseError.message })
        } else {
          ctx.emit({ type: 'ShowMessage', severity: 'success', message: 'Đã nạp nội dung mới.' })
        }
        return
      }

      case 'ExportRequested':
        exportParameter(ctx, intent.parameter)
        return

      case 'WarningsAcknowledged':
        ctx.setState((state) => ({ ...state, warningsAcknowledged: intent.value }))
        return

      case 'PublishRequested': {
        const state = ctx.getState()
        if (state.draft !== null && worstSeverity(state.draft) === 'error') {
          ctx.emit({
            type: 'ShowMessage',
            severity: 'error',
            message: 'Còn lỗi chưa xử lý. Sửa hết rồi mới đẩy lên được.',
          })
          return
        }
        await publish(ctx, deps)
        return
      }
    }
  },

  createDependencies: () => {
    throw new Error(
      'ConfigEditorViewModel cần được cấp phụ thuộc: <ConfigEditorViewModel.Provider deps={{ remoteConfig, appSlug }}>. ' +
        'appSlug chỉ biết được ở thời điểm dựng màn hình nên không thể lấy mặc định ở đây.',
    )
  },
})

/** Phụ thuộc dùng thật trong ứng dụng. Test truyền bộ khác vào. */
export const configEditorDeps = (appSlug: string): ConfigEditorDeps => ({
  remoteConfig: clientContainer.remoteConfig,
  appSlug,
})
