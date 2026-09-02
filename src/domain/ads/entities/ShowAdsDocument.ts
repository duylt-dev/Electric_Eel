import { DEFAULT_NATIVE_TEMPLATE } from './NativeTemplate'

/**
 * Nội dung của tham số Remote Config `config_show_ads`.
 *
 * NGUỒN: LibAds/model/ConfigResult.kt (cấp gốc) và ConfigAds.kt (mỗi phần tử
 * `listConfig`). Giá trị mặc định ghi trong `SHOW_ADS_DEFAULTS` /
 * `AD_PLACEMENT_DEFAULTS` là mặc định THẬT của SDK, chép từ khai báo Kotlin.
 *
 * Vì sao mặc định lại quan trọng: Gson chỉ ghi đè những trường có mặt trong
 * JSON. Trường vắng mặt giữ nguyên mặc định của lớp — nên biết mặc định là gì
 * mới nói được "bỏ trống ô này thì điều gì xảy ra".
 */

/** Một vị trí quảng cáo. NGUỒN: ConfigAds.kt */
export interface AdPlacement {
  configName: string
  isOn: boolean
  type: string
  network: string

  // ── Interstitial ──────────────────────────────────────────────────────────
  timeDelayShowInter?: number | null
  /** Bật thì vị trí `interstitial` được phép mang thêm nhóm trường native bên dưới. */
  isShowNativeAfterInter?: boolean

  // ── Native ────────────────────────────────────────────────────────────────
  ctaGradientListColor?: string[] | null
  textCTAColor?: string
  ctaRatio?: string | null
  ctaConnerRadius?: number
  layoutTemplate?: string
  backGroundColor?: string
  textContentColor?: string
  isPreloadAfterShow?: boolean
  isCloseWhenClick?: boolean
  isCloseWhenClickNativeCollapsible?: boolean
  ctaAnimationSpeed?: number
  nativeStrokeWidth?: number
  nativeStrokeColor?: string
  timeShowNativeCollapsibleAfterClose?: number
}

/** Cấp gốc. NGUỒN: ConfigResult.kt */
export interface ShowAdsDocument {
  timeDelayNative?: number
  /** 0 = trái, 1 = giữa, 2 = phải. */
  positionCloseNativeAfterInter?: number
  /** Công tắc tổng. Bật lên là tắt sạch quảng cáo toàn app. */
  disableAllConfig?: boolean

  isOpenAppOn?: boolean
  isInterstitialOn?: boolean
  isNativeOn?: boolean
  isNativeFullScreenOn?: boolean
  isBannerOn?: boolean
  isBannerAdaptiveOn?: boolean
  isBannerLargeOn?: boolean
  isBannerInlineOn?: boolean
  isBannerCollapsibleOn?: boolean
  isRewardVideoOn?: boolean
  /**
   * Tên đúng là `isRewardInterOn`. Có project từng viết `isRewardInter` — Gson
   * bỏ qua trường lạ nên cờ đó không bao giờ có tác dụng, và vì mặc định cũng
   * là `true` nên không ai nhận ra suốt thời gian dài.
   */
  isRewardInterOn?: boolean

  isNotificationOn?: boolean
  notificationTemplate?: string | null
  timeShowNotificationAfterLeftApp?: number
  timeDelayNotification?: number

  listConfig: AdPlacement[]

  /**
   * Năm mảng danh mục template (`listTemplateSmall`, `listTemplateMedium`,
   * `listTemplateLarge`, `listTemplateCollapsible`, `listTemplateNativeFull`)
   * KHÔNG có trong ConfigResult.kt — SDK không đọc chúng. Giữ lại nguyên vẹn
   * khi đọc/ghi để không xoá mất ghi chú của người khác, nhưng đừng dùng chúng
   * làm nguồn cho ô chọn template: dùng NATIVE_TEMPLATES.
   */
  [extraKey: string]: unknown
}

/** Mặc định cấp gốc, chép từ ConfigResult.kt. */
export const SHOW_ADS_DEFAULTS = {
  timeDelayNative: 4000,
  positionCloseNativeAfterInter: 0,
  disableAllConfig: false,
  isOpenAppOn: true,
  isInterstitialOn: true,
  isNativeOn: true,
  isNativeFullScreenOn: true,
  isBannerOn: true,
  isBannerAdaptiveOn: true,
  isBannerLargeOn: true,
  isBannerInlineOn: true,
  isBannerCollapsibleOn: true,
  isRewardVideoOn: true,
  isRewardInterOn: true,
  isNotificationOn: false,
  notificationTemplate: null,
  timeShowNotificationAfterLeftApp: 5000,
  timeDelayNotification: 15000,
} as const

/** Mặc định của mỗi vị trí, chép từ ConfigAds.kt. */
export const AD_PLACEMENT_DEFAULTS = {
  isOn: false,
  type: 'interstitial',
  network: 'google',
  timeDelayShowInter: null,
  isShowNativeAfterInter: false,
  ctaGradientListColor: null,
  textCTAColor: '#FFFFFF',
  ctaRatio: null,
  ctaConnerRadius: 10,
  layoutTemplate: DEFAULT_NATIVE_TEMPLATE,
  backGroundColor: '#E8E6E6',
  textContentColor: '#444444',
  isPreloadAfterShow: false,
  isCloseWhenClick: false,
  isCloseWhenClickNativeCollapsible: true,
  ctaAnimationSpeed: 0,
  nativeStrokeWidth: 0,
  nativeStrokeColor: '#000000',
  timeShowNativeCollapsibleAfterClose: 5,
} as const

/** Toàn bộ tên trường mà ConfigAds.kt đọc được. Ngoài danh sách này là trường chết. */
export const AD_PLACEMENT_FIELDS: ReadonlySet<string> = new Set([
  'configName',
  'isOn',
  'type',
  'network',
  'timeDelayShowInter',
  'isShowNativeAfterInter',
  'ctaGradientListColor',
  'textCTAColor',
  'ctaRatio',
  'ctaConnerRadius',
  'layoutTemplate',
  'backGroundColor',
  'textContentColor',
  'isPreloadAfterShow',
  'isCloseWhenClick',
  'isCloseWhenClickNativeCollapsible',
  'ctaAnimationSpeed',
  'nativeStrokeWidth',
  'nativeStrokeColor',
  'timeShowNativeCollapsibleAfterClose',
])

/**
 * Chú thích do người viết tự thêm vào JSON. Gson bỏ qua chúng, và đó là đúng ý:
 * chúng dành cho người đọc file. Đừng báo là trường rác, cũng đừng xoá đi.
 */
export const META_FIELDS: ReadonlySet<string> = new Set(['_comment', '_note', '_todo'])

/** Toàn bộ tên trường mà ConfigResult.kt đọc được ở cấp gốc. */
export const SHOW_ADS_ROOT_FIELDS: ReadonlySet<string> = new Set([
  ...Object.keys(SHOW_ADS_DEFAULTS),
  'listConfig',
])

/**
 * Trường từng tồn tại trong template thật nhưng SDK không đọc, kèm gợi ý sửa.
 * Đây là bảng tra để tool nói được "chỗ này viết sai tên" thay vì chỉ "lạ".
 */
export const RENAMED_ROOT_FIELDS: Readonly<Record<string, string>> = {
  isRewardInter: 'isRewardInterOn',
}

/** Năm mảng danh mục chỉ để người đọc, SDK không dùng. Giữ nguyên, không cảnh báo. */
export const DOCUMENTATION_ONLY_ROOT_FIELDS: ReadonlySet<string> = new Set([
  'listTemplateSmall',
  'listTemplateMedium',
  'listTemplateLarge',
  'listTemplateCollapsible',
  'listTemplateNativeFull',
])

export const emptyShowAdsDocument = (): ShowAdsDocument => ({
  ...SHOW_ADS_DEFAULTS,
  listConfig: [],
})

/** Vị trí demo dùng để thử layout, không sinh doanh thu — miễn các luật về ID thật. */
export const isDemoPlacement = (configName: string): boolean => /^demo(_|$)/i.test(configName)

/**
 * Vị trí mà SDK gọi thẳng bằng tên, không đi qua `listConfig`.
 * Không có cấu hình tương ứng không có nghĩa là thừa.
 */
export const DIRECTLY_CALLED_SPACE_PATTERNS: readonly RegExp[] = [/^preload_/i, /^splash_openad/i]

export const isDirectlyCalledSpace = (spaceName: string): boolean =>
  DIRECTLY_CALLED_SPACE_PATTERNS.some((pattern) => pattern.test(spaceName))
