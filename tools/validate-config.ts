/**
 * Kiểm tra cặp template Remote Config từ dòng lệnh.
 *
 *   pnpm validate:config docs/admob_id-template.json docs/config_show_ads-template.json
 *
 * ─── Vì sao file này mỏng ───
 *
 * Toàn bộ luật nằm trong `src/domain/ads/validation/`, dùng chung với website.
 * Trước đây có một bản CJS riêng chép lại cùng bộ luật; hai bản đó chắc chắn sẽ
 * lệch nhau theo thời gian, và khi lệch thì không ai biết bản nào đúng. Giờ chỉ
 * còn một nguồn: sửa luật một lần, cả CLI lẫn giao diện đều đổi theo.
 *
 * Mã thoát: 0 không có lỗi · 1 có lỗi · 2 sai cách dùng.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

import { parseAdmobIdDocument, parseShowAdsDocument } from '../src/domain/ads/AdsDocumentCodec'
import { NATIVE_TEMPLATES } from '../src/domain/ads/entities/NativeTemplate'
import { SEVERITY_LABEL } from '../src/domain/ads/validation/Finding'
import type { Finding, Severity } from '../src/domain/ads/validation/Finding'
import { validateAdsDocuments } from '../src/domain/ads/validation/validateAdsDocuments'

const USAGE = `
Cách dùng:
  pnpm validate:config <admob_id.json> <config_show_ads.json> [tuỳ chọn]

Tuỳ chọn:
  --json               In kết quả dạng JSON thay vì bảng
  --strict             Coi cảnh báo như lỗi (mã thoát 1)
  --include-disabled   Kiểm tra cả những vị trí đang tắt
  --quiet              Chỉ in phần tóm tắt
  --help               Hiện phần hướng dẫn này
`.trim()

interface Options {
  admobPath: string
  showAdsPath: string
  json: boolean
  strict: boolean
  includeDisabled: boolean
  quiet: boolean
}

function parseArgs(argv: readonly string[]): Options | 'help' | null {
  if (argv.includes('--help') || argv.includes('-h')) return 'help'

  const files = argv.filter((arg) => !arg.startsWith('--'))
  const [admobPath, showAdsPath] = files
  if (admobPath === undefined || showAdsPath === undefined) return null

  return {
    admobPath,
    showAdsPath,
    json: argv.includes('--json'),
    strict: argv.includes('--strict'),
    includeDisabled: argv.includes('--include-disabled'),
    quiet: argv.includes('--quiet'),
  }
}

const ANSI: Record<Severity, string> = { error: '[31m', warning: '[33m', check: '[36m' }
const RESET = '[0m'
const useColor = process.stdout.isTTY === true

const paint = (severity: Severity, text: string): string =>
  useColor ? `${ANSI[severity]}${text}${RESET}` : text

const locate = (finding: Finding): string => {
  switch (finding.path.scope) {
    case 'placement':
      return finding.path.field === undefined
        ? finding.path.configName
        : `${finding.path.configName}.${finding.path.field}`
    case 'adUnit':
      return finding.path.field === undefined
        ? finding.path.spaceName
        : `${finding.path.spaceName}.${finding.path.field}`
    case 'showAdsRoot':
      return finding.path.field === undefined ? 'config_show_ads' : `config_show_ads.${finding.path.field}`
    case 'admobRoot':
      return finding.path.field === undefined ? 'admob_id' : `admob_id.${finding.path.field}`
  }
}

function main(): number {
  const parsed = parseArgs(process.argv.slice(2))

  if (parsed === 'help') {
    console.log(USAGE)
    return 0
  }
  if (parsed === null) {
    console.error(USAGE)
    return 2
  }

  const read = (path: string): string => readFileSync(resolve(path), 'utf8').trim()

  let admobRaw: string
  let showAdsRaw: string
  try {
    admobRaw = read(parsed.admobPath)
    showAdsRaw = read(parsed.showAdsPath)
  } catch (thrown) {
    console.error(`Không đọc được tệp: ${thrown instanceof Error ? thrown.message : String(thrown)}`)
    return 2
  }

  const admob = parseAdmobIdDocument(admobRaw)
  const showAds = parseShowAdsDocument(showAdsRaw)

  if (!admob.ok) console.error(`admob_id: ${admob.error.message}`)
  if (!showAds.ok) console.error(`config_show_ads: ${showAds.error.message}`)
  if (!admob.ok || !showAds.ok) return 1

  const result = validateAdsDocuments({
    admob: admob.value,
    showAds: showAds.value,
    options: { includeDisabled: parsed.includeDisabled },
  })

  if (parsed.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    if (!parsed.quiet) {
      console.log('')
      console.log(
        `admob_id    ${result.stats.adUnitCount} ad unit  ·  app ${admob.value.appId || '(chưa đặt)'}`,
      )
      console.log(
        `config      ${result.stats.placementCount} vị trí (${result.stats.enabledPlacementCount} đang bật)  ·  ` +
          `${NATIVE_TEMPLATES.length} template SDK dựng được, ${result.stats.templatesInUse} đang dùng`,
      )
      console.log('')

      // Gộp theo mã luật khi in ra. Tầng domain cố ý báo từng vị trí một để
      // giao diện tô sáng được đúng ô, nhưng trên dòng lệnh thì mười lăm dòng
      // giống hệt nhau chỉ khác tên vị trí là không đọc nổi.
      const grouped = new Map<string, Finding[]>()
      for (const finding of result.findings) {
        const bucket = grouped.get(finding.code)
        if (bucket === undefined) grouped.set(finding.code, [finding])
        else bucket.push(finding)
      }

      for (const [code, findings] of grouped) {
        const first = findings[0]
        if (first === undefined) continue

        console.log(
          `${paint(first.severity, SEVERITY_LABEL[first.severity].padEnd(13))} ${code}` +
            (findings.length > 1 ? `  (${findings.length} chỗ)` : ''),
        )
        for (const finding of findings.slice(0, 10)) {
          console.log(`              · ${locate(finding)} — ${finding.message}`)
        }
        if (findings.length > 10) console.log(`              … và ${findings.length - 10} chỗ nữa`)
        if (first.fix !== undefined) console.log(`              → ${first.fix}`)
        console.log('')
      }
    }

    const { error, warning, check } = result.summary
    console.log(
      `${paint('error', `LỖI  ${error}`)}    ` +
        `${paint('warning', `CẢNH BÁO  ${warning}`)}    ` +
        `${paint('check', `CẦN XÁC NHẬN  ${check}`)}`,
    )
  }

  if (result.summary.error > 0) return 1
  if (parsed.strict && result.summary.warning > 0) return 1
  return 0
}

process.exitCode = main()
