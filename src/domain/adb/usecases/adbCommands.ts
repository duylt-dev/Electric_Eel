import { AppErrors, type Result, err, ok } from '../../../core/result'
import { isSafeConnectAddress, isSafeSerial, parseDevicesOutput } from '../entities/AdbDevice'
import type { AdbDevice } from '../entities/AdbDevice'
import { isSafePackageName, parsePackagesOutput } from '../entities/AndroidPackage'
import type { AdbRunOutput, AdbShell } from '../repositories/AdbShell'

/**
 * Các lệnh adb ngắn, mỗi hàm một việc.
 *
 * Route Handler gọi thẳng những hàm này thay vì tự dựng mảng tham số. Đó là
 * điều làm cho việc kiểm tra dữ liệu vào không thể bị bỏ sót: không có đường
 * nào từ một tham số HTTP tới `spawn` mà không đi qua đúng một trong các hàm
 * dưới đây, và hàm nào cũng mở đầu bằng phần kiểm.
 */

/**
 * Quy một lượt chạy hỏng về `AppError`.
 *
 * stderr của adb là thứ nói đúng vấn đề nhất mà người dùng gặp ("device
 * unauthorized", "device offline"), nên nó được đưa nguyên vào `message` chứ
 * không bị nuốt lại thành "đã xảy ra lỗi".
 */
function commandFailure(output: AdbRunOutput, fallback: string): Result<never> {
  const stderr = output.stderr.trim()
  const lower = stderr.toLowerCase()

  if (lower.includes('device unauthorized') || lower.includes('unauthorized')) {
    return err(
      AppErrors.forbidden(
        'Thiết bị chưa cho phép gỡ lỗi. Mở khoá màn hình rồi bấm "Cho phép" ở hộp thoại USB debugging.',
      ),
    )
  }
  if (lower.includes('device offline')) {
    return err(AppErrors.upstream('Thiết bị đang offline. Rút cáp cắm lại, hoặc nối lại qua mạng.'))
  }
  if (lower.includes('device not found') || lower.includes("device '") || lower.includes('no devices')) {
    return err(AppErrors.notFound('Không còn thấy thiết bị này. Bấm làm mới danh sách.'))
  }

  return err(AppErrors.upstream(fallback, { detail: stderr.length > 0 ? stderr : undefined }))
}

const succeeded = (output: AdbRunOutput): boolean => output.code === 0

export async function listDevices(
  shell: AdbShell,
  signal?: AbortSignal,
): Promise<Result<AdbDevice[]>> {
  const output = await shell.run({ args: ['devices', '-l'], timeoutMs: 15_000 }, signal)
  if (!output.ok) return output
  if (!succeeded(output.value)) {
    return commandFailure(output.value, 'Không hỏi được danh sách thiết bị từ adb.')
  }
  return ok(parseDevicesOutput(output.value.stdout))
}

/**
 * `adb connect host:port`.
 *
 * adb THOÁT 0 kể cả khi không nối được — nó chỉ in "failed to connect" ra
 * stdout. Vì vậy ở đây phải đọc chữ, không đọc mã thoát; tin vào mã thoát thì
 * một địa chỉ gõ sai sẽ hiện ra như một lần nối thành công.
 */
export async function connectDevice(
  shell: AdbShell,
  address: string,
  signal?: AbortSignal,
): Promise<Result<void>> {
  if (!isSafeConnectAddress(address)) {
    return err(AppErrors.validation('Địa chỉ phải có dạng 192.168.1.20:5555 hoặc tên máy.'))
  }

  const output = await shell.run({ args: ['connect', address], timeoutMs: 20_000 }, signal)
  if (!output.ok) return output

  const said = `${output.value.stdout}\n${output.value.stderr}`.toLowerCase()
  if (!succeeded(output.value) || said.includes('failed to connect') || said.includes('cannot connect')) {
    return err(
      AppErrors.upstream(`Không nối được tới ${address}.`, {
        detail: `${output.value.stdout.trim()} ${output.value.stderr.trim()}`.trim(),
      }),
    )
  }
  return ok(undefined)
}

export async function disconnectDevice(
  shell: AdbShell,
  address: string,
  signal?: AbortSignal,
): Promise<Result<void>> {
  if (!isSafeConnectAddress(address)) {
    return err(AppErrors.validation('Địa chỉ không hợp lệ.'))
  }
  const output = await shell.run({ args: ['disconnect', address], timeoutMs: 15_000 }, signal)
  if (!output.ok) return output
  return ok(undefined)
}

export async function listPackages(
  shell: AdbShell,
  serial: string,
  includeSystem: boolean,
  signal?: AbortSignal,
): Promise<Result<string[]>> {
  if (!isSafeSerial(serial)) return err(AppErrors.validation('Serial thiết bị không hợp lệ.'))

  // `-3` = chỉ app cài thêm. Không có nó thì danh sách dài gấp năm và app của
  // đội chìm giữa vài trăm package hệ thống.
  const args = ['shell', 'pm', 'list', 'packages', ...(includeSystem ? [] : ['-3'])]
  const output = await shell.run({ serial, args, timeoutMs: 30_000 }, signal)
  if (!output.ok) return output
  if (!succeeded(output.value)) {
    return commandFailure(output.value, 'Không đọc được danh sách app trên máy.')
  }
  return ok(parsePackagesOutput(output.value.stdout))
}

export async function clearLogcatBuffer(
  shell: AdbShell,
  serial: string,
  signal?: AbortSignal,
): Promise<Result<void>> {
  if (!isSafeSerial(serial)) return err(AppErrors.validation('Serial thiết bị không hợp lệ.'))

  const output = await shell.run({ serial, args: ['logcat', '-c'], timeoutMs: 15_000 }, signal)
  if (!output.ok) return output
  if (!succeeded(output.value)) {
    return commandFailure(output.value, 'Không xoá được đệm log trên máy.')
  }
  return ok(undefined)
}

/** `pidof -s` in ra đúng một số. Trả `null` khi app chưa chạy. */
export function parsePidofOutput(stdout: string): number | null {
  const first = stdout.trim().split(/\s+/)[0]
  if (first === undefined || !/^\d+$/.test(first)) return null
  const pid = Number(first)
  return pid > 0 ? pid : null
}

/**
 * Đọc `ps -A` để tìm pid — đường lùi cho máy không có `pidof`.
 *
 * Bố cục cột của `ps` đổi theo phiên bản Android, nhưng hai điều không đổi ở
 * mọi phiên bản đã gặp: cột thứ hai là PID, và cột cuối là tên tiến trình. Chỉ
 * dựa vào hai điều đó, không đếm cột ở giữa.
 */
export function parsePsOutput(stdout: string, packageName: string): number | null {
  for (const raw of stdout.split('\n')) {
    const columns = raw.trim().split(/\s+/)
    if (columns.length < 3) continue

    const name = columns[columns.length - 1]
    if (name !== packageName) continue

    const pid = columns[1]
    if (pid !== undefined && /^\d+$/.test(pid)) return Number(pid)
  }
  return null
}

/**
 * Máy không có lệnh này.
 *
 * Phân biệt được "app chưa chạy" với "máy không có `pidof`" là điều quan trọng
 * hơn nó trông có vẻ. Trên máy thật, `pidof` không tìm thấy gì thì thoát 1 với
 * stderr RỖNG; còn lệnh không tồn tại thì shell thoát 127 và nói rõ. Gộp hai
 * trường hợp đó lại — coi mọi mã thoát khác 0 là "có thể máy cũ" — thì mỗi lần
 * dò app chưa chạy sẽ kéo thêm một lượt `ps -A`. Vòng chờ app khởi động dò lại
 * mỗi giây, nên cái giá đó lặp lại mãi: trên một máy nối không dây, `ps -A`
 * mất một hai giây và trả về hàng trăm dòng, cho một câu trả lời mà `pidof` đã
 * trả lời xong từ đầu.
 */
const commandMissing = (output: AdbRunOutput): boolean =>
  output.code === 127 || /not found|inaccessible/i.test(output.stderr)

/**
 * pid của tiến trình chính của một app, hoặc `null` khi app chưa chạy.
 *
 * "Chưa chạy" không phải lỗi: người dùng thường mở màn logcat TRƯỚC rồi mới mở
 * app trên máy, và đó là cách dùng đúng — bắt được cả log lúc khởi động.
 */
export async function resolveAppPid(
  shell: AdbShell,
  serial: string,
  packageName: string,
  signal?: AbortSignal,
): Promise<Result<number | null>> {
  if (!isSafeSerial(serial)) return err(AppErrors.validation('Serial thiết bị không hợp lệ.'))
  if (!isSafePackageName(packageName)) {
    return err(AppErrors.validation('Tên package không hợp lệ.'))
  }

  const byPidof = await shell.run(
    { serial, args: ['shell', 'pidof', '-s', packageName], timeoutMs: 15_000 },
    signal,
  )
  if (!byPidof.ok) return byPidof

  if (succeeded(byPidof.value)) {
    return ok(parsePidofOutput(byPidof.value.stdout))
  }

  // Thoát khác 0 mà lệnh vẫn tồn tại: app chưa chạy. Trả lời ngay.
  if (!commandMissing(byPidof.value)) return ok(null)

  // Máy cũ (API < 24) không có `pidof`. Chỉ tới đây mới đụng tới `ps`.
  const byPs = await shell.run({ serial, args: ['shell', 'ps', '-A'], timeoutMs: 20_000 }, signal)
  if (!byPs.ok) return byPs

  if (!succeeded(byPs.value)) {
    // `ps -A` cũng không chạy được: máy còn cũ hơn nữa. Thử nốt `ps` trần.
    const plain = await shell.run({ serial, args: ['shell', 'ps'], timeoutMs: 20_000 }, signal)
    if (!plain.ok) return plain
    if (!succeeded(plain.value)) {
      return commandFailure(plain.value, 'Không hỏi được tiến trình nào đang chạy trên máy.')
    }
    return ok(parsePsOutput(plain.value.stdout, packageName))
  }

  return ok(parsePsOutput(byPs.value.stdout, packageName))
}
