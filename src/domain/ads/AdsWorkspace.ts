import type { AppError } from '../../core/result'
import {
  ADMOB_ID_PARAMETER_KEY,
  CONFIG_SHOW_ADS_PARAMETER_KEY,
  parseAdmobIdDocument,
  parseShowAdsDocument,
  serializeAdmobIdDocument,
  serializeShowAdsDocument,
} from './AdsDocumentCodec'
import type { AdmobIdDocument } from './entities/AdmobIdDocument'
import type { ShowAdsDocument } from './entities/ShowAdsDocument'
import {
  findParameter,
  isExplicitValue,
} from '../remote-config/entities/RemoteConfigTemplate'
import type {
  RemoteConfigCondition,
  RemoteConfigParameter,
  RemoteConfigTemplate,
} from '../remote-config/entities/RemoteConfigTemplate'
import { validateAdsDocuments } from './validation/validateAdsDocuments'
import type { ValidationResult } from './validation/validateAdsDocuments'

/**
 * Không gian làm việc: toàn bộ trạng thái cần để sửa cấu hình quảng cáo của
 * một app, đã tách sẵn theo từng biến thể điều kiện.
 *
 * ─── Vì sao phải có khái niệm "biến thể" ───
 *
 * Trên Firebase, một tham số có một giá trị mặc định và có thể có thêm nhiều
 * giá trị theo điều kiện. Thiết bị nhận được giá trị của điều kiện ĐẦU TIÊN
 * khớp, xét theo đúng thứ tự mảng `conditions`; không khớp cái nào thì nhận
 * giá trị mặc định.
 *
 * Nghĩa là app không chạy "một" cấu hình — nó chạy một trong N cấu hình. Sửa
 * đúng giá trị mặc định mà quên biến thể "Việt Nam" là lỗi rất dễ mắc và
 * không nhìn ra được trên console, vì hai giá trị nằm ở hai chỗ khác nhau và
 * đều là khối chữ dày đặc.
 *
 * Vì vậy bộ kiểm tra ở đây chạy trên TỪNG TỔ HỢP đã phân giải, chứ không chỉ
 * trên giá trị mặc định.
 */

export interface ParameterVariant<T> {
  /** `null` là giá trị mặc định. Còn lại là tên điều kiện. */
  conditionName: string | null
  /** Chuỗi JSON nguyên văn. Đây mới là thứ thật sự gửi lên Firebase. */
  raw: string
  /** Kết quả đọc `raw`. `null` khi đọc hỏng — xem `parseError`. */
  document: T | null
  parseError: AppError | null
}

export interface ParameterState<T> {
  key: string
  description: string | undefined
  /** Phần tử đầu luôn là biến thể mặc định. */
  variants: ParameterVariant<T>[]
  /** Tham số này có tồn tại trên template không. */
  present: boolean
  /** Nhóm chứa tham số, nếu nó nằm trong một parameterGroup. */
  groupName: string | null
}

/** Một tổ hợp cấu hình mà một thiết bị thật sự có thể nhận được. */
export interface ResolvedVariant {
  conditionName: string | null
  label: string
  admob: AdmobIdDocument | null
  showAds: ShowAdsDocument | null
  validation: ValidationResult
}

export interface AdsWorkspace {
  appSlug: string
  etag: string
  template: RemoteConfigTemplate
  conditions: RemoteConfigCondition[]
  admob: ParameterState<AdmobIdDocument>
  showAds: ParameterState<ShowAdsDocument>
  /** Mỗi tổ hợp thiết bị có thể nhận, kèm kết quả kiểm tra riêng. */
  resolved: ResolvedVariant[]
}

export const DEFAULT_VARIANT_LABEL = 'Giá trị mặc định'

const readVariants = (parameter: RemoteConfigParameter | undefined): { conditionName: string | null; raw: string }[] => {
  if (parameter === undefined) return [{ conditionName: null, raw: '' }]

  const variants: { conditionName: string | null; raw: string }[] = [
    { conditionName: null, raw: isExplicitValue(parameter.defaultValue) ? parameter.defaultValue.value : '' },
  ]
  for (const [conditionName, value] of Object.entries(parameter.conditionalValues ?? {})) {
    variants.push({ conditionName, raw: isExplicitValue(value) ? value.value : '' })
  }
  return variants
}

function buildParameterState<T>(
  template: RemoteConfigTemplate,
  key: string,
  parse: (raw: string) => { ok: true; value: T } | { ok: false; error: AppError },
): ParameterState<T> {
  const found = findParameter(template, key)

  const variants = readVariants(found?.parameter).map<ParameterVariant<T>>((variant) => {
    if (variant.raw.trim().length === 0) {
      return { ...variant, document: null, parseError: null }
    }
    const parsed = parse(variant.raw)
    return parsed.ok
      ? { ...variant, document: parsed.value, parseError: null }
      : { ...variant, document: null, parseError: parsed.error }
  })

  return {
    key,
    description: found?.parameter.description,
    variants,
    present: found !== null,
    groupName: found?.groupName ?? null,
  }
}

const variantFor = <T>(state: ParameterState<T>, conditionName: string | null): ParameterVariant<T> | undefined =>
  state.variants.find((variant) => variant.conditionName === conditionName)

/**
 * Phân giải các tổ hợp KHÁC NHAU mà thiết bị có thể nhận.
 *
 * Với một điều kiện C: nếu tham số có giá trị riêng cho C thì dùng nó, không
 * thì rơi về giá trị mặc định — đúng cách Firebase phân giải. Nhờ vậy tổ hợp
 * "config_show_ads bản Việt Nam + admob_id bản mặc định" cũng được kiểm tra,
 * mà đó chính là tổ hợp dễ lệch nhất.
 *
 * Điều kiện chưa có giá trị riêng ở BẤT KỲ tham số nào thì không sinh tổ hợp:
 * thiết bị khớp nó vẫn nhận đúng giá trị mặc định, nên tổ hợp đó trùng khít
 * với tổ hợp mặc định và chỉ làm loãng danh sách. Điều kiện vẫn nằm nguyên
 * trên template và vẫn hiện trong tab Điều kiện để người dùng tạo bản riêng.
 */
export function resolveVariants(
  admob: ParameterState<AdmobIdDocument>,
  showAds: ParameterState<ShowAdsDocument>,
  conditions: readonly RemoteConfigCondition[],
): ResolvedVariant[] {
  const conditionNames = new Set<string>()
  for (const state of [admob, showAds]) {
    for (const variant of state.variants) {
      if (variant.conditionName !== null) conditionNames.add(variant.conditionName)
    }
  }

  // Giữ đúng thứ tự khai báo trên template — thứ tự đó quyết định điều kiện nào thắng.
  const ordered = conditions
    .map((condition) => condition.name)
    .filter((name) => conditionNames.has(name))
  for (const name of conditionNames) {
    if (!ordered.includes(name)) ordered.push(name)
  }

  const build = (conditionName: string | null, label: string): ResolvedVariant => {
    const admobDoc =
      variantFor(admob, conditionName)?.document ?? variantFor(admob, null)?.document ?? null
    const showAdsDoc =
      variantFor(showAds, conditionName)?.document ?? variantFor(showAds, null)?.document ?? null

    return {
      conditionName,
      label,
      admob: admobDoc,
      showAds: showAdsDoc,
      validation: validateAdsDocuments({ admob: admobDoc, showAds: showAdsDoc }),
    }
  }

  return [build(null, DEFAULT_VARIANT_LABEL), ...ordered.map((name) => build(name, name))]
}

export function buildAdsWorkspace(
  appSlug: string,
  template: RemoteConfigTemplate,
  etag: string,
): AdsWorkspace {
  const admob = buildParameterState(template, ADMOB_ID_PARAMETER_KEY, parseAdmobIdDocument)
  const showAds = buildParameterState(template, CONFIG_SHOW_ADS_PARAMETER_KEY, parseShowAdsDocument)
  const conditions = template.conditions ?? []

  return {
    appSlug,
    etag,
    template,
    conditions,
    admob,
    showAds,
    resolved: resolveVariants(admob, showAds, conditions),
  }
}

/**
 * Ghi các tài liệu đã sửa trở lại template, KHÔNG đụng tới bất kỳ tham số nào
 * khác.
 *
 * Điều này quan trọng hơn vẻ ngoài của nó: template chứa cả những tham số
 * thuộc về nhóm khác trong công ty. Gửi lên một template thiếu chúng là xoá
 * sạch cấu hình của người khác trong một lần bấm nút.
 */
export function applyWorkspaceToTemplate(workspace: AdsWorkspace): RemoteConfigTemplate {
  const next: RemoteConfigTemplate = {
    ...workspace.template,
    conditions: [...workspace.conditions],
    parameters: { ...(workspace.template.parameters ?? {}) },
    parameterGroups: { ...(workspace.template.parameterGroups ?? {}) },
  }

  const write = <T>(state: ParameterState<T>, serialize: (document: T) => string): void => {
    const existing = findParameter(workspace.template, state.key)?.parameter
    const defaultVariant = state.variants.find((variant) => variant.conditionName === null)
    if (defaultVariant === undefined) return

    const valueOf = (variant: ParameterVariant<T>): string =>
      variant.document !== null ? serialize(variant.document) : variant.raw

    const parameter: RemoteConfigParameter = {
      ...existing,
      defaultValue: { value: valueOf(defaultVariant) },
    }

    const conditional = state.variants.filter((variant) => variant.conditionName !== null)
    if (conditional.length > 0) {
      parameter.conditionalValues = Object.fromEntries(
        conditional.map((variant) => [variant.conditionName as string, { value: valueOf(variant) }]),
      )
    } else {
      delete parameter.conditionalValues
    }

    if (state.groupName !== null) {
      const group = next.parameterGroups?.[state.groupName]
      if (group !== undefined) {
        next.parameterGroups = {
          ...next.parameterGroups,
          [state.groupName]: { ...group, parameters: { ...group.parameters, [state.key]: parameter } },
        }
        return
      }
    }
    next.parameters = { ...next.parameters, [state.key]: parameter }
  }

  write(workspace.admob, (document) => serializeAdmobIdDocument(document))
  write(workspace.showAds, (document) => serializeShowAdsDocument(document))

  return next
}

/** Tổng hợp mức nghiêm trọng cao nhất trên mọi tổ hợp — dùng cho nút publish. */
export const worstSeverity = (workspace: AdsWorkspace): 'error' | 'warning' | 'check' | null => {
  let worst: 'error' | 'warning' | 'check' | null = null
  for (const variant of workspace.resolved) {
    const { summary } = variant.validation
    if (summary.error > 0) return 'error'
    if (summary.warning > 0) worst = 'warning'
    else if (summary.check > 0 && worst === null) worst = 'check'
  }
  return worst
}
