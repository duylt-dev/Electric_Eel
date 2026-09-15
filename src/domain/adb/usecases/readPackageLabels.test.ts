import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AppErrors, type Result, err, ok } from '../../../core/result'
import type { InstalledPackage } from '../entities/AndroidPackage'
import type { ApkLabelReader } from '../repositories/ApkLabelReader'
import { LABEL_CONCURRENCY, readPackageLabels } from './readPackageLabels'

const pkgs = (count: number): InstalledPackage[] =>
  Array.from({ length: count }, (_, i) => ({ packageName: `com.a${i}`, apkPath: `/data/app/a${i}/base.apk` }))

describe('readPackageLabels', () => {
  it('báo từng nhãn, bỏ qua app không có nhãn, không vượt quá số luồng', async () => {
    let inFlight = 0
    let peak = 0
    const reader: ApkLabelReader = {
      async readLabel(_serial, pkg): Promise<Result<string | null>> {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 1))
        inFlight -= 1
        return ok(pkg.packageName === 'com.a3' ? null : `Label ${pkg.packageName}`)
      },
    }

    const got: string[] = []
    const outcome = await readPackageLabels(reader, 'S', pkgs(10), (name, label) => got.push(`${name}=${label}`))

    assert.equal(outcome.ok, true)
    assert.equal(got.length, 9)
    assert.ok(!got.some((entry) => entry.startsWith('com.a3=')))
    assert.ok(peak <= LABEL_CONCURRENCY && peak > 1, `peak=${String(peak)}`)
  })

  it('reader hỏng là dừng cả lượt, không hỏi tiếp bảy mươi lần', async () => {
    let calls = 0
    const reader: ApkLabelReader = {
      async readLabel(): Promise<Result<string | null>> {
        calls += 1
        return err(AppErrors.notFound('Không tìm thấy aapt2'))
      },
    }

    const outcome = await readPackageLabels(reader, 'S', pkgs(20), () => undefined)

    assert.equal(outcome.ok, false)
    assert.ok(calls <= LABEL_CONCURRENCY, `calls=${String(calls)}`)
  })

  it('huỷ giữa chừng thì trả cancelled', async () => {
    const controller = new AbortController()
    const reader: ApkLabelReader = {
      async readLabel(): Promise<Result<string | null>> {
        controller.abort()
        return ok('x')
      },
    }
    const outcome = await readPackageLabels(reader, 'S', pkgs(5), () => undefined, controller.signal)
    assert.equal(outcome.ok, false)
    if (!outcome.ok) assert.equal(outcome.error.kind, 'cancelled')
  })
})
