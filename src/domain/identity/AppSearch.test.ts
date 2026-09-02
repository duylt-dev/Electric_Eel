import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildAppSearchIndex, filterApps, normalizeSearchText, tokenizeQuery } from './AppSearch'
import type { SearchableApp } from './AppSearch'

const APPS: readonly SearchableApp[] = [
  {
    displayName: 'Love Test',
    projectId: 'love-test-2981e',
    slug: 'love-test',
    packageName: 'com.pion.lovetest',
  },
  {
    displayName: 'Tình Yêu Đôi Lứa',
    projectId: 'tinh-yeu-77c1a',
    slug: 'tinh-yeu',
    packageName: 'com.pion.tinhyeu',
  },
  {
    displayName: 'Antivirus Flux',
    projectId: 'antivirus-flux-4410b',
    slug: 'antivirus',
    packageName: null,
  },
]

const INDEX = buildAppSearchIndex(APPS)

const namesFor = (query: string): string[] =>
  filterApps(APPS, INDEX, query).map((app) => app.displayName)

describe('AppSearch', () => {
  it('bỏ dấu và hạ chữ thường, kể cả chữ đ', () => {
    assert.equal(normalizeSearchText('Tình Yêu Đôi Lứa'), 'tinh yeu doi lua')
    assert.equal(normalizeSearchText('ĐÓNG'), 'dong')
  })

  it('tìm được theo tên hiển thị, Project ID, package name và slug', () => {
    assert.deepEqual(namesFor('Love'), ['Love Test'])
    assert.deepEqual(namesFor('2981e'), ['Love Test'])
    assert.deepEqual(namesFor('com.pion.lovetest'), ['Love Test'])
    assert.deepEqual(namesFor('antivirus'), ['Antivirus Flux'])
  })

  it('gõ không dấu vẫn ra app đặt tên có dấu', () => {
    assert.deepEqual(namesFor('tinh yeu'), ['Tình Yêu Đôi Lứa'])
    assert.deepEqual(namesFor('doi lua'), ['Tình Yêu Đôi Lứa'])
  })

  it('nhiều từ khoá thì phải khớp đủ, không cần đúng thứ tự', () => {
    assert.deepEqual(namesFor('love pion'), ['Love Test'])
    assert.deepEqual(namesFor('pion love'), ['Love Test'])
    // "flux" có, "pion" không — app này không có package name.
    assert.deepEqual(namesFor('flux pion'), [])
  })

  it('từ khoá không khớp gì thì trả về mảng rỗng, không phải cả danh sách', () => {
    assert.deepEqual(namesFor('không có app nào tên vậy'), [])
  })

  it('ô tìm kiếm rỗng trả về CHÍNH mảng đầu vào, không cấp phát bản sao', () => {
    // Tính chất này là thứ giữ cho lần vẽ đầu tiên không tốn gì: tham chiếu
    // không đổi thì React bỏ qua việc vẽ lại danh sách.
    assert.equal(filterApps(APPS, INDEX, ''), APPS)
    assert.equal(filterApps(APPS, INDEX, '   '), APPS)
    assert.deepEqual(tokenizeQuery('  '), [])
  })

  it('app chưa điền package name không làm hỏng chỉ mục', () => {
    assert.equal(INDEX.length, APPS.length)
    assert.deepEqual(namesFor('Antivirus Flux'), ['Antivirus Flux'])
  })

  it('từ khoá không vắt được qua ranh giới hai trường', () => {
    // "testlove" là đuôi của displayName ghép thẳng vào đầu projectId. Nếu bốn
    // trường bị nối liền không có ký tự ngăn thì từ khoá này khớp — và người
    // dùng nhận về một kết quả không giải thích được.
    assert.deepEqual(namesFor('testlove'), [])
  })
})
