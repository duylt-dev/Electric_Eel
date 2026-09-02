/**
 * Nội dung của tham số Remote Config `admob_id`: danh bạ ad unit.
 *
 * NGUỒN: LibAds/model/Ads.kt và AdsChild.kt.
 *
 * QUY TẮC: tên trường ở đây trùng tuyệt đối với tên trong JSON, kể cả khi tên
 * đó xấu (`package`, `id`). Không đổi tên khi đọc vào rồi đổi ngược khi ghi ra
 * — mỗi lần đổi tên là một chỗ có thể sai, mà Gson bỏ qua trường lạ trong im
 * lặng nên sai ở đây không có triệu chứng nào cả.
 *
 * Tên thuộc tính bên Kotlin khác tên JSON ở hai chỗ, ghi lại để đối chiếu:
 *   JSON `package`  → Kotlin `packageName`
 *   JSON `listAds`  → Kotlin `listAdsChild`
 *   JSON `id`       → Kotlin `adsId`
 */
export interface AdUnit {
  /** Khớp với `configName` của một vị trí trong config_show_ads theo tiền tố dài nhất. */
  spaceName: string
  adsType: string
  /** Mã ad unit của AdMob. Giá trị "test" là quy ước cho vị trí demo. */
  id: string
  network?: string
  placementId?: string
  priority?: number
  /** Số bản quảng cáo nạp sẵn. Mặc định 1 trong SDK. */
  buffer?: number
}

export interface AdmobIdDocument {
  network: string
  appId: string
  package: string
  listAds: AdUnit[]
  priority?: number
}

export const emptyAdmobIdDocument = (): AdmobIdDocument => ({
  network: 'google',
  appId: '',
  package: '',
  listAds: [],
})

/**
 * Khớp một `spaceName` với `configName` theo TIỀN TỐ DÀI NHẤT.
 *
 * Phải là dài nhất, không phải khớp đầu tiên: `demo_native` là tiền tố của
 * `demo_native_full_screen`, nên khớp ngắn nhất sẽ gán ad unit của
 * `demo_native_full_screen` cho vị trí `demo_native` rồi báo sai kiểu.
 */
export function matchConfigName(
  spaceName: string,
  configNames: readonly string[],
): { configName: string; suffix: string } | null {
  let best: string | null = null
  for (const name of configNames) {
    if (spaceName !== name && !spaceName.startsWith(`${name}_`)) continue
    if (best === null || name.length > best.length) best = name
  }
  if (best === null) return null
  return { configName: best, suffix: spaceName.slice(best.length + 1) }
}

/** ID quảng cáo thử của Google. Để nguyên khi phát hành = quảng cáo hiện mà không ra tiền. */
export const GOOGLE_TEST_AD_UNIT_IDS: ReadonlySet<string> = new Set([
  'ca-app-pub-3940256099942544/1033173712', // interstitial
  'ca-app-pub-3940256099942544/1044960115', // interstitial video
  'ca-app-pub-3940256099942544/2247696110', // native advanced
  'ca-app-pub-3940256099942544/1044960115',
  'ca-app-pub-3940256099942544/3419835294', // app open
  'ca-app-pub-3940256099942544/5224354917', // rewarded
  'ca-app-pub-3940256099942544/5354046379', // rewarded interstitial
  'ca-app-pub-3940256099942544/6300978111', // banner
  'ca-app-pub-3940256099942544/9214589741', // adaptive banner
  'ca-app-pub-3940256099942544/2014213617', // native video
  'ca-app-pub-3940256099942544/8407707713',
  'ca-app-pub-3940256099942544/2521693316',
])

export const TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713'

/** Quy ước nội bộ: vị trí demo dùng `id: "test"`, không phải mã thật. */
export const DEMO_AD_UNIT_ID = 'test'

/** `ca-app-pub-<16 số>/<10 số>` — dạng chuẩn của mã ad unit. */
export const AD_UNIT_ID_PATTERN = /^ca-app-pub-\d{16}\/\d{10}$/
/** `ca-app-pub-<16 số>~<10 số>` — dạng chuẩn của App ID (dấu ngã, không phải gạch chéo). */
export const APP_ID_PATTERN = /^ca-app-pub-\d{16}~\d{10}$/

export const publisherIdOf = (adUnitOrAppId: string): string | null => {
  const match = /^ca-app-pub-(\d{16})[/~]\d{10}$/.exec(adUnitOrAppId)
  return match?.[1] ?? null
}
