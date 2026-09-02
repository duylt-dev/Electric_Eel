import { isAdType, isNativeAdType } from '../../entities/AdType'
import { isKnownNativeTemplate } from '../../entities/NativeTemplate'
import {
  AD_PLACEMENT_FIELDS,
  DOCUMENTATION_ONLY_ROOT_FIELDS,
  META_FIELDS,
  RENAMED_ROOT_FIELDS,
  SHOW_ADS_ROOT_FIELDS,
  isDemoPlacement,
} from '../../entities/ShowAdsDocument'
import type { Finding } from '../Finding'
import type { ValidationRule } from '../ValidationRule'

const placementPath = (configName: string, field?: string): Finding['path'] =>
  field === undefined ? { scope: 'placement', configName } : { scope: 'placement', configName, field }

export const placementTypeUnknown: ValidationRule = {
  code: 'CFG_TYPE_UNKNOWN',
  title: 'Kiểu vị trí SDK không hiểu',
  run: ({ placements }) =>
    placements
      .filter((placement) => !isAdType(placement.type))
      .map((placement) => ({
        code: 'CFG_TYPE_UNKNOWN',
        severity: 'error' as const,
        message: `"${placement.configName}" khai type = "${placement.type}", không có trong AdDef.ADS_TYPE_ADMOB.`,
        path: placementPath(placement.configName, 'type'),
      })),
}

/**
 * `layoutTemplate` lạ không làm crash: `when` rơi vào nhánh `else` và dùng
 * layout mặc định. Người thiết kế đinh ninh đã đổi layout, thực tế thì không.
 */
export const templateNotInSdk: ValidationRule = {
  code: 'TPL_NOT_IN_SDK',
  title: 'Layout template SDK không dựng được',
  run: ({ placements }) =>
    placements
      .filter((placement) => placement.layoutTemplate !== undefined)
      .filter((placement) => !isKnownNativeTemplate(placement.layoutTemplate as string))
      .map((placement) => ({
        code: 'TPL_NOT_IN_SDK',
        severity: 'error' as const,
        message: `"${placement.configName}" chọn template "${placement.layoutTemplate ?? ''}" — không có trong ConfigAds.kt. SDK im lặng dùng layout mặc định.`,
        path: placementPath(placement.configName, 'layoutTemplate'),
        fix: 'Chọn lại một template trong danh sách 43 template SDK dựng được.',
      })),
}

/** Trường sai tên: Gson bỏ qua, không log, không crash. Giá trị nhập vào rơi vào hư không. */
export const placementDeadField: ValidationRule = {
  code: 'CFG_FIELD_DEAD',
  title: 'Trường SDK không đọc',
  run: ({ placements }) =>
    placements.flatMap((placement) =>
      Object.keys(placement)
        .filter((field) => !AD_PLACEMENT_FIELDS.has(field))
        .filter((field) => !META_FIELDS.has(field))
        .map((field) => ({
          code: 'CFG_FIELD_DEAD',
          severity: 'warning' as const,
          message: `"${placement.configName}" có trường "${field}" mà ConfigAds.kt không đọc. Gson bỏ qua trường lạ trong im lặng — giá trị này không có tác dụng gì.`,
          path: placementPath(placement.configName, field),
          fix: 'Xoá trường này, hoặc sửa lại cho đúng tên nếu vốn định đặt một trường khác.',
        })),
    ),
}

export const rootDeadField: ValidationRule = {
  code: 'ROOT_FIELD_DEAD',
  title: 'Trường cấp gốc SDK không đọc',
  run: ({ showAds }) => {
    if (showAds === null) return []
    return Object.keys(showAds)
      .filter((field) => !SHOW_ADS_ROOT_FIELDS.has(field))
      .filter((field) => !DOCUMENTATION_ONLY_ROOT_FIELDS.has(field))
      .filter((field) => !META_FIELDS.has(field))
      .filter((field) => RENAMED_ROOT_FIELDS[field] === undefined)
      .map((field) => ({
        code: 'ROOT_FIELD_DEAD',
        severity: 'warning' as const,
        message: `Trường cấp gốc "${field}" không có trong ConfigResult.kt. SDK không đọc.`,
        path: { scope: 'showAdsRoot', field },
      }))
  },
}

/**
 * Trường viết sai tên nhưng đúng ý — nguy hiểm hơn trường rác, vì người viết
 * tin rằng nó đang hoạt động. Trường hợp thật: `isRewardInter` thay vì
 * `isRewardInterOn`. Giá trị `true` trùng với mặc định nên không ai thấy gì
 * bất thường; tới ngày cần tắt bằng cách đặt `false` thì mới lộ ra là vô hiệu.
 */
export const rootFieldRenamed: ValidationRule = {
  code: 'ROOT_FIELD_RENAMED',
  title: 'Trường cấp gốc viết sai tên',
  run: ({ showAds }) => {
    if (showAds === null) return []
    return Object.keys(showAds)
      .filter((field) => RENAMED_ROOT_FIELDS[field] !== undefined)
      .map((field) => ({
        code: 'ROOT_FIELD_RENAMED',
        severity: 'error' as const,
        message: `"${field}" phải là "${RENAMED_ROOT_FIELDS[field] ?? ''}". Tên hiện tại không được SDK đọc, nên cờ này chưa từng có tác dụng.`,
        path: { scope: 'showAdsRoot', field },
        fix: `Đổi tên thành "${RENAMED_ROOT_FIELDS[field] ?? ''}", giữ nguyên giá trị.`,
      }))
  },
}

export const duplicateConfigName: ValidationRule = {
  code: 'CFG_NAME_DUPLICATE',
  title: 'Trùng configName',
  run: ({ placements }) => {
    const seen = new Map<string, number>()
    for (const placement of placements) {
      seen.set(placement.configName, (seen.get(placement.configName) ?? 0) + 1)
    }
    return [...seen.entries()]
      .filter(([, count]) => count > 1)
      .map(([configName, count]) => ({
        code: 'CFG_NAME_DUPLICATE',
        severity: 'error' as const,
        message: `configName "${configName}" xuất hiện ${count} lần. Chỉ bản đầu tiên có tác dụng.`,
        path: placementPath(configName, 'configName'),
      }))
  },
}

/** Nhóm trường tạo hình native mà một vị trí có `isShowNativeAfterInter` cần đủ. */
const AFTER_INTER_NATIVE_FIELDS = [
  'layoutTemplate',
  'backGroundColor',
  'textContentColor',
  'textCTAColor',
] as const

export const afterInterIncomplete: ValidationRule = {
  code: 'CFG_AFTERINTER_INCOMPLETE',
  title: 'Bật native sau Interstitial nhưng thiếu cấu hình native',
  run: ({ activePlacements }) =>
    activePlacements
      .filter((placement) => placement.isShowNativeAfterInter === true)
      .flatMap((placement) => {
        const missing = AFTER_INTER_NATIVE_FIELDS.filter(
          (field) => placement[field] === undefined || placement[field] === null,
        )
        if (missing.length === 0) return []
        return [
          {
            code: 'CFG_AFTERINTER_INCOMPLETE',
            severity: 'warning' as const,
            message: `"${placement.configName}" bật isShowNativeAfterInter nhưng thiếu ${missing.join(', ')}. Native hiện ra sẽ mang tạo hình mặc định của SDK, không phải tạo hình của app.`,
            path: placementPath(placement.configName, missing[0]),
            fix: 'Bổ sung các trường còn thiếu, hoặc sao chép từ một vị trí native đã cấu hình đủ.',
          },
        ]
      }),
}

/** Trường tạo hình native nằm trên vị trí không phải native và cũng không hiện native sau Interstitial. */
export const nativeFieldsOnNonNative: ValidationRule = {
  code: 'CFG_NATIVE_FIELDS_UNUSED',
  title: 'Trường native trên vị trí không dùng native',
  run: ({ activePlacements }) =>
    activePlacements
      .filter((placement) => !isNativeAdType(placement.type))
      .filter((placement) => placement.isShowNativeAfterInter !== true)
      .filter((placement) => !isDemoPlacement(placement.configName))
      .filter((placement) => placement.layoutTemplate !== undefined)
      .map((placement) => ({
        code: 'CFG_NATIVE_FIELDS_UNUSED',
        severity: 'check' as const,
        message: `"${placement.configName}" là kiểu ${placement.type} nhưng có layoutTemplate. Trường này chỉ có tác dụng với native, hoặc khi bật isShowNativeAfterInter.`,
        path: placementPath(placement.configName, 'layoutTemplate'),
      })),
}

export const placementRules: readonly ValidationRule[] = [
  placementTypeUnknown,
  templateNotInSdk,
  placementDeadField,
  rootDeadField,
  rootFieldRenamed,
  duplicateConfigName,
  afterInterIncomplete,
  nativeFieldsOnNonNative,
]
