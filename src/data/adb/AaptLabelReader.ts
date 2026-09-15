import 'server-only'

import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { AppErrors, type Result, err, ok } from '../../core/result'
import { isSafeApkPath, parseBadgingLabel } from '../../domain/adb/entities/AndroidPackage'
import type { InstalledPackage } from '../../domain/adb/entities/AndroidPackage'
import type { AdbShell } from '../../domain/adb/repositories/AdbShell'
import type { ApkLabelReader } from '../../domain/adb/repositories/ApkLabelReader'
import { findAapt2 } from './aaptSettings'
import { buildStoredZip } from './storedZip'

/**
 * Đọc nhãn app bằng `aapt2`, nhưng chỉ kéo về đúng hai tệp cần.
 *
 * ─── Vì sao không `adb pull base.apk` ───
 *
 * Một base.apk phổ biến nặng 50 MB, kéo mất hai giây; bảy mươi app là hơn hai
 * phút và vài GB qua USB cho mỗi lần mở trang. Nhưng `aapt2 dump badging`
 * chỉ cần `AndroidManifest.xml` và `resources.arsc` — vài MB. Toybox trên
 * Android có sẵn `unzip`, nên tách hai tệp đó NGAY TRÊN MÁY rồi mới kéo về:
 * nửa giây một app, đo trên SM-A165F (xem plan 260915-1500).
 *
 * aapt2 sẽ cảnh báo hàng nghìn dòng vì thiếu `res/` — chúng đi ra stderr và
 * không ảnh hưởng dòng `application-label:` ở stdout.
 *
 * ─── Cache ───
 *
 * Khoá là đường dẫn APK: `/data/app/~~<hash>==/<pkg>-<hash>==/base.apk`, hash
 * đổi mỗi lần cài lại, nên nhãn cũ không bao giờ dính vào bản mới. Đặt trên
 * `globalThis` vì cùng lý do với bảng phiên mirror ở `di/server.ts`: `next
 * dev` nạp lại module là mất cache, mà cache này mất là mất mười giây.
 */
/**
 * Thư mục tạm trên máy nằm PHẲNG trong `/data/local/tmp`: `unzip` của toybox
 * tạo được thư mục đích nhưng không tạo thư mục cha, nên `eel-labels/<pkg>`
 * đổ ngay ở lệnh đầu tiên (đo trên Android 16). Tiền tố giữ cho `ls` vẫn
 * nhận ra thứ gì là của tool này nếu có lần dọn không kịp.
 */
const DEVICE_TMP_PREFIX = '/data/local/tmp/eel-label-'
const NEEDED = ['AndroidManifest.xml', 'resources.arsc'] as const
const CACHE_LIMIT = 2000

const globalForLabels = globalThis as unknown as { __eelApkLabels?: Map<string, string | null> }
const cache = (globalForLabels.__eelApkLabels ??= new Map())

const remember = (apkPath: string, label: string | null): void => {
  if (cache.size >= CACHE_LIMIT) cache.clear()
  cache.set(apkPath, label)
}

function runAapt2(binary: string, apk: string, signal?: AbortSignal): Promise<Result<string>> {
  return new Promise((resolve) => {
    execFile(
      binary,
      ['dump', 'badging', apk],
      { maxBuffer: 8 * 1024 * 1024, timeout: 20_000, ...(signal !== undefined ? { signal } : {}) },
      (thrown, stdout) => {
        if (thrown === null) {
          resolve(ok(stdout))
          return
        }
        const code = (thrown as NodeJS.ErrnoException).code
        if (code === 'ENOENT') {
          resolve(err(AppErrors.notFound(`Không chạy được \`${binary}\`.`)))
          return
        }
        if (code === 'ABORT_ERR' || signal?.aborted === true) {
          resolve(err(AppErrors.cancelled('Đã huỷ.')))
          return
        }
        // aapt2 thoát khác 0 khi manifest hỏng — vẫn in được phần đã đọc, và
        // nếu không có dòng nhãn thì app này đơn giản là không có nhãn.
        resolve(ok(stdout))
      },
    )
  })
}

export class AaptLabelReader implements ApkLabelReader {
  constructor(private readonly shell: AdbShell) {}

  async readLabel(
    serial: string,
    pkg: InstalledPackage,
    signal?: AbortSignal,
  ): Promise<Result<string | null>> {
    const cached = cache.get(pkg.apkPath)
    if (cached !== undefined) return ok(cached)

    // Hàng rào cuối trước `adb shell`: chuỗi này đi qua shell CỦA MÁY.
    if (!isSafeApkPath(pkg.apkPath)) return ok(null)

    const aapt2 = findAapt2()
    if (!aapt2.ok) return aapt2

    const deviceDir = `${DEVICE_TMP_PREFIX}${pkg.packageName}-${randomBytes(4).toString('hex')}`
    const hostDir = await mkdtemp(join(tmpdir(), 'eel-label-'))

    try {
      const unzip = await this.shell.run(
        {
          serial,
          args: ['shell', 'unzip', '-o', '-q', pkg.apkPath, ...NEEDED, '-d', deviceDir],
          timeoutMs: 15_000,
        },
        signal,
      )
      if (!unzip.ok) return unzip

      const pull = await this.shell.run(
        { serial, args: ['pull', deviceDir, hostDir], timeoutMs: 30_000 },
        signal,
      )
      if (!pull.ok) return pull

      const pulled = join(hostDir, basename(deviceDir))
      const entries = []
      for (const name of NEEDED) {
        try {
          entries.push({ name, data: await readFile(join(pulled, name)) })
        } catch {
          // Thiếu tệp — APK lạ hoặc unzip không chạy được. Không có nhãn, thế thôi.
        }
      }
      if (entries.length === 0) {
        remember(pkg.apkPath, null)
        return ok(null)
      }

      const mini = join(hostDir, 'mini.apk')
      await writeFile(mini, buildStoredZip(entries))

      const badging = await runAapt2(aapt2.value, mini, signal)
      if (!badging.ok) return badging

      const label = parseBadgingLabel(badging.value)
      remember(pkg.apkPath, label)
      return ok(label)
    } finally {
      await Promise.all([
        rm(hostDir, { recursive: true, force: true }).catch(() => undefined),
        this.shell
          .run({ serial, args: ['shell', 'rm', '-rf', deviceDir], timeoutMs: 10_000 })
          .catch(() => undefined),
      ])
    }
  }
}
