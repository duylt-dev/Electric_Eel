import type { AdUnit, AdmobIdDocument } from './entities/AdmobIdDocument'
import type { AdPlacement, ShowAdsDocument } from './entities/ShowAdsDocument'

/**
 * So sánh hai phiên bản cấu hình, ở mức TỪNG TRƯỜNG.
 *
 * Diff theo dòng của JSON gần như vô dụng ở đây: cả tài liệu nằm trên một dòng
 * duy nhất. Còn diff theo trường thì đọc được thành câu — "vị trí home-bottom:
 * isOn false → true" — và đó mới là thứ người duyệt cần trước khi bấm publish.
 */

export type ChangeKind = 'added' | 'removed' | 'changed'

export interface FieldChange {
  field: string
  before: unknown
  after: unknown
}

export interface EntityChange {
  kind: ChangeKind
  /** configName hoặc spaceName. */
  name: string
  fields: FieldChange[]
}

export interface AdsDiff {
  rootChanges: FieldChange[]
  placements: EntityChange[]
  adUnits: EntityChange[]
  admobRootChanges: FieldChange[]
  isEmpty: boolean
}

const sameValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (a === undefined || b === undefined || a === null || b === null) return false
  // Đủ cho các giá trị ở đây: nguyên thuỷ, mảng chuỗi, đối tượng nông.
  return JSON.stringify(a) === JSON.stringify(b)
}

const diffFields = (before: Record<string, unknown>, after: Record<string, unknown>): FieldChange[] => {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)])
  const changes: FieldChange[] = []

  for (const field of fields) {
    if (sameValue(before[field], after[field])) continue
    changes.push({ field, before: before[field], after: after[field] })
  }
  return changes.sort((a, b) => a.field.localeCompare(b.field))
}

function diffCollection<T extends Record<string, unknown>>(
  before: readonly T[],
  after: readonly T[],
  keyOf: (item: T) => string,
  /** Trường không phải dữ liệu cấu hình, bỏ khỏi diff nội bộ. */
  skipFields: readonly string[] = [],
): EntityChange[] {
  const beforeByKey = new Map(before.map((item) => [keyOf(item), item]))
  const afterByKey = new Map(after.map((item) => [keyOf(item), item]))
  const changes: EntityChange[] = []

  for (const [key, afterItem] of afterByKey) {
    const beforeItem = beforeByKey.get(key)
    if (beforeItem === undefined) {
      changes.push({ kind: 'added', name: key, fields: [] })
      continue
    }
    const fields = diffFields(beforeItem, afterItem).filter(
      (change) => !skipFields.includes(change.field),
    )
    if (fields.length > 0) changes.push({ kind: 'changed', name: key, fields })
  }

  for (const key of beforeByKey.keys()) {
    if (!afterByKey.has(key)) changes.push({ kind: 'removed', name: key, fields: [] })
  }

  return changes.sort((a, b) => a.name.localeCompare(b.name))
}

const rootOnly = (document: ShowAdsDocument | AdmobIdDocument, listKey: string): Record<string, unknown> => {
  const copy: Record<string, unknown> = { ...(document as Record<string, unknown>) }
  delete copy[listKey]
  return copy
}

export function buildAdsDiff(
  before: { admob: AdmobIdDocument | null; showAds: ShowAdsDocument | null },
  after: { admob: AdmobIdDocument | null; showAds: ShowAdsDocument | null },
): AdsDiff {
  const rootChanges =
    before.showAds !== null && after.showAds !== null
      ? diffFields(rootOnly(before.showAds, 'listConfig'), rootOnly(after.showAds, 'listConfig'))
      : []

  const admobRootChanges =
    before.admob !== null && after.admob !== null
      ? diffFields(rootOnly(before.admob, 'listAds'), rootOnly(after.admob, 'listAds'))
      : []

  const placements = diffCollection<AdPlacement & Record<string, unknown>>(
    (before.showAds?.listConfig ?? []) as (AdPlacement & Record<string, unknown>)[],
    (after.showAds?.listConfig ?? []) as (AdPlacement & Record<string, unknown>)[],
    (item) => item.configName,
    ['configName'],
  )

  const adUnits = diffCollection<AdUnit & Record<string, unknown>>(
    (before.admob?.listAds ?? []) as (AdUnit & Record<string, unknown>)[],
    (after.admob?.listAds ?? []) as (AdUnit & Record<string, unknown>)[],
    (item) => item.spaceName,
    ['spaceName'],
  )

  return {
    rootChanges,
    admobRootChanges,
    placements,
    adUnits,
    isEmpty:
      rootChanges.length === 0 &&
      admobRootChanges.length === 0 &&
      placements.length === 0 &&
      adUnits.length === 0,
  }
}

export const countChanges = (diff: AdsDiff): number =>
  diff.rootChanges.length +
  diff.admobRootChanges.length +
  diff.placements.length +
  diff.adUnits.length

/** Câu mô tả một thay đổi, dùng cho nhật ký và cho màn duyệt. */
export const describeChange = (change: FieldChange): string => {
  const render = (value: unknown): string => {
    if (value === undefined) return '(không có)'
    if (value === null) return 'null'
    if (typeof value === 'string') return value.length === 0 ? '(rỗng)' : value
    return JSON.stringify(value)
  }
  return `${change.field}: ${render(change.before)} → ${render(change.after)}`
}
