import { matchConfigName } from '../entities/AdmobIdDocument'
import type { AdUnit, AdmobIdDocument } from '../entities/AdmobIdDocument'
import { NATIVE_TEMPLATES } from '../entities/NativeTemplate'
import type { AdPlacement, ShowAdsDocument } from '../entities/ShowAdsDocument'
import { compareFindings, summarize } from './Finding'
import type { Finding, FindingSummary } from './Finding'
import { adUnitRules } from './rules/adUnitRules'
import { appearanceRules } from './rules/appearanceRules'
import { crossReferenceRules } from './rules/crossReferenceRules'
import { housekeepingRules } from './rules/housekeepingRules'
import { placementRules } from './rules/placementRules'
import { DEFAULT_VALIDATION_OPTIONS } from './ValidationRule'
import type { ValidationContext, ValidationOptions, ValidationRule } from './ValidationRule'

/**
 * Sổ đăng ký luật. Thêm một luật = thêm một file rồi thêm một dòng vào đây;
 * không ai phải sửa hàm chạy bên dưới. (Open/Closed, hiểu theo nghĩa thực dụng.)
 */
export const ALL_RULES: readonly ValidationRule[] = [
  ...adUnitRules,
  ...placementRules,
  ...crossReferenceRules,
  ...appearanceRules,
  ...housekeepingRules,
]

export interface ValidationInput {
  admob: AdmobIdDocument | null
  showAds: ShowAdsDocument | null
  options?: Partial<ValidationOptions>
}

export interface ValidationStats {
  adUnitCount: number
  placementCount: number
  enabledPlacementCount: number
  /** Số template SDK dựng được, và số template thực sự đang dùng. */
  templatesAvailable: number
  templatesInUse: number
  orphanUnitCount: number
}

export interface ValidationResult {
  findings: Finding[]
  summary: FindingSummary
  stats: ValidationStats
}

export function buildValidationContext(input: ValidationInput): ValidationContext {
  const options: ValidationOptions = { ...DEFAULT_VALIDATION_OPTIONS, ...input.options }
  const placements: AdPlacement[] = input.showAds?.listConfig ?? []
  const adUnits: AdUnit[] = input.admob?.listAds ?? []

  const placementByName = new Map<string, AdPlacement>()
  for (const placement of placements) {
    if (!placementByName.has(placement.configName)) placementByName.set(placement.configName, placement)
  }

  const configNames = [...placementByName.keys()]
  const unitsByConfigName = new Map<string, AdUnit[]>()
  const orphanUnits: AdUnit[] = []

  for (const unit of adUnits) {
    const match = matchConfigName(unit.spaceName, configNames)
    if (match === null) {
      orphanUnits.push(unit)
      continue
    }
    const bucket = unitsByConfigName.get(match.configName)
    if (bucket === undefined) unitsByConfigName.set(match.configName, [unit])
    else bucket.push(unit)
  }

  const activePlacements = options.includeDisabled
    ? placements
    : placements.filter((placement) => placement.isOn === true)

  return {
    admob: input.admob,
    showAds: input.showAds,
    options,
    placements,
    adUnits,
    placementByName,
    unitsByConfigName,
    orphanUnits,
    activePlacements,
  }
}

export function validateAdsDocuments(
  input: ValidationInput,
  rules: readonly ValidationRule[] = ALL_RULES,
): ValidationResult {
  const context = buildValidationContext(input)

  const findings: Finding[] = []
  for (const rule of rules) {
    // Một luật hỏng không được làm chết cả lượt kiểm tra: người dùng vẫn cần
    // thấy những gì các luật còn lại tìm ra.
    try {
      findings.push(...rule.run(context))
    } catch (thrown) {
      findings.push({
        code: 'RULE_CRASHED',
        severity: 'check',
        message: `Luật "${rule.code}" chạy lỗi nên đã bị bỏ qua: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
        path: { scope: 'showAdsRoot' },
      })
    }
  }
  findings.sort(compareFindings)

  const templatesInUse = new Set(
    context.placements
      .map((placement) => placement.layoutTemplate)
      .filter((template): template is string => typeof template === 'string'),
  )

  return {
    findings,
    summary: summarize(findings),
    stats: {
      adUnitCount: context.adUnits.length,
      placementCount: context.placements.length,
      enabledPlacementCount: context.placements.filter((placement) => placement.isOn === true).length,
      templatesAvailable: NATIVE_TEMPLATES.length,
      templatesInUse: templatesInUse.size,
      orphanUnitCount: context.orphanUnits.length,
    },
  }
}

/** Lọc phát hiện thuộc về một vị trí, để form hiện lỗi ngay cạnh ô nhập. */
export const findingsForPlacement = (findings: readonly Finding[], configName: string): Finding[] =>
  findings.filter((finding) => finding.path.scope === 'placement' && finding.path.configName === configName)

export const findingsForAdUnit = (findings: readonly Finding[], spaceName: string): Finding[] =>
  findings.filter((finding) => finding.path.scope === 'adUnit' && finding.path.spaceName === spaceName)

export const findingsForField = (findings: readonly Finding[], field: string): Finding[] =>
  findings.filter((finding) => 'field' in finding.path && finding.path.field === field)
