import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildPackageList,
  filterPackages,
  isSafePackageName,
  parsePackagesOutput,
} from './AndroidPackage'

describe('parsePackagesOutput', () => {
  it('đọc danh sách thường', () => {
    const names = parsePackagesOutput('package:com.pion.lovetest\npackage:com.android.settings\n')
    assert.deepEqual(names, ['com.pion.lovetest', 'com.android.settings'])
  })

  it('đọc được cả dạng có đường dẫn apk (`pm list packages -f`)', () => {
    const names = parsePackagesOutput('package:/data/app/~~ab==/com.pion.lovetest-cd==/base.apk=com.pion.lovetest')
    assert.deepEqual(names, ['com.pion.lovetest'])
  })

  it('bỏ dòng lạ, dòng trùng và tên không hợp lệ', () => {
    const names = parsePackagesOutput(
      ['WARNING: linker: something', 'package:com.a', 'package:com.a', 'package:-evil', ''].join('\n'),
    )
    assert.deepEqual(names, ['com.a'])
  })
})

describe('isSafePackageName', () => {
  it('nhận package hệ thống không có dấu chấm', () => {
    // Khác `isPackageName` bên identity: bên đó kiểm cái người dùng GÕ vào nên
    // bắt buộc có dấu chấm; ở đây kiểm cái thiết bị TRẢ VỀ.
    assert.equal(isSafePackageName('android'), true)
  })

  it('từ chối thứ có thể thành cờ dòng lệnh', () => {
    for (const value of ['-pid', 'com.a b', 'com.a;id', '']) {
      assert.equal(isSafePackageName(value), false, value)
    }
  })
})

describe('buildPackageList', () => {
  const labels = new Map([['com.pion.lovetest', 'Love Test']])

  it('app trong danh bạ lên trước, phần còn lại theo bảng chữ cái', () => {
    const list = buildPackageList(['com.zalo', 'com.pion.lovetest', 'com.abc'], labels)

    assert.deepEqual(
      list.map((item) => item.packageName),
      ['com.pion.lovetest', 'com.abc', 'com.zalo'],
    )
    assert.equal(list[0]?.label, 'Love Test')
    assert.equal(list[0]?.known, true)
    assert.equal(list[1]?.label, null)
  })
})

describe('filterPackages', () => {
  const list = buildPackageList(['com.pion.lovetest', 'com.zalo'], new Map([['com.pion.lovetest', 'Love Test']]))

  it('khớp cả tên hiển thị lẫn package name', () => {
    assert.equal(filterPackages(list, 'love').length, 1)
    assert.equal(filterPackages(list, 'PION').length, 1)
    assert.equal(filterPackages(list, 'com').length, 2)
  })

  it('ô rỗng trả về nguyên danh sách', () => {
    assert.equal(filterPackages(list, '   ').length, 2)
  })
})
