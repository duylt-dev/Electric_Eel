import { isNativeAdType } from '../../entities/AdType'
import type { Finding } from '../Finding'
import type { ValidationRule } from '../ValidationRule'

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

const COLOR_FIELDS = ['textCTAColor', 'backGroundColor', 'textContentColor', 'nativeStrokeColor'] as const

export const malformedColor: ValidationRule = {
  code: 'COLOR_MALFORMED',
  title: 'Mã màu không hợp lệ',
  run: ({ placements }) => {
    const findings: Finding[] = []

    for (const placement of placements) {
      for (const field of COLOR_FIELDS) {
        const value = placement[field]
        if (typeof value !== 'string' || HEX_COLOR.test(value)) continue
        findings.push({
          code: 'COLOR_MALFORMED',
          severity: 'error',
          message: `"${placement.configName}" có ${field} = "${value}". Android parse màu thất bại sẽ ném lỗi lúc dựng layout.`,
          path: { scope: 'placement', configName: placement.configName, field },
          fix: 'Dùng dạng #RRGGBB hoặc #AARRGGBB.',
        })
      }

      const gradient = placement.ctaGradientListColor
      if (Array.isArray(gradient)) {
        gradient.forEach((color, index) => {
          if (typeof color === 'string' && HEX_COLOR.test(color)) return
          findings.push({
            code: 'COLOR_MALFORMED',
            severity: 'error',
            message: `"${placement.configName}" có ctaGradientListColor[${index}] = "${String(color)}" không đúng dạng mã màu.`,
            path: { scope: 'placement', configName: placement.configName, field: 'ctaGradientListColor' },
          })
        })
      }
    }
    return findings
  },
}

/**
 * Mảng gradient có dưới hai màu.
 *
 * Đây mới là lỗi thật: một dải chuyển sắc cần ít nhất hai điểm dừng.
 *
 * Lưu ý điều KHÔNG bị báo ở đây: hai màu giống hệt nhau. Trông như thừa, nhưng
 * đó là quy ước đang dùng để tạo nút màu phẳng — 42 trên 46 vị trí có gradient
 * đều viết như vậy. Báo động trên chín phần mười dữ liệu thì người dùng sẽ học
 * cách bỏ qua bộ kiểm tra, và bỏ qua luôn cả những lần nó báo đúng.
 */
export const degenerateGradient: ValidationRule = {
  code: 'GRADIENT_TOO_SHORT',
  title: 'Gradient có dưới hai màu',
  run: ({ placements }) =>
    placements
      .filter((placement) => Array.isArray(placement.ctaGradientListColor))
      .filter((placement) => (placement.ctaGradientListColor as string[]).length < 2)
      .map((placement) => ({
        code: 'GRADIENT_TOO_SHORT',
        severity: 'error' as const,
        message: `"${placement.configName}" có ctaGradientListColor với ${(placement.ctaGradientListColor as string[]).length} màu. Cần ít nhất hai màu để dựng được dải chuyển sắc.`,
        path: { scope: 'placement', configName: placement.configName, field: 'ctaGradientListColor' },
        fix: 'Thêm màu thứ hai, hoặc bỏ hẳn trường này nếu muốn nút màu phẳng.',
      })),
}

/**
 * Màu nguyên chất trong gradient — dấu vết của giá trị thử còn sót.
 *
 * Đã từng có thật: một vị trí để `["#FF0000", "#00FF00"]`, đỏ chuyển sang xanh
 * lá, rõ ràng là màu để nhìn cho dễ trong lúc thử chứ không phải màu thiết kế.
 */
const DEBUG_COLORS: ReadonlySet<string> = new Set([
  '#FF0000',
  '#00FF00',
  '#0000FF',
  '#FF00FF',
  '#00FFFF',
  '#FFFF00',
])

export const debugColorLeftover: ValidationRule = {
  code: 'COLOR_DEBUG_LEFTOVER',
  title: 'Màu nguyên chất còn sót từ lúc thử',
  run: ({ activePlacements }) =>
    activePlacements
      .filter((placement) => Array.isArray(placement.ctaGradientListColor))
      .filter((placement) =>
        (placement.ctaGradientListColor as string[]).some((color) =>
          DEBUG_COLORS.has(String(color).toUpperCase()),
        ),
      )
      .map((placement) => ({
        code: 'COLOR_DEBUG_LEFTOVER',
        severity: 'check' as const,
        message: `"${placement.configName}" dùng màu nguyên chất trong gradient (${(placement.ctaGradientListColor as string[]).join(', ')}). Nhiều khả năng là màu để thử còn sót lại.`,
        path: { scope: 'placement', configName: placement.configName, field: 'ctaGradientListColor' },
      })),
}

/** `ctaRatio` sai cú pháp làm ConstraintLayout bỏ qua, nút CTA ra sai kích thước. */
export const malformedCtaRatio: ValidationRule = {
  code: 'CTA_RATIO_MALFORMED',
  title: 'Tỉ lệ nút CTA sai cú pháp',
  run: ({ placements }) =>
    placements
      .filter((placement) => isNativeAdType(placement.type) || placement.isShowNativeAfterInter === true)
      .filter((placement) => {
        const ratio = placement.ctaRatio
        return typeof ratio === 'string' && ratio.length > 0 && !/^[HWhw]?,?\d+(\.\d+)?:\d+(\.\d+)?$/.test(ratio)
      })
      .map((placement) => ({
        code: 'CTA_RATIO_MALFORMED',
        severity: 'warning' as const,
        message: `"${placement.configName}" có ctaRatio = "${placement.ctaRatio ?? ''}". ConstraintLayout cần dạng "rộng:cao", ví dụ "3:1".`,
        path: { scope: 'placement', configName: placement.configName, field: 'ctaRatio' },
      })),
}

export const appearanceRules: readonly ValidationRule[] = [
  malformedColor,
  degenerateGradient,
  debugColorLeftover,
  malformedCtaRatio,
]
