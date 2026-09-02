/**
 * Kiểu quảng cáo và mạng quảng cáo.
 *
 * NGUỒN: LibAds/utils/AdDef.kt — `ADS_TYPE_ADMOB` và `NETWORK`.
 *
 * Lưu ý một cái bẫy đã gặp: `native_interstitial` TRÔNG như một kiểu hợp lệ
 * nhưng không có trong AdDef. Đặt giá trị đó vào JSON thì SDK không nhận ra
 * và vị trí quảng cáo đó chết lặng.
 */
export const AD_TYPES = [
  'open_app',
  'interstitial',
  'native',
  'native_full_screen',
  'banner',
  'banner_adaptive',
  'banner_large',
  'banner_inline',
  'banner_collapsible',
  'reward_video',
  'reward_interstitial',
] as const

export type AdType = (typeof AD_TYPES)[number]

export const AD_TYPE_SET: ReadonlySet<string> = new Set<string>(AD_TYPES)
export const isAdType = (value: string): value is AdType => AD_TYPE_SET.has(value)

/** Hai kiểu này đọc tới nhóm trường tạo hình native (màu, template, viền...). */
export const NATIVE_AD_TYPES = ['native', 'native_full_screen'] as const
export const isNativeAdType = (value: string): boolean =>
  value === 'native' || value === 'native_full_screen'

/**
 * Nhãn hiển thị. Tên loại quảng cáo giữ nguyên tiếng Anh theo cách gọi của
 * AdMob và của SDK — dịch ra tiếng Việt thì người đọc phải dịch ngược lại khi
 * đối chiếu với AdMob console, với AdDef.kt hay với tài liệu của Google.
 */
export const AD_TYPE_LABEL: Record<AdType, string> = {
  open_app: 'App Open',
  interstitial: 'Interstitial',
  native: 'Native',
  native_full_screen: 'Native Full Screen',
  banner: 'Banner',
  banner_adaptive: 'Adaptive Banner',
  banner_large: 'Large Banner',
  banner_inline: 'Inline Banner',
  banner_collapsible: 'Collapsible Banner',
  reward_video: 'Rewarded Video',
  reward_interstitial: 'Rewarded Interstitial',
}

export const AD_NETWORKS = ['google', 'pangle', 'mintegral'] as const
export type AdNetwork = (typeof AD_NETWORKS)[number]
export const AD_NETWORK_SET: ReadonlySet<string> = new Set<string>(AD_NETWORKS)
export const isAdNetwork = (value: string): value is AdNetwork => AD_NETWORK_SET.has(value)

/** Vị trí nút đóng của native hiện sau quảng cáo Interstitial. NGUỒN: AdsConstant.NativeInterClosePosition */
export const NATIVE_INTER_CLOSE_POSITIONS = [
  { value: 0, label: 'Trái' },
  { value: 1, label: 'Giữa' },
  { value: 2, label: 'Phải' },
] as const
