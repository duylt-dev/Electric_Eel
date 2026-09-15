import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildPackageList,
  filterPackages,
  isSafeApkPath,
  isSafePackageName,
  parseBadgingLabel,
  parseInstalledPackages,
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

  it('xếp theo package name từ a đến z, không nhóm app trong danh bạ lên đầu', () => {
    const list = buildPackageList(['com.zalo', 'com.pion.lovetest', 'com.abc'], labels)

    assert.deepEqual(
      list.map((item) => item.packageName),
      ['com.abc', 'com.pion.lovetest', 'com.zalo'],
    )
    assert.equal(list[0]?.label, null)
    assert.equal(list[1]?.label, 'Love Test')
    assert.equal(list[1]?.known, true)
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

describe('parseInstalledPackages', () => {
  it('giữ đường dẫn APK cùng package name', () => {
    const items = parseInstalledPackages(
      'package:/data/app/~~1DbGADK4tNX4LBC8zs74Kg==/co.rbx-Chl4oTu5ntkP4K6EipKQIw==/base.apk=co.rbx\n',
    )
    assert.deepEqual(items, [
      { packageName: 'co.rbx', apkPath: '/data/app/~~1DbGADK4tNX4LBC8zs74Kg==/co.rbx-Chl4oTu5ntkP4K6EipKQIw==/base.apk' },
    ])
  })

  it('bỏ dòng không có đường dẫn hoặc đường dẫn không sạch — app đó chỉ mất nhãn', () => {
    const items = parseInstalledPackages(
      ['package:com.a', "package:/data/app/x'y/base.apk=com.b", 'package:/data/app/c/base.apk=com.c'].join('\n'),
    )
    assert.deepEqual(items, [{ packageName: 'com.c', apkPath: '/data/app/c/base.apk' }])
  })
})

describe('isSafeApkPath', () => {
  it('từ chối mọi thứ có nghĩa với shell của máy', () => {
    for (const value of ['/a b/base.apk', '/a;rm/base.apk', '/a/$HOME/base.apk', '/a/../b.apk', 'rel/base.apk', '/a/base']) {
      assert.equal(isSafeApkPath(value), false, value)
    }
  })
})

describe('parseBadgingLabel', () => {
  it('lấy nhãn mặc định, bỏ qua bản dịch', () => {
    const stdout = [
      "package: name='co.rbx' versionCode='5'",
      "application-label:'RBX Clothes Maker'",
      "application-label-vi:'RBX Làm đồ'",
    ].join('\n')
    assert.equal(parseBadgingLabel(stdout), 'RBX Clothes Maker')
  })

  it('bỏ escape dấu nháy, và trả null khi không có dòng nhãn', () => {
    assert.equal(parseBadgingLabel("application-label:'Tom\\'s App'"), "Tom's App")
    assert.equal(parseBadgingLabel("package: name='co.rbx'"), null)
  })
})

describe('buildPackageList với nhãn máy', () => {
  it('danh bạ thắng nhãn máy; nhãn máy thắng package name; `known` chỉ nói về danh bạ', () => {
    const list = buildPackageList(
      ['com.a', 'com.b', 'com.c'],
      new Map([['com.a', 'Tên đội đặt']]),
      { 'com.a': 'Tên trên máy', 'com.b': 'App B' },
    )
    assert.deepEqual(list, [
      { packageName: 'com.a', label: 'Tên đội đặt', known: true },
      { packageName: 'com.b', label: 'App B', known: false },
      { packageName: 'com.c', label: null, known: false },
    ])
  })
})
