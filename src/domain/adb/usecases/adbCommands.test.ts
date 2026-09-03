import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ok } from '../../../core/result'
import type { Result } from '../../../core/result'
import type { AdbCommand, AdbExit, AdbRunOutput, AdbShell } from '../repositories/AdbShell'
import {
  listPackages,
  parsePidofOutput,
  parsePsOutput,
  resolveAppPid,
} from './adbCommands'

const shellReturning = (output: AdbRunOutput): AdbShell & { commands: string[][] } => {
  const commands: string[][] = []
  return {
    commands,
    async run(command: AdbCommand): Promise<Result<AdbRunOutput>> {
      commands.push([...(command.serial ? ['-s', command.serial] : []), ...command.args])
      return ok(output)
    },
    async stream(): Promise<Result<AdbExit>> {
      return ok({ code: 0, stderr: '' })
    },
  }
}

describe('parsePidofOutput', () => {
  it('đọc một pid', () => {
    assert.equal(parsePidofOutput('12043\n'), 12043)
  })

  it('trả null khi không có gì — app chưa chạy không phải lỗi', () => {
    assert.equal(parsePidofOutput(''), null)
    assert.equal(parsePidofOutput('\n'), null)
  })
})

describe('parsePsOutput', () => {
  it('lấy pid từ cột thứ hai, khớp tên ở cột cuối', () => {
    const stdout = [
      'USER           PID  PPID     VSZ    RSS WCHAN            ADDR S NAME',
      'u0_a123      12043  1234 1234567  98765 0                   0 S com.pion.lovetest',
      'u0_a999      13000  1234 1234567  98765 0                   0 S com.zalo',
    ].join('\n')

    assert.equal(parsePsOutput(stdout, 'com.pion.lovetest'), 12043)
    assert.equal(parsePsOutput(stdout, 'com.zalo'), 13000)
  })

  it('không khớp thì trả null, không nhận nhầm dòng tiêu đề', () => {
    assert.equal(parsePsOutput('USER PID PPID NAME\n', 'com.pion.lovetest'), null)
  })

  it('không khớp một phần: `com.pion` không phải `com.pion.lovetest`', () => {
    const stdout = 'u0_a1 500 1 S com.pion.lovetest'
    assert.equal(parsePsOutput(stdout, 'com.pion'), null)
  })
})

describe('listPackages', () => {
  it('luôn kèm `-3`: app hệ thống không có đường nào lọt vào danh sách', async () => {
    const shell = shellReturning({ stdout: 'package:com.a\n', stderr: '', code: 0 })
    await listPackages(shell, 'emulator-5554')

    assert.deepEqual(shell.commands[0], ['-s', 'emulator-5554', 'shell', 'pm', 'list', 'packages', '-3'])
  })

  it('dịch "device unauthorized" thành câu nói được phải làm gì', async () => {
    const shell = shellReturning({ stdout: '', stderr: 'error: device unauthorized.\n', code: 1 })
    const result = await listPackages(shell, 'emulator-5554')

    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.error.kind, 'forbidden')
      assert.match(result.error.message, /Cho phép/)
    }
  })
})

/** Fake trả lời khác nhau tuỳ lệnh, để phân biệt được đường `pidof` và đường `ps`. */
const scriptedShell = (
  answer: (args: readonly string[]) => AdbRunOutput,
): AdbShell & { commands: string[][] } => {
  const commands: string[][] = []
  return {
    commands,
    async run(command: AdbCommand): Promise<Result<AdbRunOutput>> {
      commands.push([...command.args])
      return ok(answer(command.args))
    },
    async stream(): Promise<Result<AdbExit>> {
      return ok({ code: 0, stderr: '' })
    },
  }
}

describe('resolveAppPid', () => {
  it('app chưa chạy: trả lời ngay bằng pidof, KHÔNG đụng tới ps', async () => {
    // Đây là đường đi nóng nhất của cả công cụ: vòng chờ app khởi động dò lại
    // mỗi giây. Thêm một lượt `ps -A` vào đây là thêm một hai giây và hàng trăm
    // dòng, mỗi giây, cho một câu hỏi pidof đã trả lời xong.
    const shell = scriptedShell(() => ({ stdout: '', stderr: '', code: 1 }))

    const pid = await resolveAppPid(shell, 'emulator-5554', 'com.pion.lovetest')

    assert.deepEqual(pid, { ok: true, value: null })
    assert.equal(shell.commands.length, 1)
    assert.equal(shell.commands[0]?.[1], 'pidof')
  })

  it('máy không có pidof: mới lùi sang ps', async () => {
    const shell = scriptedShell((args) =>
      args[1] === 'pidof'
        ? { stdout: '', stderr: '/system/bin/sh: pidof: inaccessible or not found\n', code: 127 }
        : { stdout: 'USER PID PPID NAME\nu0_a1  9931  1 S com.pion.lovetest\n', stderr: '', code: 0 },
    )

    const pid = await resolveAppPid(shell, 'emulator-5554', 'com.pion.lovetest')

    assert.deepEqual(pid, { ok: true, value: 9931 })
    assert.deepEqual(
      shell.commands.map((args) => args[1]),
      ['pidof', 'ps'],
    )
  })

  it('app đang chạy: đọc pid từ pidof', async () => {
    const shell = scriptedShell(() => ({ stdout: '12043\n', stderr: '', code: 0 }))
    const pid = await resolveAppPid(shell, 'emulator-5554', 'com.pion.lovetest')

    assert.deepEqual(pid, { ok: true, value: 12043 })
    assert.equal(shell.commands.length, 1)
  })
})
