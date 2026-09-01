#!/usr/bin/env node
'use strict';

/**
 * Kiểm tra cặp template Remote Config: admob_id + config_show_ads.
 *
 * Không phụ thuộc package nào — chạy thẳng bằng Node, không cần cài gì:
 *
 *   node tools/validate-config.cjs                     # đọc ./docs
 *   node tools/validate-config.cjs path/to/dir         # đọc thư mục khác
 *   node tools/validate-config.cjs --ads=a.json --config=b.json
 *   node tools/validate-config.cjs --json              # kết quả dạng JSON cho CI
 *   node tools/validate-config.cjs --strict            # coi cảnh báo là lỗi
 *   node tools/validate-config.cjs --quiet             # chỉ in phần LỖI
 *   node tools/validate-config.cjs --include-disabled  # xét cả vị trí đang tắt
 *
 * Mã thoát: 0 = không có lỗi, 1 = có lỗi, 2 = không đọc được file.
 *
 * BA MỨC, cố ý tách riêng vì hậu quả khác nhau:
 *
 *   ERROR  Chắc chắn sai. Publish lên là hỏng. Chặn.
 *   WARN   Gần như chắc là sai, nhưng có thể cố ý. Người đọc quyết.
 *   CHECK  Chỉ kết luận được sau khi chốt quy ước. Không phải lỗi.
 *
 * QUY ƯỚC TÊN (đo từ template co.lovetest, 75 ad unit, 0 vi phạm):
 *
 *   spaceName = configName + "_" + <hậu tố loại>
 *
 * Ghép tên phải dùng LONGEST-PREFIX MATCH — chọn configName dài nhất khớp được.
 * Ghép theo prefix ngắn nhất sẽ khiến "demo_native" nuốt "demo_native_full_screen"
 * và sinh ra hàng loạt báo động giả.
 *
 * BA ĐIỀU KHÔNG PHẢI LỖI, đã kiểm chứng trên data thật — đừng báo lại:
 *
 *   1. Một configName có nhiều ad unit khác loại là CỐ Ý.
 *      Config `native` kèm unit `_adaptive` = banner dự phòng.
 *   2. Config `interstitial` mang field native là HỢP LỆ khi isShowNativeAfterInter
 *      bật — đó là cấu hình cho native hiện sau khi đóng interstitial.
 *   3. `id: "test"` là quy ước đánh dấu slot demo, không phải ID sai định dạng.
 */

const fs = require('fs');
const path = require('path');

/* ────────────────────────── CLI ────────────────────────── */

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  const doc = fs.readFileSync(__filename, 'utf8');
  console.log(doc.slice(doc.indexOf('/**') + 3, doc.indexOf('*/')).replace(/^ \* ?/gm, '').trim());
  process.exit(0);
}

const flag = (name) => argv.some((a) => a === `--${name}`);
const value = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const asJson = flag('json');
const strict = flag('strict');
const quiet = flag('quiet');
const includeDisabled = flag('include-disabled');
const dir = argv.find((a) => !a.startsWith('-')) || './docs';

const adsPath = value('ads') || path.join(dir, 'admob_id-template.json');
const cfgPath = value('config') || path.join(dir, 'config_show_ads-template.json');

/* ────────────────────────── hằng số ────────────────────────── */

const GOOGLE_TEST_PUB = '3940256099942544';
const UNIT_RE = /^ca-app-pub-(\d{16})\/(\d{10})$/;
const APPID_RE = /^ca-app-pub-(\d{16})~(\d{10})$/;
const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RATIO_RE = /^\d+:\d+$/;

/** Giá trị ID cố ý để trống chỗ, không phải ID hỏng. */
const PLACEHOLDER_IDS = new Set(['test', 'TEST', 'demo', 'DEMO', '']);

/**
 * Slot trưng bày trong app demo của SDK. Chúng cố ý dùng ID giữ chỗ và không bao giờ
 * chạy production, nên mọi kiểm tra về doanh thu phải bỏ qua chúng — báo lỗi ở đây là
 * báo động giả, và một tool hay báo động giả sẽ bị phớt lờ cả khi nó báo đúng.
 */
const isDemoSlot = (name) => /^demo(_|$)/i.test(String(name || ''));

const AD_TYPES = new Set([
  'native', 'native_full_screen', 'native_interstitial', 'interstitial',
  'banner', 'banner_adaptive', 'banner_large', 'banner_inline',
  'banner_collapsible', 'reward_video', 'reward_interstitial', 'open_app',
]);

const NATIVE_TYPES = new Set(['native', 'native_full_screen', 'native_interstitial']);

/** Field chỉ có nghĩa với native — hoặc với interstitial bật native-after-inter. */
const NATIVE_FIELDS = [
  'ctaGradientListColor', 'textCTAColor', 'ctaRatio', 'ctaConnerRadius',
  'layoutTemplate', 'backGroundColor', 'textContentColor', 'isPreloadAfterShow',
  'isCloseWhenClick', 'isCloseWhenClickNativeCollapsible', 'ctaAnimationSpeed',
  'nativeStrokeWidth', 'nativeStrokeColor',
];
const INTER_FIELDS = ['timeDelayShowInter', 'isShowNativeAfterInter'];

const TEMPLATE_GROUPS = [
  'listTemplateSmall', 'listTemplateMedium', 'listTemplateLarge',
  'listTemplateCollapsible', 'listTemplateNativeFull',
];

/** Hậu tố spaceName đã gặp trên data thật. Lạ hơn thì hỏi, không phải chặn. */
const KNOWN_SUFFIXES = new Set([
  'native', 'native1', 'native2', 'native3',
  'adaptive', 'banner', 'collapsible', 'inline', 'large',
  'reward', 'rewarded', 'reward1', 'reward2',
  'inter', 'inter1', 'inter2', 'interstitial',
  'openad', 'openad1', 'openad2', 'openad3',
]);

/** Màu nguyên chất — gần như luôn là giá trị debug còn sót. */
const DEBUG_COLORS = new Set(['#FF0000', '#00FF00', '#0000FF', '#FF00FF', '#00FFFF', '#FFFF00']);

/* ────────────────────────── thu thập ────────────────────────── */

const findings = [];
const report = (level, code, message, where) => findings.push({ level, code, message, where });
const ERROR = (c, m, w) => report('ERROR', c, m, w);
const WARN = (c, m, w) => report('WARN', c, m, w);
const CHECK = (c, m, w) => report('CHECK', c, m, w);

const read = (p, label) => {
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    console.error(`Không đọc được ${label}: ${p}\n  ${e.message}`);
    process.exit(2);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`${label} không phải JSON hợp lệ: ${p}\n  ${e.message}`);
    process.exit(2);
  }
};

const ads = read(adsPath, 'admob_id');
const cfg = read(cfgPath, 'config_show_ads');

const listAds = Array.isArray(ads.listAds) ? ads.listAds : [];
const listConfig = Array.isArray(cfg.listConfig) ? cfg.listConfig : [];

/* ────────────────────────── admob_id ────────────────────────── */

for (const key of ['network', 'appId', 'package', 'listAds']) {
  if (!(key in ads)) ERROR('ADS_MISSING_KEY', `admob_id thiếu key bắt buộc "${key}"`, 'admob_id');
}
if (!Array.isArray(ads.listAds)) ERROR('ADS_LIST_TYPE', 'admob_id.listAds phải là mảng', 'admob_id');
if (ads.appId && !APPID_RE.test(ads.appId)) {
  ERROR('APPID_FORMAT', `appId sai định dạng: "${ads.appId}" — phải là ca-app-pub-<16 số>~<10 số>`, 'admob_id');
}

const publisher = (String(ads.appId || '').match(/ca-app-pub-(\d+)/) || [])[1] || null;
const spaceCount = new Map();

for (const unit of listAds) {
  const name = unit.spaceName;
  if (!name) {
    ERROR('SPACE_EMPTY', `Ad unit thiếu spaceName: ${JSON.stringify(unit).slice(0, 80)}`, 'admob_id');
    continue;
  }
  spaceCount.set(name, (spaceCount.get(name) || 0) + 1);

  if (!unit.adsType) ERROR('ADSTYPE_EMPTY', `"${name}" thiếu adsType`, name);
  else if (!AD_TYPES.has(unit.adsType)) ERROR('ADSTYPE_UNKNOWN', `"${name}" có adsType lạ: "${unit.adsType}"`, name);

  const id = unit.id;
  if (id == null || id === '') {
    ERROR('ID_EMPTY', `"${name}" có ad ID rỗng`, name);
  } else if (PLACEHOLDER_IDS.has(id)) {
    // Trong slot demo thì đây là đúng thiết kế. Ngoài slot demo là một ID chưa ai điền.
    if (!isDemoSlot(name)) {
      WARN('ID_PLACEHOLDER', `"${name}" (${unit.adsType}) vẫn để ID giữ chỗ "${id}" — chưa gắn ad unit thật`, name);
    }
  } else if (!UNIT_RE.test(id)) {
    ERROR('ID_FORMAT', `"${name}" ad ID sai định dạng: "${id}"`, name);
  } else {
    const idPub = id.match(UNIT_RE)[1];
    if (idPub === GOOGLE_TEST_PUB) {
      WARN('ID_TEST_GOOGLE', `"${name}" (${unit.adsType}) dùng ad ID TEST của Google — quảng cáo hiện nhưng không sinh doanh thu`, name);
    } else if (publisher && idPub !== publisher) {
      ERROR('ID_PUBLISHER', `"${name}" ad ID thuộc publisher ${idPub}, app này là ${publisher}`, name);
    }
  }

  if ('buffer' in unit && (!Number.isInteger(unit.buffer) || unit.buffer < 1)) {
    WARN('BUFFER_ODD', `"${name}" có buffer = ${unit.buffer} — nên là số nguyên >= 1`, name);
  }
}

for (const [name, n] of spaceCount) {
  if (n > 1) ERROR('SPACE_DUP', `spaceName "${name}" xuất hiện ${n} lần`, name);
}

const idOwners = new Map();
for (const unit of listAds) {
  const id = unit.id;
  if (!id || !UNIT_RE.test(id) || id.includes(GOOGLE_TEST_PUB)) continue;
  if (!idOwners.has(id)) idOwners.set(id, []);
  idOwners.get(id).push(unit.spaceName);
}
for (const [id, owners] of idOwners) {
  if (owners.length > 1) CHECK('ID_REUSED', `Ad ID ${id} dùng chung ở ${owners.length} slot: ${owners.join(', ')}`, owners[0]);
}

/* ────────────────────────── template ────────────────────────── */

const templateGroupsOf = new Map();
for (const group of TEMPLATE_GROUPS) {
  if (!Array.isArray(cfg[group])) {
    ERROR('TPL_GROUP_MISSING', `config_show_ads thiếu nhóm template "${group}"`, 'config_show_ads');
    continue;
  }
  for (const tpl of cfg[group]) {
    if (!templateGroupsOf.has(tpl)) templateGroupsOf.set(tpl, []);
    templateGroupsOf.get(tpl).push(group);
  }
}
for (const [tpl, groups] of templateGroupsOf) {
  if (groups.length > 1) {
    WARN('TPL_DUP_GROUP', `Template "${tpl}" khai báo ở ${groups.length} nhóm: ${groups.join(' + ')}`, tpl);
  }
}
const knownTemplates = new Set(templateGroupsOf.keys());

/* ────────────────────────── config_show_ads ────────────────────────── */

const configCount = new Map();
let dashNames = 0;
let underscoreNames = 0;

for (const conf of listConfig) {
  const name = conf.configName;
  if (!name) {
    ERROR('CFG_EMPTY', `Config thiếu configName: ${JSON.stringify(conf).slice(0, 80)}`, 'config_show_ads');
    continue;
  }
  configCount.set(name, (configCount.get(name) || 0) + 1);

  if (name.includes('-')) dashNames++;
  else if (name.includes('_')) underscoreNames++;

  if (!/^[A-Za-z0-9_.\-]+$/.test(name)) {
    ERROR('CFG_NAME_CHARS', `configName "${name}" chứa ký tự không dùng được — chỉ nên có chữ, số, _ . và -`, name);
  }
  if (typeof conf.isOn !== 'boolean') {
    ERROR('CFG_ISON', `"${name}" thiếu isOn, hoặc isOn không phải true/false`, name);
  }
  if (!conf.type) {
    ERROR('CFG_TYPE', `"${name}" thiếu type`, name);
    continue;
  }
  if (!AD_TYPES.has(conf.type)) {
    ERROR('CFG_TYPE_UNKNOWN', `"${name}" có type lạ: "${conf.type}"`, name);
    continue;
  }

  const isNative = NATIVE_TYPES.has(conf.type);
  const isInter = conf.type === 'interstitial';
  const showsNativeAfterInter = isInter && conf.isShowNativeAfterInter === true;
  // Native-after-inter cần đúng bộ field như một native thật.
  const nativeFieldsAllowed = isNative || showsNativeAfterInter;
  const presentNativeFields = NATIVE_FIELDS.filter((f) => f in conf);

  if (!nativeFieldsAllowed && presentNativeFields.length) {
    if (isInter) {
      WARN('CFG_NATIVE_UNUSED', `"${name}" (interstitial, isShowNativeAfterInter không bật) mang ${presentNativeFields.length} field native không ai đọc: ${presentNativeFields.join(', ')}`, name);
    } else {
      CHECK('CFG_NATIVE_ORPHAN', `"${name}" (${conf.type}) mang ${presentNativeFields.length} field native — xác nhận SDK có đọc chúng cho loại này không`, name);
    }
  }
  if (!isInter) {
    const strays = INTER_FIELDS.filter((f) => f in conf);
    if (strays.length) WARN('CFG_INTER_FIELDS', `"${name}" (${conf.type}) mang field chỉ dành cho interstitial: ${strays.join(', ')}`, name);
  }

  if (nativeFieldsAllowed) {
    if (!conf.layoutTemplate) {
      if (isNative) {
        ERROR('CFG_NO_TPL', `"${name}" (${conf.type}) thiếu layoutTemplate`, name);
      } else if (conf.isOn === true || includeDisabled) {
        // Chỉ đáng nói khi vị trí đang chạy; một vị trí đã tắt thì cấu hình thiếu
        // không ảnh hưởng ai, và báo hết sẽ chôn vùi những mục thật sự cần sửa.
        WARN('CFG_AFTERINTER_INCOMPLETE', `"${name}" bật isShowNativeAfterInter nhưng thiếu layoutTemplate — native sẽ hiện với giao diện mặc định`, name);
      }
    } else if (!knownTemplates.has(conf.layoutTemplate)) {
      ERROR('CFG_TPL_UNKNOWN', `"${name}" dùng layoutTemplate "${conf.layoutTemplate}" không có trong 5 nhóm khai báo`, name);
    }

    for (const field of ['textCTAColor', 'backGroundColor', 'textContentColor', 'nativeStrokeColor']) {
      if (field in conf && !HEX_RE.test(String(conf[field]))) {
        ERROR('CFG_COLOR', `"${name}" field ${field} không phải mã màu hex hợp lệ: "${conf[field]}"`, name);
      }
    }
    if ('ctaGradientListColor' in conf) {
      const grad = conf.ctaGradientListColor;
      if (!Array.isArray(grad) || grad.length < 2) {
        ERROR('CFG_GRADIENT', `"${name}" ctaGradientListColor phải là mảng ít nhất 2 màu`, name);
      } else {
        for (const c of grad) {
          if (!HEX_RE.test(String(c))) ERROR('CFG_COLOR', `"${name}" gradient chứa màu không hợp lệ: "${c}"`, name);
          else if (DEBUG_COLORS.has(String(c).toUpperCase())) {
            WARN('CFG_COLOR_DEBUG', `"${name}" gradient dùng màu nguyên chất ${c} — nhiều khả năng là giá trị debug còn sót`, name);
          }
        }
      }
    }
    if ('ctaRatio' in conf && !RATIO_RE.test(String(conf.ctaRatio))) {
      ERROR('CFG_RATIO', `"${name}" ctaRatio sai định dạng: "${conf.ctaRatio}" — phải dạng 340:42`, name);
    }
    if ('ctaConnerRadius' in conf && (typeof conf.ctaConnerRadius !== 'number' || conf.ctaConnerRadius < 0)) {
      ERROR('CFG_RADIUS', `"${name}" ctaConnerRadius không hợp lệ: ${conf.ctaConnerRadius}`, name);
    }
    if ('nativeStrokeWidth' in conf && (typeof conf.nativeStrokeWidth !== 'number' || conf.nativeStrokeWidth < 0)) {
      ERROR('CFG_STROKE', `"${name}" nativeStrokeWidth không hợp lệ: ${conf.nativeStrokeWidth}`, name);
    }
  }

  if (isInter && 'timeDelayShowInter' in conf) {
    if (typeof conf.timeDelayShowInter !== 'number' || conf.timeDelayShowInter < 0) {
      ERROR('CFG_DELAY', `"${name}" timeDelayShowInter không hợp lệ: ${conf.timeDelayShowInter}`, name);
    }
  }
}

for (const [name, n] of configCount) {
  if (n > 1) ERROR('CFG_DUP', `configName "${name}" xuất hiện ${n} lần`, name);
}
if (dashNames && underscoreNames) {
  WARN('NAME_STYLE_MIXED', `Trộn hai kiểu đặt tên trong cùng một file: ${dashNames} tên dùng dấu "-", ${underscoreNames} tên dùng dấu "_"`, 'config_show_ads');
}

const usedTemplates = new Set(listConfig.map((c) => c.layoutTemplate).filter(Boolean));
const unusedTemplates = [...knownTemplates].filter((t) => !usedTemplates.has(t));
if (unusedTemplates.length) {
  CHECK('TPL_UNUSED', `${unusedTemplates.length}/${knownTemplates.size} template khai báo nhưng không config nào dùng`, 'config_show_ads');
}

/* ────────────────── nối hai file (longest-prefix match) ────────────────── */

const configNames = [...configCount.keys()].sort((a, b) => b.length - a.length);
const lowerIndex = new Map(configNames.map((n) => [n.toLowerCase(), n]));
const lowerNames = [...lowerIndex.keys()].sort((a, b) => b.length - a.length);

/** Trả về { name, suffix, viaCase } hoặc null. */
const matchConfig = (spaceName) => {
  const exact = configNames.find((n) => spaceName === n || spaceName.startsWith(n + '_'));
  if (exact) return { name: exact, suffix: spaceName.slice(exact.length + 1), viaCase: false };
  const lower = spaceName.toLowerCase();
  const loose = lowerNames.find((n) => lower === n || lower.startsWith(n + '_'));
  if (loose) return { name: lowerIndex.get(loose), suffix: spaceName.slice(loose.length + 1), viaCase: true };
  return null;
};

const configOf = new Map(listConfig.map((c) => [c.configName, c]));
const adsByConfig = new Map();
const unmatchedAds = [];

for (const unit of listAds) {
  if (!unit.spaceName) continue;
  const hit = matchConfig(unit.spaceName);
  if (!hit) { unmatchedAds.push(unit.spaceName); continue; }

  if (hit.viaCase) {
    // Chỉ khớp khi bỏ qua hoa/thường, nên không thể coi là đã nối: nếu SDK so tên phân
    // biệt hoa thường thì cặp này đứt. Đẩy sang nhóm chưa nối để các luật bên dưới
    // (config bật mà không có ad) nhìn thấy đúng tình trạng xấu nhất.
    WARN('NAME_CASE_MISMATCH',
      `"${unit.spaceName}" chỉ khớp config "${hit.name}" khi bỏ qua hoa/thường — thống nhất cách viết hoa để chắc chắn hai bên nối được`,
      unit.spaceName);
    unmatchedAds.push(unit.spaceName);
    continue;
  }
  if (hit.suffix && !KNOWN_SUFFIXES.has(hit.suffix)) {
    CHECK('NAME_SUFFIX_UNKNOWN', `"${unit.spaceName}" có hậu tố lạ "${hit.suffix}" — quy ước hiện dùng: ${[...KNOWN_SUFFIXES].slice(0, 6).join(', ')}…`, unit.spaceName);
  }

  if (!adsByConfig.has(hit.name)) adsByConfig.set(hit.name, []);
  adsByConfig.get(hit.name).push(unit);
}

if (unmatchedAds.length) {
  CHECK('XREF_AD_ORPHAN', `${unmatchedAds.length} spaceName không nối được với configName nào: ${unmatchedAds.join(', ')}`, 'admob_id');
}
const unmatchedConfigs = [...configCount.keys()].filter((n) => !adsByConfig.has(n));
if (unmatchedConfigs.length) {
  CHECK('XREF_CFG_ORPHAN', `${unmatchedConfigs.length} configName không có ad unit nào: ${unmatchedConfigs.join(', ')}`, 'config_show_ads');
}

const isUsableId = (unit) =>
  unit.id && !PLACEHOLDER_IDS.has(unit.id) && UNIT_RE.test(unit.id) && !unit.id.includes(GOOGLE_TEST_PUB);

for (const conf of listConfig) {
  if (conf.isOn !== true) continue;
  const units = adsByConfig.get(conf.configName) || [];

  if (!units.length) {
    ERROR('CFG_ON_NO_AD', `"${conf.configName}" (${conf.type}) đang BẬT nhưng không có ad unit nào — không thể hiện quảng cáo`, conf.configName);
    continue;
  }
  if (!units.some(isUsableId) && !isDemoSlot(conf.configName)) {
    ERROR('CFG_ON_NO_USABLE_ID',
      `"${conf.configName}" (${conf.type}) đang BẬT nhưng mọi ad ID nối tới đều là giữ chỗ hoặc ID test: ${units.map((u) => `${u.spaceName}="${u.id}"`).join(', ')}`,
      conf.configName);
  }
  // Bật native-after-inter mà không có unit native đi kèm thì cờ đó vô nghĩa.
  if (conf.type === 'interstitial' && conf.isShowNativeAfterInter === true) {
    if (!units.some((u) => NATIVE_TYPES.has(u.adsType))) {
      WARN('CFG_AFTERINTER_NO_AD', `"${conf.configName}" bật isShowNativeAfterInter nhưng không có ad unit native nào đi kèm`, conf.configName);
    }
  }
}

// Ad unit lẻ loại khác config: cố ý (banner dự phòng, native sau inter) — chỉ báo khi
// không giải thích được bằng hai mẫu đó.
for (const [name, units] of adsByConfig) {
  const conf = configOf.get(name);
  if (!conf || !conf.type) continue;
  for (const unit of units) {
    if (!unit.adsType || unit.adsType === conf.type) continue;
    const isFallbackBanner = NATIVE_TYPES.has(conf.type) && String(unit.adsType).startsWith('banner');
    const interWantsNative = conf.type === 'interstitial' && NATIVE_TYPES.has(unit.adsType);
    if (isFallbackBanner) continue;
    if (interWantsNative) {
      // Có sẵn ad unit native cho vị trí này nhưng cờ bật nó lại tắt — ad unit đã mua
      // mà không bao giờ được gọi. Khác hẳn "thiếu cấu hình", nên tách riêng.
      if (conf.isShowNativeAfterInter !== true) {
        WARN('CFG_AFTERINTER_OFF',
          `"${name}" có ad unit native "${unit.spaceName}" nhưng isShowNativeAfterInter đang tắt — unit này không bao giờ được gọi`,
          unit.spaceName);
      }
      continue;
    }
    CHECK('XREF_TYPE', `"${unit.spaceName}" (${unit.adsType}) nối với config "${name}" (${conf.type}) — hai loại khác nhau, không khớp mẫu dự phòng nào đã biết`, unit.spaceName);
  }
}

/* ────────────────────────── kết quả ────────────────────────── */

const counts = {
  ERROR: findings.filter((f) => f.level === 'ERROR').length,
  WARN: findings.filter((f) => f.level === 'WARN').length,
  CHECK: findings.filter((f) => f.level === 'CHECK').length,
};
const failed = counts.ERROR > 0 || (strict && counts.WARN > 0);

if (asJson) {
  console.log(JSON.stringify({
    ok: !failed,
    files: { ads: adsPath, config: cfgPath },
    summary: {
      adUnits: listAds.length,
      configs: listConfig.length,
      templates: knownTemplates.size,
      templatesUsed: usedTemplates.size,
      package: ads.package || null,
      publisher,
      ...counts,
    },
    findings,
  }, null, 2));
  process.exit(failed ? 1 : 0);
}

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c(1, s);
const dim = (s) => c(2, s);

const LEVELS = {
  ERROR: { title: c(31, 'LỖI'), hint: 'chắc chắn sai, không nên publish' },
  WARN: { title: c(33, 'CẢNH BÁO'), hint: 'gần như chắc là sai, cần người xem' },
  CHECK: { title: c(36, 'CẦN XÁC NHẬN'), hint: 'chỉ kết luận được sau khi chốt quy ước' },
};

console.log('');
console.log(`${bold('admob_id')}    ${listAds.length} ad unit   ${dim('·')}  app ${ads.package || '?'}  ${dim('·')}  publisher ${publisher || '?'}`);
console.log(`${bold('config')}      ${listConfig.length} config    ${dim('·')}  ${knownTemplates.size} template, ${usedTemplates.size} đang dùng`);
console.log('');

for (const level of ['ERROR', 'WARN', 'CHECK']) {
  if (quiet && level !== 'ERROR') continue;
  const items = findings.filter((f) => f.level === level);
  console.log(`${bold(LEVELS[level].title)}  ${items.length}  ${dim(LEVELS[level].hint)}`);
  if (!items.length) {
    console.log(`  ${c(32, '✓')} ${dim('không có')}\n`);
    continue;
  }
  const byCode = items.reduce((acc, f) => ((acc[f.code] = acc[f.code] || []).push(f), acc), {});
  for (const [code, group] of Object.entries(byCode)) {
    console.log(`  ${dim(code)} ${dim(`(${group.length})`)}`);
    for (const f of group.slice(0, 12)) console.log(`    · ${f.message}`);
    if (group.length > 12) console.log(`    ${dim(`… và ${group.length - 12} mục nữa`)}`);
  }
  console.log('');
}

const verdict = counts.ERROR
  ? c(31, `${counts.ERROR} lỗi cần sửa trước khi publish`)
  : strict && counts.WARN
    ? c(33, `${counts.WARN} cảnh báo (đang bật --strict)`)
    : c(32, 'Không có lỗi chặn publish');
console.log(`${bold('Kết luận:')} ${verdict}   ${dim(`${counts.ERROR} lỗi · ${counts.WARN} cảnh báo · ${counts.CHECK} cần xác nhận`)}`);
console.log('');

process.exit(failed ? 1 : 0);
