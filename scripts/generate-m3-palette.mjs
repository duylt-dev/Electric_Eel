/**
 * Sinh bảng màu Material 3, ghi ra src/ui/theme/generatedPalette.ts
 *
 *   node scripts/generate-m3-palette.mjs
 *
 * Chạy một lần lúc dựng bảng màu, không chạy lúc ứng dụng chạy. Bảng màu là
 * hằng số, nên gửi cả thư viện tính màu HCT xuống trình duyệt để tính ra đúng
 * bộ số đó mỗi lần tải trang là lãng phí thuần tuý.
 *
 * Khác với cách sinh M3 mặc định (một màu gốc suy ra tất cả): ở đây mỗi họ màu
 * có màu nguồn riêng, vì bốn họ ngữ nghĩa — thường / tốt / cần xem / hỏng —
 * phải phân biệt được với nhau bằng chính sắc màu. Suy cả bốn từ một màu gốc
 * thì "tốt" và "hỏng" lệch nhau vài độ hue và người dùng không đọc ra được.
 *
 * Thang tone thì vẫn đúng M3, và đó là lý do giữ thư viện này thay vì gõ tay
 * bảng màu: tone 40 trên nền tone 100, tone 90 với chữ tone 10 — các cặp đó
 * bảo đảm tương phản theo cấu trúc. Cuối script còn một lượt kiểm tra lại tỉ
 * số tương phản thật; lệch chuẩn thì script dừng, không ghi file.
 *
 * Vì sao import bằng đường dẫn tuyệt đối thay vì tên gói: bản 0.4.0 của
 * @material/material-color-utilities có barrel ESM hỏng (một import nội bộ
 * thiếu đuôi .js) và trường `exports` chỉ mở duy nhất barrel đó. Các module con
 * thì lành lặn, nên nạp thẳng chúng. Chỉ script build chịu sự lệch lạc này;
 * mã ứng dụng không hề biết tới thư viện.
 */
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const packageRoot = dirname(require.resolve('@material/material-color-utilities'))
const load = (relative) => import(pathToFileURL(join(packageRoot, relative)).href)

const { argbFromHex, hexFromArgb } = await load('utils/string_utils.js')
const { TonalPalette } = await load('palettes/tonal_palette.js')
const { Hct } = await load('hct/hct.js')

/**
 * Màu nguồn của từng họ. Đây là toàn bộ phần "thẩm mỹ" của bảng màu; mọi thứ
 * còn lại là suy ra theo đặc tả.
 */
const SOURCES = {
  primary: '#2F8FE6', //  xanh dương — thao tác chính, đường dẫn, điểm nhấn
  secondary: '#304574', //  xanh mực   — nhấn phụ, nền của mục đang chọn
  tertiary: '#1B7A4C', //  xanh lá    — trạng thái tốt, đã publish
  warning: '#9C5D00', //  hổ phách   — cảnh báo cần người xác nhận
  error: '#B93A2E', //  đỏ gạch    — lỗi chặn publish
}

/**
 * Sắc xám. M3 mặc định để chroma 4/8 nên nền ra xám chết; nhích lên 6/12 thì
 * cả mặt phẳng nền ngả xanh cùng tông với màu nhấn, và giao diện trông là một
 * hệ màu chứ không phải màu nhấn dán lên nền xám.
 */
const NEUTRAL_CHROMA = 6
const NEUTRAL_VARIANT_CHROMA = 12

/**
 * Nền phụ (`…Container`) dựng từ bản đã hạ độ tươi của chính họ màu, không lấy
 * thẳng tone sáng của bản gốc. Thang tone M3 giữ nguyên độ tươi ở mọi tone, nên
 * tone 93 của một màu xanh lá đậm ra màu bạc hà chói — dùng làm nền cho một
 * dòng chữ nhỏ thì đọc như đèn báo chứ không như một mảng nền.
 */
const CONTAINER_CHROMA = { light: 12, dark: 18 }

const neutralHue = Hct.fromInt(argbFromHex(SOURCES.primary)).hue

const accentPalette = (hex) => {
  const source = Hct.fromInt(argbFromHex(hex))
  return TonalPalette.fromHueAndChroma(source.hue, source.chroma)
}

const palettes = {
  primary: accentPalette(SOURCES.primary),
  secondary: accentPalette(SOURCES.secondary),
  tertiary: accentPalette(SOURCES.tertiary),
  warning: accentPalette(SOURCES.warning),
  error: accentPalette(SOURCES.error),
  neutral: TonalPalette.fromHueAndChroma(neutralHue, NEUTRAL_CHROMA),
  neutralVariant: TonalPalette.fromHueAndChroma(neutralHue, NEUTRAL_VARIANT_CHROMA),
}

const hex = (palette, tone) => hexFromArgb(palettes[palette].tone(tone))

const muted = (name, tone, chroma) => {
  const source = Hct.fromInt(argbFromHex(SOURCES[name]))
  return hexFromArgb(TonalPalette.fromHueAndChroma(source.hue, Math.min(source.chroma, chroma)).tone(tone))
}

/** Bốn vai trò của một họ màu ngữ nghĩa, luôn sinh cùng một bộ tone. */
const family = (name, t) => {
  const capital = `${name[0].toUpperCase()}${name.slice(1)}`
  return {
    [name]: hex(name, t.accent),
    [`on${capital}`]: hex(name, t.onAccent),
    [`${name}Container`]: muted(name, t.accentContainer, t.containerChroma),
    [`on${capital}Container`]: hex(name, t.onAccentContainer),
  }
}

const scheme = (t) => ({
  ...family('primary', t),
  ...family('secondary', t),
  ...family('tertiary', t),
  ...family('warning', t),
  ...family('error', t),

  surface: hex('neutral', t.surface),
  onSurface: hex('neutral', t.onSurface),
  surfaceDim: hex('neutral', t.surfaceDim),
  surfaceBright: hex('neutral', t.surfaceBright),
  surfaceContainerLowest: hex('neutral', t.containerLowest),
  surfaceContainerLow: hex('neutral', t.containerLow),
  surfaceContainer: hex('neutral', t.container),
  surfaceContainerHigh: hex('neutral', t.containerHigh),
  surfaceContainerHighest: hex('neutral', t.containerHighest),

  onSurfaceVariant: hex('neutralVariant', t.onSurfaceVariant),
  outline: hex('neutralVariant', t.outline),
  outlineVariant: hex('neutralVariant', t.outlineVariant),

  inverseSurface: hex('neutral', t.inverseSurface),
  inverseOnSurface: hex('neutral', t.inverseOnSurface),
  inversePrimary: hex('primary', t.inverseAccent),

  scrim: hex('neutral', 0),
  shadow: hex('neutral', 0),
})

const light = scheme({
  accent: 38, onAccent: 100, accentContainer: 94, onAccentContainer: 24, containerChroma: CONTAINER_CHROMA.light,
  surface: 97, onSurface: 8, surfaceDim: 87, surfaceBright: 99,
  containerLowest: 100, containerLow: 99, container: 94, containerHigh: 92, containerHighest: 90,
  onSurfaceVariant: 34, outline: 52, outlineVariant: 91,
  inverseSurface: 18, inverseOnSurface: 96, inverseAccent: 80,
})

const dark = scheme({
  accent: 74, onAccent: 18, accentContainer: 20, onAccentContainer: 88, containerChroma: CONTAINER_CHROMA.dark,
  surface: 5, onSurface: 92, surfaceDim: 5, surfaceBright: 24,
  containerLowest: 3, containerLow: 10, container: 13, containerHigh: 17, containerHighest: 22,
  onSurfaceVariant: 74, outline: 58, outlineVariant: 26,
  inverseSurface: 91, inverseOnSurface: 18, inverseAccent: 38,
})

// ── kiểm tra tương phản ────────────────────────────────────────────────────
// Một bảng màu sai tương phản không báo lỗi lúc chạy, nó chỉ làm chữ mờ đi cho
// tới khi có người phàn nàn. Kiểm ngay ở đây thì không có bản nào lọt ra.
const luminance = (hexColor) => {
  const channel = (i) => {
    const value = parseInt(hexColor.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

const FAMILIES = ['primary', 'secondary', 'tertiary', 'warning', 'error']
const capitalise = (name) => `${name[0].toUpperCase()}${name.slice(1)}`

/** Cặp nền/chữ và ngưỡng: 4.5 cho chữ thường, 3.0 cho viền và biểu tượng. */
const pairs = (s) => [
  ...FAMILIES.flatMap((name) => [
    [`${name} / on${capitalise(name)}`, s[name], s[`on${capitalise(name)}`], 4.5],
    [`${name}Container / on…Container`, s[`${name}Container`], s[`on${capitalise(name)}Container`], 4.5],
  ]),
  ['surface / onSurface', s.surface, s.onSurface, 4.5],
  ['surface / onSurfaceVariant', s.surface, s.onSurfaceVariant, 4.5],
  ['surfaceContainerHighest / onSurface', s.surfaceContainerHighest, s.onSurface, 4.5],
  ['surface / outline', s.surface, s.outline, 3],
  // primary dùng làm màu chữ của đường dẫn và nhãn nhấn, nên phải đạt ngưỡng chữ.
  ['surface / primary', s.surface, s.primary, 4.5],
  ['surfaceContainerLowest / outlineVariant', s.surfaceContainerLowest, s.outlineVariant, 1.2],
  ['inverseSurface / inverseOnSurface', s.inverseSurface, s.inverseOnSurface, 4.5],
]

const failures = []
for (const [label, s] of [['sáng', light], ['tối', dark]]) {
  for (const [name, background, foreground, minimum] of pairs(s)) {
    const ratio = contrast(background, foreground)
    if (ratio < minimum) failures.push(`  ${label}: ${name} = ${ratio.toFixed(2)}:1 (cần ≥ ${minimum})`)
  }
}

if (failures.length > 0) {
  console.error('Bảng màu không đạt tương phản, không ghi file:')
  console.error(failures.join('\n'))
  process.exit(1)
}

// ── ghi file ───────────────────────────────────────────────────────────────
const entries = (obj) =>
  Object.entries(obj).map(([key, value]) => `  ${key}: '${value}',`).join('\n')

const sourceComment = Object.entries(SOURCES)
  .map(([name, value]) => ` *   ${name.padEnd(9)} ${value}`)
  .join('\n')

const output = `/**
 * SINH TỰ ĐỘNG — đừng sửa tay.
 *
 * Nguồn: scripts/generate-m3-palette.mjs
 * Sinh lại: pnpm gen:palette
 *
 * Màu nguồn của từng họ:
${sourceComment}
 * Sắc xám: hue của primary, chroma ${NEUTRAL_CHROMA} (mặt nền) và ${NEUTRAL_VARIANT_CHROMA} (viền, chữ phụ).
 * Nền phụ hạ độ tươi xuống ${CONTAINER_CHROMA.light} (sáng) / ${CONTAINER_CHROMA.dark} (tối).
 *
 * Tên vai trò lấy đúng theo hệ màu Material 3, nên một người quen làm Android
 * đọc là hiểu ngay: \`surfaceContainerHigh\` ở đây là \`surfaceContainerHigh\` ở kia.
 * Riêng họ \`warning\` là phần thêm: M3 không có vai trò cảnh báo, mà bộ luật
 * kiểm tra của công cụ này có ba mức — lỗi, cảnh báo, cần xác nhận — nên mức
 * giữa phải có màu riêng thay vì mượn tạm màu lỗi.
 *
 * Mọi cặp nền/chữ trong file này đã qua kiểm tra tương phản lúc sinh.
 */
export interface M3ColorScheme {
${Object.keys(light).map((key) => `  ${key}: string`).join('\n')}
}

export const m3Light: M3ColorScheme = {
${entries(light)}
}

export const m3Dark: M3ColorScheme = {
${entries(dark)}
}
`

const target = 'src/ui/theme/generatedPalette.ts'
writeFileSync(target, output)
console.log(`Đã ghi ${target} — ${Object.keys(light).length} vai trò, tương phản đạt.`)
for (const [label, s] of [['sáng', light], ['tối', dark]]) {
  console.log(
    `  ${label}: nền ${s.surface} · chữ ${s.onSurface} · nhấn ${s.primary} · viền ${s.outlineVariant}`,
  )
}
