import {
  AD_UNIT_ID_PATTERN,
  APP_ID_PATTERN,
  DEMO_AD_UNIT_ID,
  GOOGLE_TEST_AD_UNIT_IDS,
  TEST_APP_ID,
  publisherIdOf,
} from '../../entities/AdmobIdDocument'
import { isAdNetwork, isAdType } from '../../entities/AdType'
import { isDemoPlacement } from '../../entities/ShowAdsDocument'
import type { Finding } from '../Finding'
import type { ValidationRule } from '../ValidationRule'

const adUnitPath = (spaceName: string, field?: string): Finding['path'] =>
  field === undefined ? { scope: 'adUnit', spaceName } : { scope: 'adUnit', spaceName, field }

/** Mã ad unit sai dạng thì AdMob từ chối yêu cầu — vị trí đó không có quảng cáo. */
export const adUnitIdMalformed: ValidationRule = {
  code: 'AD_ID_MALFORMED',
  title: 'Mã ad unit sai định dạng',
  run: ({ adUnits }) =>
    adUnits
      .filter((unit) => unit.id !== DEMO_AD_UNIT_ID && !AD_UNIT_ID_PATTERN.test(unit.id))
      .map((unit) => ({
        code: 'AD_ID_MALFORMED',
        severity: 'error' as const,
        message:
          unit.id.trim() === ''
            ? `"${unit.spaceName}" không có mã ad unit. Vị trí này sẽ không bao giờ hiện quảng cáo.`
            : `Mã "${unit.id}" của "${unit.spaceName}" không đúng dạng ca-app-pub-<16 số>/<10 số>.`,
        path: adUnitPath(unit.spaceName, 'id'),
        fix: 'Chép lại mã từ AdMob console. Chú ý ký tự thừa khi copy thủ công.',
      })),
}

/** ID test của Google vẫn hiện quảng cáo bình thường — nên không ai phát hiện, và không ra tiền. */
export const adUnitUsesTestId: ValidationRule = {
  code: 'AD_ID_TEST',
  title: 'Còn dùng ID quảng cáo thử',
  run: ({ adUnits }) =>
    adUnits
      .filter((unit) => !isDemoPlacement(unit.spaceName) && GOOGLE_TEST_AD_UNIT_IDS.has(unit.id))
      .map((unit) => ({
        code: 'AD_ID_TEST',
        severity: 'error' as const,
        message: `"${unit.spaceName}" đang dùng ID quảng cáo thử của Google. Quảng cáo vẫn hiện nhưng không sinh doanh thu.`,
        path: adUnitPath(unit.spaceName, 'id'),
        fix: 'Thay bằng mã ad unit thật của app này.',
      })),
}

export const adUnitTypeUnknown: ValidationRule = {
  code: 'AD_TYPE_UNKNOWN',
  title: 'Kiểu quảng cáo SDK không hiểu',
  run: ({ adUnits }) =>
    adUnits
      .filter((unit) => !isAdType(unit.adsType))
      .map((unit) => ({
        code: 'AD_TYPE_UNKNOWN',
        severity: 'error' as const,
        message: `"${unit.spaceName}" khai adsType = "${unit.adsType}", không có trong AdDef.ADS_TYPE_ADMOB. SDK bỏ qua ad unit này.`,
        path: adUnitPath(unit.spaceName, 'adsType'),
        fix: 'Chọn lại kiểu trong danh sách. Lưu ý "native_interstitial" trông hợp lệ nhưng không tồn tại.',
      })),
}

export const adUnitNetworkUnknown: ValidationRule = {
  code: 'AD_NETWORK_UNKNOWN',
  title: 'Mạng quảng cáo SDK không hiểu',
  run: ({ adUnits }) =>
    adUnits
      .filter((unit) => unit.network !== undefined && !isAdNetwork(unit.network))
      .map((unit) => ({
        code: 'AD_NETWORK_UNKNOWN',
        severity: 'error' as const,
        message: `"${unit.spaceName}" khai network = "${unit.network ?? ''}". SDK chỉ nhận google, pangle, mintegral.`,
        path: adUnitPath(unit.spaceName, 'network'),
      })),
}

export const duplicateSpaceName: ValidationRule = {
  code: 'AD_SPACE_DUPLICATE',
  title: 'Trùng spaceName',
  run: ({ adUnits }) => {
    const seen = new Map<string, number>()
    for (const unit of adUnits) seen.set(unit.spaceName, (seen.get(unit.spaceName) ?? 0) + 1)

    return [...seen.entries()]
      .filter(([, count]) => count > 1)
      .map(([spaceName, count]) => ({
        code: 'AD_SPACE_DUPLICATE',
        severity: 'error' as const,
        message: `spaceName "${spaceName}" xuất hiện ${count} lần. SDK dùng bản đầu tiên, các bản sau không bao giờ chạy.`,
        path: adUnitPath(spaceName, 'spaceName'),
        fix: 'Xoá bản thừa, hoặc đổi tên nếu đúng là hai vị trí khác nhau.',
      }))
  },
}

/** Ad unit của publisher khác thì AdMob trả về "no fill" vĩnh viễn. */
export const publisherMismatch: ValidationRule = {
  code: 'AD_PUBLISHER_MISMATCH',
  title: 'Ad unit khác tài khoản publisher',
  run: ({ admob, adUnits }) => {
    if (admob === null) return []
    const appPublisher = publisherIdOf(admob.appId)
    if (appPublisher === null) return []

    return adUnits
      .filter((unit) => unit.id !== DEMO_AD_UNIT_ID)
      .filter((unit) => {
        const publisher = publisherIdOf(unit.id)
        return publisher !== null && publisher !== appPublisher
      })
      .map((unit) => ({
        code: 'AD_PUBLISHER_MISMATCH',
        severity: 'error' as const,
        message: `"${unit.spaceName}" thuộc publisher ${publisherIdOf(unit.id) ?? '?'}, còn appId thuộc ${appPublisher}. AdMob sẽ không trả quảng cáo.`,
        path: adUnitPath(unit.spaceName, 'id'),
        fix: 'Kiểm tra xem mã có bị chép nhầm từ project khác không.',
      }))
  },
}

export const appIdMalformed: ValidationRule = {
  code: 'ADMOB_APP_ID_INVALID',
  title: 'App ID sai định dạng',
  run: ({ admob }) => {
    if (admob === null) return []
    const findings: Finding[] = []

    if (!APP_ID_PATTERN.test(admob.appId)) {
      findings.push({
        code: 'ADMOB_APP_ID_INVALID',
        severity: 'error',
        message: `appId "${admob.appId}" không đúng dạng ca-app-pub-<16 số>~<10 số>. Chú ý dấu ngã, không phải gạch chéo.`,
        path: { scope: 'admobRoot', field: 'appId' },
      })
    } else if (admob.appId === TEST_APP_ID) {
      findings.push({
        code: 'ADMOB_APP_ID_INVALID',
        severity: 'error',
        message: 'appId đang là App ID thử của Google. Bản phát hành sẽ không sinh doanh thu.',
        path: { scope: 'admobRoot', field: 'appId' },
      })
    }
    return findings
  },
}

export const adUnitRules: readonly ValidationRule[] = [
  adUnitIdMalformed,
  adUnitUsesTestId,
  adUnitTypeUnknown,
  adUnitNetworkUnknown,
  duplicateSpaceName,
  publisherMismatch,
  appIdMalformed,
]
