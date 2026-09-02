/**
 * Sinh danh mục bố cục native từ mã nguồn của LibAds.
 *
 *   node scripts/generate-native-templates.mjs <đường-dẫn-tới>/model/ConfigAds.kt
 *
 * Vì sao phải sinh chứ không chép tay: 43 chuỗi gõ tay là 43 cơ hội sai chính
 * tả, mà sai một ký tự thì SDK rơi vào nhánh `else` và dùng bố cục mặc định —
 * không crash, không log, không triệu chứng. Đúng loại lỗi tool này sinh ra để
 * chặn, nên tool không được phép tự mắc.
 *
 * Script kiểm chứng hai chiều trước khi ghi:
 *   · mọi hằng trong companion object đều có một nhánh `when` tương ứng
 *   · mọi nhánh `when` (trừ `else`) đều có một hằng tương ứng
 * Lệch một chiều nào cũng dừng lại, vì lúc đó nguồn sự thật đã tự mâu thuẫn.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const DEFAULT_SOURCE =
  '/Users/macbook/Desktop/WorkSpace/MobileDev/Android/Organization/Pion/Love-Test' +
  '/LibAds/src/main/java/pion/datlt/libads/model/ConfigAds.kt'

const sourcePath = process.argv[2] ?? DEFAULT_SOURCE
const target = 'src/domain/ads/entities/NativeTemplate.ts'

const source = readFileSync(sourcePath, 'utf8')
const companion = source.split('companion object')[1]
if (companion === undefined) {
  console.error(`Không tìm thấy companion object trong ${sourcePath}`)
  process.exit(1)
}

const GROUPS = {
  small: 'small',
  medium: 'medium',
  large: 'large',
  collapsible: 'collapsible',
  'native full': 'nativeFull',
}

const entries = []
let group = null

for (const line of companion.split('\n')) {
  const text = line.trim()

  const comment = /^\/\/\s*(.+)$/.exec(text)
  if (comment !== null) {
    const key = comment[1].trim().toLowerCase()
    if (key in GROUPS) group = GROUPS[key]
    continue
  }

  const constant = /^const val (\w+)\s*=\s*"([^"]+)"/.exec(text)
  if (constant === null) continue

  if (constant[1] !== constant[2]) {
    console.error(`Tên hằng khác giá trị: ${constant[1]} = "${constant[2]}". Kiểm tra lại ConfigAds.kt.`)
    process.exit(1)
  }
  if (group === null) {
    console.error(`Hằng "${constant[2]}" không nằm dưới nhóm nào. Thiếu dòng chú thích phân nhóm?`)
    process.exit(1)
  }
  entries.push({ id: constant[2], group })
}

const branches = new Set([...source.matchAll(/^\s{12}(\w+) ->/gm)].map((match) => match[1]))
branches.delete('else')

const ids = new Set(entries.map((entry) => entry.id))
const missingConstants = [...branches].filter((name) => !ids.has(name))
const unusedConstants = [...ids].filter((name) => !branches.has(name))

if (missingConstants.length > 0 || unusedConstants.length > 0) {
  console.error('ConfigAds.kt tự mâu thuẫn:')
  if (missingConstants.length > 0) console.error(`  nhánh when không có hằng: ${missingConstants.join(', ')}`)
  if (unusedConstants.length > 0) console.error(`  hằng không có nhánh when: ${unusedConstants.join(', ')}`)
  process.exit(1)
}

const GROUP_LABEL = {
  small: 'Nhỏ',
  medium: 'Trung bình',
  large: 'Lớn',
  collapsible: 'Collapsible',
  nativeFull: 'Native Full Screen',
}

const output = `/**
 * Danh mục layout template cho quảng cáo native.
 *
 * SINH TỰ ĐỘNG — đừng sửa tay.
 * Nguồn: LibAds/model/ConfigAds.kt (companion object + các nhánh \`when\` trong
 * \`getConfigNative()\`, đã đối chiếu hai chiều).
 * Sinh lại: node scripts/generate-native-templates.mjs <đường-dẫn>/ConfigAds.kt
 *
 * Năm mảng \`listTemplate*\` nằm trong chính file config_show_ads KHÔNG phải
 * nguồn sự thật: SDK không đọc chúng lần nào. Chúng chỉ là ghi chú cho người,
 * và trên thực tế đã lệch khỏi code — từng chứa ba tên SDK không dựng được,
 * đồng thời thiếu một tên SDK dựng được.
 *
 * Tên không nằm trong danh sách này thì \`when\` rơi vào nhánh \`else\` và dùng
 * bố cục mặc định — im lặng, không log, không crash.
 */
export type NativeTemplateGroup = 'small' | 'medium' | 'large' | 'collapsible' | 'nativeFull'

export interface NativeTemplate {
  readonly id: string
  readonly group: NativeTemplateGroup
}

export const NATIVE_TEMPLATES: readonly NativeTemplate[] = [
${entries.map((entry) => `  { id: '${entry.id}', group: '${entry.group}' },`).join('\n')}
] as const

export const NATIVE_TEMPLATE_GROUP_LABEL: Record<NativeTemplateGroup, string> = {
${Object.entries(GROUP_LABEL)
  .map(([key, label]) => `  ${key}: '${label}',`)
  .join('\n')}
}

export const NATIVE_TEMPLATE_IDS: ReadonlySet<string> = new Set(NATIVE_TEMPLATES.map((t) => t.id))

/** Giá trị mặc định của \`layoutTemplate\` trong ConfigAds.kt. */
export const DEFAULT_NATIVE_TEMPLATE = 'small_icon_ctaright'

export const isKnownNativeTemplate = (value: string): boolean => NATIVE_TEMPLATE_IDS.has(value)

export const templatesByGroup = (group: NativeTemplateGroup): readonly NativeTemplate[] =>
  NATIVE_TEMPLATES.filter((template) => template.group === group)
`

writeFileSync(target, output)

const counts = entries.reduce((accumulator, entry) => {
  accumulator[entry.group] = (accumulator[entry.group] ?? 0) + 1
  return accumulator
}, {})

console.log(`Đã ghi ${target}: ${entries.length} bố cục`)
console.log(
  Object.entries(counts)
    .map(([group, count]) => `  ${GROUP_LABEL[group]}: ${count}`)
    .join('\n'),
)
