import { NATIVE_TEMPLATES } from '../../entities/NativeTemplate'
import { DOCUMENTATION_ONLY_ROOT_FIELDS } from '../../entities/ShowAdsDocument'
import type { Finding } from '../Finding'
import type { ValidationRule } from '../ValidationRule'

/**
 * Luật dọn dẹp: không có gì hỏng, nhưng có thứ đáng nhìn lại.
 *
 * Tất cả đều xếp mức "cần xác nhận". Chúng không chặn publish và không nên
 * chặn — nhưng bỏ hẳn thì mất đi những câu hỏi mà chỉ máy mới chịu khó đếm.
 */

/** Bố cục SDK dựng được nhưng không nằm trong danh mục nên không ai chọn được. */
export const templateMissingFromCatalog: ValidationRule = {
  code: 'TPL_MISSING_FROM_LIST',
  title: 'Bố cục SDK dựng được nhưng không có trong danh mục',
  run: ({ showAds }) => {
    if (showAds === null) return []

    const catalog = new Set<string>()
    for (const key of DOCUMENTATION_ONLY_ROOT_FIELDS) {
      const list = showAds[key]
      if (!Array.isArray(list)) continue
      for (const entry of list) if (typeof entry === 'string') catalog.add(entry)
    }
    // Không có danh mục nào trong file thì luật này không có gì để nói.
    if (catalog.size === 0) return []

    return NATIVE_TEMPLATES.filter((template) => !catalog.has(template.id)).map((template) => ({
      code: 'TPL_MISSING_FROM_LIST',
      severity: 'check' as const,
      message: `SDK dựng được bố cục "${template.id}" nhưng nó không có trong danh mục trong file, nên không ai chọn tới.`,
      path: { scope: 'showAdsRoot' as const },
      fix: 'Thêm vào danh mục nếu muốn dùng, hoặc bỏ qua nếu cố ý không dùng.',
    }))
  },
}

/** Bố cục có trong danh mục nhưng SDK không dựng được — chọn vào là hỏng lặng. */
export const templateInCatalogNotInSdk: ValidationRule = {
  code: 'TPL_CATALOG_PHANTOM',
  title: 'Danh mục có bố cục SDK không dựng được',
  run: ({ showAds }) => {
    if (showAds === null) return []
    const known = new Set(NATIVE_TEMPLATES.map((template) => template.id))
    const findings: Finding[] = []

    for (const key of DOCUMENTATION_ONLY_ROOT_FIELDS) {
      const list = showAds[key]
      if (!Array.isArray(list)) continue
      for (const entry of list) {
        if (typeof entry !== 'string' || known.has(entry)) continue
        findings.push({
          code: 'TPL_CATALOG_PHANTOM',
          severity: 'warning',
          message: `Danh mục "${key}" có "${entry}" nhưng ConfigAds.kt không dựng được bố cục này. Ai chọn nó sẽ nhận bố cục mặc định mà không được báo gì.`,
          path: { scope: 'showAdsRoot', field: key },
          fix: 'Xoá khỏi danh mục, hoặc kiểm tra lại chính tả.',
        })
      }
    }
    return findings
  },
}

/** Bố cục SDK dựng được nhưng chưa vị trí nào dùng. */
export const unusedTemplates: ValidationRule = {
  code: 'TPL_UNUSED',
  title: 'Bố cục chưa dùng tới',
  run: ({ placements }) => {
    const inUse = new Set(
      placements
        .map((placement) => placement.layoutTemplate)
        .filter((template): template is string => typeof template === 'string'),
    )
    const unused = NATIVE_TEMPLATES.filter((template) => !inUse.has(template.id))
    if (unused.length === 0) return []

    return [
      {
        code: 'TPL_UNUSED',
        severity: 'check',
        message: `${unused.length}/${NATIVE_TEMPLATES.length} bố cục SDK dựng được nhưng chưa vị trí nào dùng.`,
        path: { scope: 'showAdsRoot' },
      },
    ]
  },
}

/**
 * Hai kiểu đặt tên cùng tồn tại.
 *
 * Không phải lỗi, và đổi tên hàng loạt thì rủi ro hơn là để yên — mỗi tên đang
 * nối với một ad unit. Nhưng tên THÊM MỚI thì nên theo một kiểu, nếu không
 * mười năm nữa vẫn còn hai kiểu.
 */
export const mixedNamingStyle: ValidationRule = {
  code: 'NAME_STYLE_MIXED',
  title: 'Trộn hai kiểu đặt tên',
  run: ({ placements }) => {
    const dashed = placements.filter((placement) => placement.configName.includes('-')).length
    const underscored = placements.filter(
      (placement) => placement.configName.includes('_') && !placement.configName.includes('-'),
    ).length

    if (dashed === 0 || underscored === 0) return []

    const preferred = underscored >= dashed ? '_' : '-'
    return [
      {
        code: 'NAME_STYLE_MIXED',
        severity: 'check',
        message: `Có ${dashed} tên dùng dấu "-" và ${underscored} tên dùng dấu "_". Tên thêm mới nên theo kiểu "${preferred}".`,
        path: { scope: 'showAdsRoot' },
      },
    ]
  },
}

export const housekeepingRules: readonly ValidationRule[] = [
  templateMissingFromCatalog,
  templateInCatalogNotInSdk,
  unusedTemplates,
  mixedNamingStyle,
]
