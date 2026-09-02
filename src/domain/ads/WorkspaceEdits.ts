import { serializeAdmobIdDocument, serializeShowAdsDocument } from './AdsDocumentCodec'
import { parseAdmobIdDocument, parseShowAdsDocument } from './AdsDocumentCodec'
import { resolveVariants } from './AdsWorkspace'
import type { AdsWorkspace, ParameterState, ParameterVariant } from './AdsWorkspace'
import type { AdUnit, AdmobIdDocument } from './entities/AdmobIdDocument'
import type { AdPlacement, ShowAdsDocument } from './entities/ShowAdsDocument'
import type { RemoteConfigCondition } from '../remote-config/entities/RemoteConfigTemplate'

/**
 * Các phép sửa trên không gian làm việc.
 *
 * Toàn bộ file này là hàm thuần: nhận workspace, trả về workspace mới. Không
 * sửa tại chỗ, không đụng tới React. Nhờ vậy ViewModel chỉ còn việc chọn phép
 * sửa nào ứng với intent nào, và mọi quy tắc ở đây kiểm thử được bằng cách gọi
 * hàm rồi so kết quả.
 *
 * ─── Bất biến được giữ xuyên suốt ───
 *
 *   raw === serialize(document)   khi document khác null
 *
 * Nghĩa là chuỗi JSON và cây đối tượng không bao giờ lệch nhau. Lệch được thì
 * sẽ có ngày ta hiển thị một đằng và gửi lên Firebase một nẻo.
 */

export type ParameterName = 'admob' | 'showAds'

const withResolved = (workspace: AdsWorkspace): AdsWorkspace => ({
  ...workspace,
  resolved: resolveVariants(workspace.admob, workspace.showAds, workspace.conditions),
})

function replaceVariant<T>(
  state: ParameterState<T>,
  conditionName: string | null,
  next: ParameterVariant<T>,
): ParameterState<T> {
  const exists = state.variants.some((variant) => variant.conditionName === conditionName)
  return {
    ...state,
    variants: exists
      ? state.variants.map((variant) => (variant.conditionName === conditionName ? next : variant))
      : [...state.variants, next],
  }
}

const variantOf = <T>(state: ParameterState<T>, conditionName: string | null): ParameterVariant<T> | undefined =>
  state.variants.find((variant) => variant.conditionName === conditionName)

/**
 * Biến thể mà một điều kiện THỰC SỰ dùng: nếu điều kiện chưa có giá trị riêng
 * thì nó dùng giá trị mặc định. Sửa "biến thể Việt Nam" khi Việt Nam chưa có
 * giá trị riêng phải hiểu là sửa giá trị mặc định, chứ không phải âm thầm tạo
 * ra một biến thể mới — người dùng không yêu cầu điều đó.
 */
export const effectiveConditionName = <T>(
  state: ParameterState<T>,
  conditionName: string | null,
): string | null => (variantOf(state, conditionName) === undefined ? null : conditionName)

// ── config_show_ads ─────────────────────────────────────────────────────────

function editShowAds(
  workspace: AdsWorkspace,
  conditionName: string | null,
  mutate: (document: ShowAdsDocument) => ShowAdsDocument,
): AdsWorkspace {
  const target = effectiveConditionName(workspace.showAds, conditionName)
  const variant = variantOf(workspace.showAds, target)
  if (variant?.document == null) return workspace

  const document = mutate(variant.document)
  return withResolved({
    ...workspace,
    showAds: replaceVariant(workspace.showAds, target, {
      conditionName: target,
      document,
      raw: serializeShowAdsDocument(document),
      parseError: null,
    }),
  })
}

export const updatePlacement = (
  workspace: AdsWorkspace,
  conditionName: string | null,
  configName: string,
  patch: Partial<AdPlacement>,
): AdsWorkspace =>
  editShowAds(workspace, conditionName, (document) => ({
    ...document,
    listConfig: document.listConfig.map((placement) =>
      placement.configName === configName ? { ...placement, ...patch } : placement,
    ),
  }))

/**
 * Xoá hẳn một trường khỏi vị trí.
 *
 * Khác với đặt về `undefined`: trường vắng mặt thì SDK dùng mặc định của lớp,
 * còn trường có mặt với giá trị `null` thì Gson ghi đè bằng null. Hai chuyện
 * khác hẳn nhau, nên phải có phép xoá riêng.
 */
export const removePlacementField = (
  workspace: AdsWorkspace,
  conditionName: string | null,
  configName: string,
  field: string,
): AdsWorkspace =>
  editShowAds(workspace, conditionName, (document) => ({
    ...document,
    listConfig: document.listConfig.map((placement) => {
      if (placement.configName !== configName) return placement
      const copy = { ...placement } as Record<string, unknown>
      delete copy[field]
      return copy as unknown as AdPlacement
    }),
  }))

export const addPlacement = (
  workspace: AdsWorkspace,
  conditionName: string | null,
  placement: AdPlacement,
): AdsWorkspace =>
  editShowAds(workspace, conditionName, (document) =>
    document.listConfig.some((existing) => existing.configName === placement.configName)
      ? document
      : { ...document, listConfig: [...document.listConfig, placement] },
  )

export const removePlacement = (
  workspace: AdsWorkspace,
  conditionName: string | null,
  configName: string,
): AdsWorkspace =>
  editShowAds(workspace, conditionName, (document) => ({
    ...document,
    listConfig: document.listConfig.filter((placement) => placement.configName !== configName),
  }))

export const updateShowAdsRoot = (
  workspace: AdsWorkspace,
  conditionName: string | null,
  field: string,
  value: unknown,
): AdsWorkspace =>
  editShowAds(workspace, conditionName, (document) => ({ ...document, [field]: value }))

// ── admob_id ────────────────────────────────────────────────────────────────

function editAdmob(
  workspace: AdsWorkspace,
  conditionName: string | null,
  mutate: (document: AdmobIdDocument) => AdmobIdDocument,
): AdsWorkspace {
  const target = effectiveConditionName(workspace.admob, conditionName)
  const variant = variantOf(workspace.admob, target)
  if (variant?.document == null) return workspace

  const document = mutate(variant.document)
  return withResolved({
    ...workspace,
    admob: replaceVariant(workspace.admob, target, {
      conditionName: target,
      document,
      raw: serializeAdmobIdDocument(document),
      parseError: null,
    }),
  })
}

export const updateAdUnit = (
  workspace: AdsWorkspace,
  conditionName: string | null,
  spaceName: string,
  patch: Partial<AdUnit>,
): AdsWorkspace =>
  editAdmob(workspace, conditionName, (document) => ({
    ...document,
    listAds: document.listAds.map((unit) =>
      unit.spaceName === spaceName ? { ...unit, ...patch } : unit,
    ),
  }))

export const addAdUnit = (
  workspace: AdsWorkspace,
  conditionName: string | null,
  unit: AdUnit,
): AdsWorkspace =>
  editAdmob(workspace, conditionName, (document) =>
    document.listAds.some((existing) => existing.spaceName === unit.spaceName)
      ? document
      : { ...document, listAds: [...document.listAds, unit] },
  )

export const removeAdUnit = (
  workspace: AdsWorkspace,
  conditionName: string | null,
  spaceName: string,
): AdsWorkspace =>
  editAdmob(workspace, conditionName, (document) => ({
    ...document,
    listAds: document.listAds.filter((unit) => unit.spaceName !== spaceName),
  }))

export const updateAdmobRoot = (
  workspace: AdsWorkspace,
  conditionName: string | null,
  field: string,
  value: unknown,
): AdsWorkspace =>
  editAdmob(workspace, conditionName, (document) => ({ ...document, [field]: value }))

// ── Nhập JSON thô ───────────────────────────────────────────────────────────

/**
 * Thay cả nội dung một biến thể bằng chuỗi JSON người dùng dán vào hoặc tải lên.
 *
 * Đọc hỏng thì vẫn giữ nguyên văn chuỗi và ghi lại lỗi, KHÔNG vứt đi. Người
 * dùng vừa dán 20KB vào; mất nó chỉ vì thiếu một dấu phẩy là hành vi không
 * chấp nhận được.
 */
export function setVariantRaw(
  workspace: AdsWorkspace,
  parameter: ParameterName,
  conditionName: string | null,
  raw: string,
): AdsWorkspace {
  if (parameter === 'showAds') {
    const parsed = parseShowAdsDocument(raw)
    return withResolved({
      ...workspace,
      showAds: replaceVariant(workspace.showAds, conditionName, {
        conditionName,
        raw,
        document: parsed.ok ? parsed.value : null,
        parseError: parsed.ok ? null : parsed.error,
      }),
    })
  }

  const parsed = parseAdmobIdDocument(raw)
  return withResolved({
    ...workspace,
    admob: replaceVariant(workspace.admob, conditionName, {
      conditionName,
      raw,
      document: parsed.ok ? parsed.value : null,
      parseError: parsed.ok ? null : parsed.error,
    }),
  })
}

// ── Biến thể theo điều kiện ─────────────────────────────────────────────────

/**
 * Tạo giá trị riêng cho một điều kiện, khởi đầu bằng bản sao của giá trị mặc
 * định. Bắt đầu từ bản rỗng thì người dùng phải dựng lại 66 vị trí bằng tay.
 */
export function overrideForCondition(
  workspace: AdsWorkspace,
  parameter: ParameterName,
  conditionName: string,
): AdsWorkspace {
  // Chỉ đọc `raw`, nhưng vẫn tách hai nhánh: gộp lại thành union thì tham số
  // kiểu của ParameterState không thu hẹp được, và ép kiểu để lách chỗ này là
  // tự bỏ đi đúng cái kiểm tra đang giữ hai tài liệu không lẫn vào nhau.
  const variants =
    parameter === 'showAds' ? workspace.showAds.variants : workspace.admob.variants

  if (variants.some((variant) => variant.conditionName === conditionName)) return workspace

  const base = variants.find((variant) => variant.conditionName === null)
  if (base === undefined) return workspace

  return setVariantRaw(workspace, parameter, conditionName, base.raw)
}

/** Bỏ giá trị riêng: điều kiện đó quay về dùng giá trị mặc định. */
export function clearOverride(
  workspace: AdsWorkspace,
  parameter: ParameterName,
  conditionName: string,
): AdsWorkspace {
  const without = <T>(state: ParameterState<T>): ParameterState<T> => ({
    ...state,
    variants: state.variants.filter((variant) => variant.conditionName !== conditionName),
  })

  return withResolved(
    parameter === 'showAds'
      ? { ...workspace, showAds: without(workspace.showAds) }
      : { ...workspace, admob: without(workspace.admob) },
  )
}

// ── Điều kiện ───────────────────────────────────────────────────────────────

export const setConditions = (
  workspace: AdsWorkspace,
  conditions: RemoteConfigCondition[],
): AdsWorkspace => withResolved({ ...workspace, conditions })

export const upsertCondition = (
  workspace: AdsWorkspace,
  condition: RemoteConfigCondition,
  previousName?: string,
): AdsWorkspace => {
  const target = previousName ?? condition.name
  const exists = workspace.conditions.some((existing) => existing.name === target)

  const conditions = exists
    ? workspace.conditions.map((existing) => (existing.name === target ? condition : existing))
    : [...workspace.conditions, condition]

  // Đổi tên điều kiện thì mọi biến thể đang trỏ tới tên cũ phải theo, nếu không
  // Firebase từ chối cả template vì có conditionalValues trỏ vào điều kiện lạ.
  if (previousName !== undefined && previousName !== condition.name) {
    const rename = <T>(state: ParameterState<T>): ParameterState<T> => ({
      ...state,
      variants: state.variants.map((variant) =>
        variant.conditionName === previousName ? { ...variant, conditionName: condition.name } : variant,
      ),
    })
    return withResolved({
      ...workspace,
      conditions,
      showAds: rename(workspace.showAds),
      admob: rename(workspace.admob),
    })
  }

  return withResolved({ ...workspace, conditions })
}

/** Xoá điều kiện, và xoá luôn mọi giá trị riêng gắn với nó. */
export const removeCondition = (workspace: AdsWorkspace, name: string): AdsWorkspace => {
  const drop = <T>(state: ParameterState<T>): ParameterState<T> => ({
    ...state,
    variants: state.variants.filter((variant) => variant.conditionName !== name),
  })

  return withResolved({
    ...workspace,
    conditions: workspace.conditions.filter((condition) => condition.name !== name),
    showAds: drop(workspace.showAds),
    admob: drop(workspace.admob),
  })
}

/** Đổi thứ tự điều kiện. Thứ tự quyết định điều kiện nào thắng khi cùng khớp. */
export const moveCondition = (workspace: AdsWorkspace, from: number, to: number): AdsWorkspace => {
  if (from === to || from < 0 || to < 0) return workspace
  if (from >= workspace.conditions.length || to >= workspace.conditions.length) return workspace

  const conditions = [...workspace.conditions]
  const [moved] = conditions.splice(from, 1)
  if (moved === undefined) return workspace
  conditions.splice(to, 0, moved)

  return withResolved({ ...workspace, conditions })
}
