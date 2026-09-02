import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  parseAdmobIdDocument,
  parseShowAdsDocument,
  serializeAdmobIdDocument,
  serializeShowAdsDocument,
} from '../AdsDocumentCodec'
import { validateAdsDocuments } from './validateAdsDocuments'

const readTemplate = (name: string) => readFileSync(join(process.cwd(), 'docs', name), 'utf8').trim()

const admobRaw = readTemplate('admob_id-template.json')
const showAdsRaw = readTemplate('config_show_ads-template.json')

describe('AdsDocumentCodec', () => {
  it('đọc rồi ghi lại không làm đổi một byte nào', () => {
    const admob = parseAdmobIdDocument(admobRaw)
    const showAds = parseShowAdsDocument(showAdsRaw)
    assert.ok(admob.ok, 'admob_id phải đọc được')
    assert.ok(showAds.ok, 'config_show_ads phải đọc được')

    assert.equal(serializeAdmobIdDocument(admob.value), admobRaw)
    assert.equal(serializeShowAdsDocument(showAds.value), showAdsRaw)
  })

  it('giữ lại các mảng danh mục mà SDK không đọc', () => {
    const showAds = parseShowAdsDocument(showAdsRaw)
    assert.ok(showAds.ok)
    assert.ok(Array.isArray(showAds.value.listTemplateMedium), 'listTemplateMedium phải còn nguyên')
  })
})

describe('validateAdsDocuments trên dữ liệu thật', () => {
  const admob = parseAdmobIdDocument(admobRaw)
  const showAds = parseShowAdsDocument(showAdsRaw)
  assert.ok(admob.ok && showAds.ok)

  const result = validateAdsDocuments({ admob: admob.value, showAds: showAds.value })

  it('không còn lỗi và cảnh báo nào', () => {
    const blocking = result.findings.filter((f) => f.severity === 'error' || f.severity === 'warning')
    assert.deepEqual(
      blocking.map((f) => `${f.severity} ${f.code} @ ${JSON.stringify(f.path)}`),
      [],
    )
  })

  it('thống kê khớp với nội dung file', () => {
    assert.equal(result.stats.adUnitCount, 72)
    assert.equal(result.stats.placementCount, 66)
    assert.equal(result.stats.templatesAvailable, 43)
  })
})
