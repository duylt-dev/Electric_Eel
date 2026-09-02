import { AD_TYPES, AD_TYPE_LABEL, NATIVE_INTER_CLOSE_POSITIONS, isNativeAdType } from '@/domain/ads/entities/AdType'
import { AD_PLACEMENT_DEFAULTS } from '@/domain/ads/entities/ShowAdsDocument'
import type { AdPlacement } from '@/domain/ads/entities/ShowAdsDocument'

/**
 * Mô tả từng ô nhập của một vị trí quảng cáo.
 *
 * ─── Vì sao là dữ liệu chứ không phải JSX ───
 *
 * Đây là điểm mở/đóng của biểu mẫu: SDK thêm một trường thì thêm một mục ở
 * đây, không ai phải mở file form ra sửa. Quan trọng hơn, mọi trường đều buộc
 * phải có `help` — và `help` phải nói HẬU QUẢ, không phải nói lại tên trường.
 *
 * "Thời gian chờ trước khi hiện quảng cáo" là mô tả vô dụng cho một ô tên là
 * timeDelayShowInter. Còn "Để 0 thì quảng cáo bật lên ngay khi màn hình mở,
 * người dùng chưa kịp thấy nội dung" thì mới trả lời được câu người mới thật
 * sự hỏi: đặt số nào thì chuyện gì xảy ra.
 */

export type FieldKind =
  | 'boolean'
  | 'number'
  | 'text'
  | 'color'
  | 'colorList'
  | 'template'
  | 'select'

export type FieldGroup = 'basic' | 'interstitial' | 'nativeLook' | 'nativeBehaviour'

export const FIELD_GROUP_LABEL: Record<FieldGroup, string> = {
  basic: 'Cơ bản',
  interstitial: 'Interstitial',
  nativeLook: 'Tạo hình native',
  nativeBehaviour: 'Hành vi native',
}

export const FIELD_GROUP_HELP: Record<FieldGroup, string> = {
  basic: 'Áp dụng cho mọi kiểu quảng cáo.',
  interstitial: 'Chỉ có tác dụng khi kiểu là "Interstitial".',
  nativeLook: 'Màu sắc và bố cục của quảng cáo native.',
  nativeBehaviour: 'Cách quảng cáo native phản ứng với thao tác của người dùng.',
}

export interface FieldDescriptor {
  field: string
  label: string
  /** Nói hậu quả của việc đặt giá trị này, không nói lại tên trường. */
  help: string
  kind: FieldKind
  group: FieldGroup
  /** Giá trị SDK dùng khi trường vắng mặt. Hiện lên để người dùng biết bỏ trống nghĩa là gì. */
  defaultValue: unknown
  options?: readonly { value: string | number; label: string }[]
  /** Ẩn ô khi nó không có tác dụng gì với cấu hình hiện tại. */
  appliesTo?: (placement: AdPlacement) => boolean
  min?: number
  max?: number
  unit?: string
}

/** Nhóm trường native chỉ có tác dụng với native, hoặc với Interstitial có bật native theo sau. */
const usesNative = (placement: AdPlacement): boolean =>
  isNativeAdType(placement.type) || placement.isShowNativeAfterInter === true

const isInterstitial = (placement: AdPlacement): boolean => placement.type === 'interstitial'

export const PLACEMENT_FIELDS: readonly FieldDescriptor[] = [
  {
    field: 'isOn',
    label: 'Bật vị trí này',
    help: 'Tắt thì SDK không yêu cầu quảng cáo cho vị trí này nữa. Đây là công tắc nhanh nhất để dừng một vị trí đang có vấn đề.',
    kind: 'boolean',
    group: 'basic',
    defaultValue: AD_PLACEMENT_DEFAULTS.isOn,
  },
  {
    field: 'type',
    label: 'Kiểu quảng cáo',
    help: 'Phải khớp với adsType của ad unit trong admob_id, nếu không SDK xin một loại quảng cáo mà AdMob không có ở vị trí đó.',
    kind: 'select',
    group: 'basic',
    defaultValue: AD_PLACEMENT_DEFAULTS.type,
    options: AD_TYPES.map((type) => ({ value: type, label: `${AD_TYPE_LABEL[type]} (${type})` })),
  },
  {
    field: 'network',
    label: 'Mạng quảng cáo',
    help: 'Hầu hết vị trí dùng google. Chỉ đổi khi đã tích hợp sẵn SDK của mạng đó.',
    kind: 'select',
    group: 'basic',
    defaultValue: AD_PLACEMENT_DEFAULTS.network,
    options: [
      { value: 'google', label: 'Google AdMob' },
      { value: 'pangle', label: 'Pangle' },
      { value: 'mintegral', label: 'Mintegral' },
    ],
  },

  {
    field: 'timeDelayShowInter',
    label: 'Chờ trước khi hiện (ms)',
    help: 'Để trống hoặc 0 thì quảng cáo bật lên ngay khi màn hình mở, người dùng chưa kịp nhìn thấy nội dung. Thường đặt 500–1500ms.',
    kind: 'number',
    group: 'interstitial',
    defaultValue: AD_PLACEMENT_DEFAULTS.timeDelayShowInter,
    appliesTo: isInterstitial,
    min: 0,
    max: 30000,
    unit: 'ms',
  },
  {
    field: 'isShowNativeAfterInter',
    label: 'Hiện native ngay sau khi đóng',
    help: 'Bật thì ngay sau quảng cáo Interstitial sẽ có thêm một quảng cáo native. Cần có ad unit native cho vị trí này, nếu không sẽ không hiện gì.',
    kind: 'boolean',
    group: 'interstitial',
    defaultValue: AD_PLACEMENT_DEFAULTS.isShowNativeAfterInter,
    appliesTo: isInterstitial,
  },

  {
    field: 'layoutTemplate',
    label: 'Bố cục',
    help: 'Tên không nằm trong danh sách thì SDK im lặng dùng bố cục mặc định — không báo lỗi, nên rất dễ tưởng đã đổi mà thực ra chưa.',
    kind: 'template',
    group: 'nativeLook',
    defaultValue: AD_PLACEMENT_DEFAULTS.layoutTemplate,
    appliesTo: usesNative,
  },
  {
    field: 'backGroundColor',
    label: 'Màu nền',
    help: 'Nền của cả khối quảng cáo. Nên gần với nền màn hình để quảng cáo không cắt ngang giao diện.',
    kind: 'color',
    group: 'nativeLook',
    defaultValue: AD_PLACEMENT_DEFAULTS.backGroundColor,
    appliesTo: usesNative,
  },
  {
    field: 'textContentColor',
    label: 'Màu chữ nội dung',
    help: 'Màu tiêu đề và mô tả. Đặt quá gần màu nền thì chữ biến mất trên máy người dùng.',
    kind: 'color',
    group: 'nativeLook',
    defaultValue: AD_PLACEMENT_DEFAULTS.textContentColor,
    appliesTo: usesNative,
  },
  {
    field: 'textCTAColor',
    label: 'Màu chữ nút bấm',
    help: 'Màu chữ trên nút hành động. Phải tương phản đủ với màu nút, không phải với màu nền.',
    kind: 'color',
    group: 'nativeLook',
    defaultValue: AD_PLACEMENT_DEFAULTS.textCTAColor,
    appliesTo: usesNative,
  },
  {
    field: 'ctaGradientListColor',
    label: 'Màu nút bấm (chuyển sắc)',
    help: 'Danh sách màu để đổ chuyển sắc cho nút. Một màu duy nhất thì nút ra màu phẳng — nếu muốn vậy thì bỏ trống ô này cho rõ ý.',
    kind: 'colorList',
    group: 'nativeLook',
    defaultValue: AD_PLACEMENT_DEFAULTS.ctaGradientListColor,
    appliesTo: usesNative,
  },
  {
    field: 'ctaConnerRadius',
    label: 'Bo góc nút',
    help: 'Bán kính bo góc của nút, tính theo dp. 0 là góc vuông.',
    kind: 'number',
    group: 'nativeLook',
    defaultValue: AD_PLACEMENT_DEFAULTS.ctaConnerRadius,
    appliesTo: usesNative,
    min: 0,
    max: 100,
    unit: 'dp',
  },
  {
    field: 'ctaRatio',
    label: 'Tỉ lệ nút',
    help: 'Dạng "rộng:cao", ví dụ "3:1". Sai cú pháp thì ConstraintLayout bỏ qua và nút ra sai kích thước.',
    kind: 'text',
    group: 'nativeLook',
    defaultValue: AD_PLACEMENT_DEFAULTS.ctaRatio,
    appliesTo: usesNative,
  },
  {
    field: 'nativeStrokeWidth',
    label: 'Độ dày viền',
    help: 'Viền quanh khối quảng cáo, tính theo dp. 0 là không viền.',
    kind: 'number',
    group: 'nativeLook',
    defaultValue: AD_PLACEMENT_DEFAULTS.nativeStrokeWidth,
    appliesTo: usesNative,
    min: 0,
    max: 20,
    unit: 'dp',
  },
  {
    field: 'nativeStrokeColor',
    label: 'Màu viền',
    help: 'Chỉ nhìn thấy khi độ dày viền lớn hơn 0.',
    kind: 'color',
    group: 'nativeLook',
    defaultValue: AD_PLACEMENT_DEFAULTS.nativeStrokeColor,
    appliesTo: usesNative,
  },

  {
    field: 'isPreloadAfterShow',
    label: 'Nạp sẵn bản kế tiếp',
    help: 'Bật thì ngay sau khi hiện xong, SDK nạp trước quảng cáo cho lần sau. Nhanh hơn cho người dùng, tốn thêm băng thông.',
    kind: 'boolean',
    group: 'nativeBehaviour',
    defaultValue: AD_PLACEMENT_DEFAULTS.isPreloadAfterShow,
    appliesTo: usesNative,
  },
  {
    field: 'isCloseWhenClick',
    label: 'Tự đóng khi người dùng bấm',
    help: 'Bật thì quảng cáo biến mất ngay khi được bấm. Tắt thì nó ở lại cho tới khi người dùng tự đóng.',
    kind: 'boolean',
    group: 'nativeBehaviour',
    defaultValue: AD_PLACEMENT_DEFAULTS.isCloseWhenClick,
    appliesTo: usesNative,
  },
  {
    field: 'isCloseWhenClickNativeCollapsible',
    label: 'Tự đóng khi bấm (bản Collapsible)',
    help: 'Như trên nhưng dành cho bố cục Collapsible. Mặc định đang bật.',
    kind: 'boolean',
    group: 'nativeBehaviour',
    defaultValue: AD_PLACEMENT_DEFAULTS.isCloseWhenClickNativeCollapsible,
    appliesTo: usesNative,
  },
  {
    field: 'timeShowNativeCollapsibleAfterClose',
    label: 'Hiện lại sau khi đóng (giây)',
    help: 'Người dùng đóng quảng cáo Collapsible rồi thì bao lâu sau nó hiện lại. Số quá nhỏ gây khó chịu và làm tăng tỉ lệ gỡ app.',
    kind: 'number',
    group: 'nativeBehaviour',
    defaultValue: AD_PLACEMENT_DEFAULTS.timeShowNativeCollapsibleAfterClose,
    appliesTo: usesNative,
    min: 0,
    max: 600,
    unit: 'giây',
  },
  {
    field: 'ctaAnimationSpeed',
    label: 'Tốc độ nhấp nháy nút (ms)',
    help: '0 là không nhấp nháy. Giá trị nhỏ làm nút nháy nhanh, gây rối mắt.',
    kind: 'number',
    group: 'nativeBehaviour',
    defaultValue: AD_PLACEMENT_DEFAULTS.ctaAnimationSpeed,
    appliesTo: usesNative,
    min: 0,
    max: 10000,
    unit: 'ms',
  },
]

export const fieldsInGroup = (group: FieldGroup, placement: AdPlacement): FieldDescriptor[] =>
  PLACEMENT_FIELDS.filter(
    (descriptor) => descriptor.group === group && (descriptor.appliesTo?.(placement) ?? true),
  )

export const FIELD_GROUPS: readonly FieldGroup[] = ['basic', 'interstitial', 'nativeLook', 'nativeBehaviour']

/** Trường cấp gốc của config_show_ads: công tắc tổng cho từng loại quảng cáo. */
export interface RootFieldDescriptor {
  field: string
  label: string
  help: string
  kind: FieldKind
  defaultValue: unknown
  options?: readonly { value: string | number; label: string }[]
  min?: number
  max?: number
  unit?: string
}

export const ROOT_SWITCHES: readonly RootFieldDescriptor[] = [
  {
    field: 'disableAllConfig',
    label: 'Tắt toàn bộ quảng cáo',
    help: 'Công tắc khẩn cấp. Bật lên là mọi vị trí đều ngừng, bất kể cấu hình từng vị trí ra sao.',
    kind: 'boolean',
    defaultValue: false,
  },
  { field: 'isOpenAppOn', label: 'App Open', help: 'Loại hiện khi người dùng mở hoặc quay lại app.', kind: 'boolean', defaultValue: true },
  { field: 'isInterstitialOn', label: 'Interstitial', help: 'Loại chiếm hết màn hình giữa hai thao tác.', kind: 'boolean', defaultValue: true },
  { field: 'isNativeOn', label: 'Native', help: 'Loại nhúng vào giao diện, dùng bố cục của app.', kind: 'boolean', defaultValue: true },
  { field: 'isNativeFullScreenOn', label: 'Native Full Screen', help: 'Native chiếm hết màn hình.', kind: 'boolean', defaultValue: true },
  { field: 'isBannerOn', label: 'Banner', help: 'Dải quảng cáo cố định.', kind: 'boolean', defaultValue: true },
  { field: 'isBannerAdaptiveOn', label: 'Adaptive Banner', help: 'Banner tự co theo bề ngang máy.', kind: 'boolean', defaultValue: true },
  { field: 'isBannerLargeOn', label: 'Large Banner', help: 'Banner cỡ lớn.', kind: 'boolean', defaultValue: true },
  { field: 'isBannerInlineOn', label: 'Inline Banner', help: 'Banner nằm giữa nội dung, cuộn theo nội dung.', kind: 'boolean', defaultValue: true },
  { field: 'isBannerCollapsibleOn', label: 'Collapsible Banner', help: 'Banner người dùng thu lại được.', kind: 'boolean', defaultValue: true },
  { field: 'isRewardVideoOn', label: 'Rewarded Video', help: 'Người dùng xem hết để nhận thưởng.', kind: 'boolean', defaultValue: true },
  {
    field: 'isRewardInterOn',
    label: 'Rewarded Interstitial',
    help: 'Chú ý tên: phải là isRewardInterOn. Một số project từng viết isRewardInter — SDK bỏ qua trường sai tên trong im lặng nên cờ đó không bao giờ có tác dụng.',
    kind: 'boolean',
    defaultValue: true,
  },
]

export const ROOT_TIMINGS: readonly RootFieldDescriptor[] = [
  {
    field: 'timeDelayNative',
    label: 'Chờ trước khi nạp native',
    help: 'Đặt lớn thì quảng cáo native xuất hiện muộn, người dùng có thể đã rời màn hình.',
    kind: 'number',
    defaultValue: 4000,
    min: 0,
    max: 60000,
    unit: 'ms',
  },
  {
    field: 'positionCloseNativeAfterInter',
    label: 'Vị trí nút đóng',
    help: 'Chỗ đặt nút đóng của native hiện sau quảng cáo Interstitial.',
    kind: 'select',
    defaultValue: 0,
    options: NATIVE_INTER_CLOSE_POSITIONS.map((position) => ({
      value: position.value,
      label: position.label,
    })),
  },
]
