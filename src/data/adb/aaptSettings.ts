import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { AppErrors, type Result, err, ok } from '../../core/result'

/**
 * Tìm `aapt2` — công cụ đọc nhãn app từ APK, nằm trong Android build-tools.
 *
 * `adb` ở trong PATH của hầu hết máy dev, còn `aapt2` thì không: nó nằm sâu
 * trong `build-tools/<phiên bản>/` và mỗi bản SDK có một bản. Nên ngoài
 * `AAPT2_PATH` đặt tay, ở đây còn dò theo cách Android Studio bố trí SDK và
 * lấy bản build-tools mới nhất — đúng bản Gradle của đội đang dùng để build.
 *
 * Không tìm thấy KHÔNG phải lỗi chặn: công cụ Logcat vẫn chạy, chỉ là thẻ app
 * không có tên. Thông điệp trả về nói rõ phải cài gì hoặc đặt biến nào.
 */
const SDK_ENV_KEYS = ['ANDROID_HOME', 'ANDROID_SDK_ROOT'] as const

function sdkRoots(env: NodeJS.ProcessEnv): string[] {
  const roots: string[] = []
  for (const key of SDK_ENV_KEYS) {
    const value = env[key]?.trim()
    if (value !== undefined && value.length > 0) roots.push(value)
  }
  const home = homedir()
  roots.push(join(home, 'Library', 'Android', 'sdk'), join(home, 'Android', 'Sdk'))
  return roots
}

/** So sánh `36.0.0` với `36.1.0-rc1` theo từng số; bản rc xếp sau bản chính thức cùng số. */
function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] =>
    value.split(/[.-]/).map((part) => (/^\d+$/.test(part) ? Number(part) : -1))
  const a = parse(left)
  const b = parse(right)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function newestBuildTools(root: string): string | null {
  const dir = join(root, 'build-tools')
  let versions: string[]
  try {
    versions = readdirSync(dir)
  } catch {
    return null
  }
  const binary = process.platform === 'win32' ? 'aapt2.exe' : 'aapt2'
  const found = versions
    .sort((left, right) => compareVersions(right, left))
    .map((version) => join(dir, version, binary))
    .find((candidate) => existsSync(candidate))
  return found ?? null
}

export function findAapt2(env: NodeJS.ProcessEnv = process.env): Result<string> {
  const configured = env.AAPT2_PATH?.trim()
  if (configured !== undefined && configured.length > 0) {
    if (existsSync(configured)) return ok(configured)
    return err(
      AppErrors.notFound(`AAPT2_PATH trỏ tới \`${configured}\` nhưng ở đó không có tệp nào.`),
    )
  }

  for (const root of sdkRoots(env)) {
    const found = newestBuildTools(root)
    if (found !== null) return ok(found)
  }

  return err(
    AppErrors.notFound(
      'Không tìm thấy aapt2 nên không đọc được tên app. Cài Android build-tools (SDK Manager), hoặc đặt AAPT2_PATH trỏ tới tệp aapt2.',
    ),
  )
}
