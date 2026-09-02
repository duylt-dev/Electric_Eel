import {
  AD_UNIT_ID_PATTERN,
  DEMO_AD_UNIT_ID,
  GOOGLE_TEST_AD_UNIT_IDS,
  publisherIdOf,
} from '../../entities/AdmobIdDocument'
import type { AdUnit } from '../../entities/AdmobIdDocument'
import { isNativeAdType } from '../../entities/AdType'
import { isDemoPlacement, isDirectlyCalledSpace } from '../../entities/ShowAdsDocument'
import type { Finding } from '../Finding'
import type { ValidationRule } from '../ValidationRule'

/** ID thật, dùng được, sinh ra doanh thu: đúng dạng, không phải giữ chỗ, không phải ID thử. */
const GOOGLE_TEST_PUBLISHER = '3940256099942544'
const isUsableAdUnitId = (unit: AdUnit): boolean =>
  unit.id !== DEMO_AD_UNIT_ID &&
  AD_UNIT_ID_PATTERN.test(unit.id) &&
  !GOOGLE_TEST_AD_UNIT_IDS.has(unit.id) &&
  publisherIdOf(unit.id) !== GOOGLE_TEST_PUBLISHER

/**
 * Vị trí đang bật nhưng không có ad unit nào trỏ tới. SDK yêu cầu quảng cáo
 * cho một spaceName không tồn tại và không nhận được gì — chỗ đó trống trơn.
 */
export const enabledPlacementWithoutUnit: ValidationRule = {
  code: 'XREF_NO_AD_UNIT',
  title: 'Vị trí đang bật nhưng chưa có ad unit',
  run: ({ activePlacements, unitsByConfigName }) =>
    activePlacements
      .filter((placement) => (unitsByConfigName.get(placement.configName)?.length ?? 0) === 0)
      .map((placement) => ({
        code: 'XREF_NO_AD_UNIT',
        severity: 'error' as const,
        message: `"${placement.configName}" đang bật nhưng không có ad unit nào trong admob_id khớp với nó.`,
        path: { scope: 'placement', configName: placement.configName },
        fix: `Thêm ad unit có spaceName bắt đầu bằng "${placement.configName}_", hoặc tắt vị trí này.`,
      })),
}

/** Vị trí đã tắt và không có ad unit: chưa gây hậu quả, chỉ cần biết. */
export const disabledPlacementWithoutUnit: ValidationRule = {
  code: 'XREF_CFG_ORPHAN',
  title: 'Vị trí đã tắt, chưa có ad unit',
  run: ({ placements, unitsByConfigName, options }) => {
    if (options.includeDisabled) return []
    return placements
      .filter((placement) => placement.isOn !== true)
      .filter((placement) => (unitsByConfigName.get(placement.configName)?.length ?? 0) === 0)
      .map((placement) => ({
        code: 'XREF_CFG_ORPHAN',
        severity: 'check' as const,
        message: `"${placement.configName}" đang tắt và chưa có ad unit. Bật lên mà chưa thêm ad unit thì vị trí này sẽ trống.`,
        path: { scope: 'placement', configName: placement.configName },
      }))
  },
}

/**
 * Ad unit không khớp vị trí nào.
 *
 * Không phải lúc nào cũng là lỗi: một số spaceName được SDK gọi thẳng bằng tên
 * chứ không đi qua `listConfig` (`preload_*`, `splash_openad*`). Bỏ qua chúng.
 */
export const orphanAdUnit: ValidationRule = {
  code: 'XREF_UNIT_ORPHAN',
  title: 'Ad unit không thuộc vị trí nào',
  run: ({ orphanUnits }) =>
    orphanUnits
      .filter((unit) => !isDirectlyCalledSpace(unit.spaceName))
      .map((unit) => ({
        code: 'XREF_UNIT_ORPHAN',
        severity: 'warning' as const,
        message: `Ad unit "${unit.spaceName}" không khớp configName nào trong config_show_ads. Nó nằm đó nhưng không bao giờ được yêu cầu.`,
        path: { scope: 'adUnit', spaceName: unit.spaceName },
        fix: 'Xoá nếu thừa, hoặc kiểm tra lại tên — quy ước là configName + "_" + hậu tố.',
      })),
}

/**
 * Kiểu của ad unit khác kiểu của vị trí.
 *
 * Có hai mẫu lệch kiểu HỢP LỆ và khá phổ biến, phải trừ ra trước khi báo:
 *
 *   1. Vị trí native kèm một ad unit `banner_*` làm phương án dự phòng khi
 *      native không có quảng cáo để trả.
 *   2. Vị trí `interstitial` kèm ad unit native — đó là quảng cáo native hiện
 *      NGAY SAU quảng cáo Interstitial. Bản thân Interstitial lấy từ kho nạp sẵn
 *      dùng chung (`preload_interstitial_*`), nên vị trí không cần ad unit
 *      interstitial riêng.
 *
 * Phần dư sau khi trừ hai mẫu trên chỉ xếp mức "cần xác nhận", không phải lỗi:
 * lệch kiểu có thể là cố ý theo một mẫu mà bộ luật này chưa biết. Xếp nhầm
 * thành lỗi thì người dùng học được thói quen bỏ qua cả những lỗi thật.
 */
export const typeMismatch: ValidationRule = {
  code: 'XREF_TYPE_MISMATCH',
  title: 'Ad unit lệch kiểu so với vị trí',
  run: ({ activePlacements, unitsByConfigName }) => {
    const findings: Finding[] = []

    for (const placement of activePlacements) {
      for (const unit of unitsByConfigName.get(placement.configName) ?? []) {
        if (unit.adsType === placement.type) continue

        const isFallbackBanner = isNativeAdType(placement.type) && unit.adsType.startsWith('banner')
        if (isFallbackBanner) continue

        const interWantsNative = placement.type === 'interstitial' && isNativeAdType(unit.adsType)
        if (interWantsNative) {
          if (placement.isShowNativeAfterInter !== true) {
            findings.push({
              code: 'CFG_AFTERINTER_OFF',
              severity: 'warning',
              message: `"${placement.configName}" có ad unit native "${unit.spaceName}" nhưng isShowNativeAfterInter đang tắt. Ad unit này không bao giờ được gọi tới.`,
              path: { scope: 'placement', configName: placement.configName, field: 'isShowNativeAfterInter' },
              fix: 'Bật cờ lên nếu muốn dùng, hoặc xoá ad unit nếu không.',
            })
          }
          continue
        }

        findings.push({
          code: 'XREF_TYPE_MISMATCH',
          severity: 'check',
          message: `"${unit.spaceName}" (${unit.adsType}) nối với vị trí "${placement.configName}" (${placement.type}) — hai kiểu khác nhau và không khớp mẫu dự phòng nào đã biết.`,
          path: { scope: 'adUnit', spaceName: unit.spaceName, field: 'adsType' },
        })
      }
    }
    return findings
  },
}

/** Bật cờ hiện native sau Interstitial mà không có ad unit native thì cờ đó vô nghĩa. */
export const afterInterWithoutNativeUnit: ValidationRule = {
  code: 'CFG_AFTERINTER_NO_AD',
  title: 'Bật native sau Interstitial nhưng không có ad unit native',
  run: ({ activePlacements, unitsByConfigName }) =>
    activePlacements
      .filter((placement) => placement.type === 'interstitial' && placement.isShowNativeAfterInter === true)
      .filter((placement) => {
        const units = unitsByConfigName.get(placement.configName) ?? []
        return !units.some((unit) => isNativeAdType(unit.adsType))
      })
      .map((placement) => ({
        code: 'CFG_AFTERINTER_NO_AD',
        severity: 'warning' as const,
        message: `"${placement.configName}" bật isShowNativeAfterInter nhưng không có ad unit native nào đi kèm. Sau quảng cáo Interstitial sẽ không có gì hiện ra.`,
        path: { scope: 'placement', configName: placement.configName, field: 'isShowNativeAfterInter' },
      })),
}

/**
 * Vị trí đang bật mà mọi ad unit của nó đều là ID giữ chỗ hoặc ID test.
 * Quảng cáo vẫn hiện nên không ai báo lỗi, nhưng không đồng nào chảy về.
 */
export const enabledPlacementWithoutUsableId: ValidationRule = {
  code: 'CFG_ON_NO_USABLE_ID',
  title: 'Vị trí đang bật nhưng mọi ad ID đều không dùng được',
  run: ({ activePlacements, unitsByConfigName }) =>
    activePlacements
      .filter((placement) => !isDemoPlacement(placement.configName))
      .filter((placement) => {
        const units = unitsByConfigName.get(placement.configName) ?? []
        return units.length > 0 && !units.some(isUsableAdUnitId)
      })
      .map((placement) => ({
        code: 'CFG_ON_NO_USABLE_ID',
        severity: 'error' as const,
        message: `"${placement.configName}" đang bật nhưng mọi ad unit nối tới đều là ID giữ chỗ hoặc ID thử: ${(unitsByConfigName.get(placement.configName) ?? []).map((unit) => `${unit.spaceName}="${unit.id}"`).join(', ')}.`,
        path: { scope: 'placement', configName: placement.configName },
        fix: 'Thay bằng mã ad unit thật trước khi phát hành.',
      })),
}

export const crossReferenceRules: readonly ValidationRule[] = [
  enabledPlacementWithoutUnit,
  enabledPlacementWithoutUsableId,
  disabledPlacementWithoutUnit,
  orphanAdUnit,
  typeMismatch,
  afterInterWithoutNativeUnit,
]
