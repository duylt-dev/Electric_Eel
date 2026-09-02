/**
 * Danh mục layout template cho quảng cáo native.
 *
 * SINH TỰ ĐỘNG — đừng sửa tay.
 * Nguồn: LibAds/model/ConfigAds.kt (companion object + các nhánh `when` trong
 * `getConfigNative()`, đã đối chiếu hai chiều).
 * Sinh lại: node scripts/generate-native-templates.mjs <đường-dẫn>/ConfigAds.kt
 *
 * Năm mảng `listTemplate*` nằm trong chính file config_show_ads KHÔNG phải
 * nguồn sự thật: SDK không đọc chúng lần nào. Chúng chỉ là ghi chú cho người,
 * và trên thực tế đã lệch khỏi code — từng chứa ba tên SDK không dựng được,
 * đồng thời thiếu một tên SDK dựng được.
 *
 * Tên không nằm trong danh sách này thì `when` rơi vào nhánh `else` và dùng
 * bố cục mặc định — im lặng, không log, không crash.
 */
export type NativeTemplateGroup = 'small' | 'medium' | 'large' | 'collapsible' | 'nativeFull'

export interface NativeTemplate {
  readonly id: string
  readonly group: NativeTemplateGroup
}

export const NATIVE_TEMPLATES: readonly NativeTemplate[] = [
  { id: 'small_icon_ctaright', group: 'small' },
  { id: 'small_ctaright', group: 'small' },
  { id: 'Medium1_icontop_ctabot', group: 'medium' },
  { id: 'medium3_icon_ctabot', group: 'medium' },
  { id: 'medium3_ctabot', group: 'medium' },
  { id: 'Medium2_icon_ctatop', group: 'medium' },
  { id: 'Medium2_icon_ctabot', group: 'medium' },
  { id: 'medium3_ctatop', group: 'medium' },
  { id: 'medium_medialeft_iconright_ctabot', group: 'medium' },
  { id: 'medium_medialeft_noiconright_ctabot', group: 'medium' },
  { id: 'medium_medialeft_iconright_ctatop', group: 'medium' },
  { id: 'medium_medialeft_noiconright_ctatop', group: 'medium' },
  { id: 'medium_medialeft_iconright_ctaright', group: 'medium' },
  { id: 'medium_medialeft_noiconright_ctaright', group: 'medium' },
  { id: 'medium_mediaright_iconleft_ctaleft', group: 'medium' },
  { id: 'medium_mediaright_noiconleft_ctaleft', group: 'medium' },
  { id: 'medium_icontop_bodymidd_ctabot', group: 'medium' },
  { id: 'medium_icontop_ctamidd', group: 'medium' },
  { id: 'medium_medialeft_icontop_ctaright', group: 'medium' },
  { id: 'medium_medialeft_noicontop_ctaright', group: 'medium' },
  { id: 'Larger_iconbot_cta_bot', group: 'large' },
  { id: 'Larger_icontop_ctabot', group: 'large' },
  { id: 'Larger_iconframe_cta_bot', group: 'large' },
  { id: 'lager_mediabot_iconleft_ctaright', group: 'large' },
  { id: 'lager_mediabot_noiconleft_ctaright', group: 'large' },
  { id: 'larger_iconmidd_ctabot', group: 'large' },
  { id: 'larger_noiconmidd_ctabot', group: 'large' },
  { id: 'Medium1_icontop_ctabot_collapsible', group: 'collapsible' },
  { id: 'medium2_icon_ctabot_collapsible', group: 'collapsible' },
  { id: 'medium2_ctabot_collapsible', group: 'collapsible' },
  { id: 'small_icon_ctaright_collapsible', group: 'collapsible' },
  { id: 'medium_icontop_bodymidd_ctabot_collapsible', group: 'collapsible' },
  { id: 'medium_icontop_ctamidd_collapsible', group: 'collapsible' },
  { id: 'nativefull_media_icon_cta', group: 'nativeFull' },
  { id: 'nativefull_media_iconframe_cta', group: 'nativeFull' },
  { id: 'nativefull_iconframe_media_cta', group: 'nativeFull' },
  { id: 'nativefull_media_iconmiddle_cta', group: 'nativeFull' },
  { id: 'nativefull_icon_media_cta', group: 'nativeFull' },
  { id: 'nativefull_noicon_media_cta', group: 'nativeFull' },
  { id: 'nativefull_media916_cta_icon', group: 'nativeFull' },
  { id: 'nativefull_media34_cta_icon', group: 'nativeFull' },
  { id: 'nativefull_media34_titleleft_ctaright', group: 'nativeFull' },
  { id: 'nativefull_media34__ctaleft_titleright', group: 'nativeFull' },
] as const

export const NATIVE_TEMPLATE_GROUP_LABEL: Record<NativeTemplateGroup, string> = {
  small: 'Nhỏ',
  medium: 'Trung bình',
  large: 'Lớn',
  collapsible: 'Collapsible',
  nativeFull: 'Native Full Screen',
}

export const NATIVE_TEMPLATE_IDS: ReadonlySet<string> = new Set(NATIVE_TEMPLATES.map((t) => t.id))

/** Giá trị mặc định của `layoutTemplate` trong ConfigAds.kt. */
export const DEFAULT_NATIVE_TEMPLATE = 'small_icon_ctaright'

export const isKnownNativeTemplate = (value: string): boolean => NATIVE_TEMPLATE_IDS.has(value)

export const templatesByGroup = (group: NativeTemplateGroup): readonly NativeTemplate[] =>
  NATIVE_TEMPLATES.filter((template) => template.group === group)
