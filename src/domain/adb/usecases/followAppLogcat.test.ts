import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ok } from '../../../core/result'
import type { Result } from '../../../core/result'
import type { AdbCommand, AdbExit, AdbRunOutput, AdbShell } from '../repositories/AdbShell'
import { followAppLogcat } from './followAppLogcat'
import type { FollowEvent } from './followAppLogcat'

/**
 * Một lượt bám: app đang chạy dưới `pid` và in ra `lines` rồi tiến trình chết,
 * hoặc `pid: null` nghĩa là lúc đó app chưa chạy.
 */
interface Attempt {
  pid: number | null
  lines?: readonly string[]
}

/**
 * `AdbShell` giả.
 *
 * Đây là lý do use case nhận cổng chứ không tự gọi `spawn`: toàn bộ phần khó —
 * dò pid, bám lại sau khi app chết — kiểm thử được mà không cần cắm máy nào,
 * và không cần chờ một app thật khởi động lại.
 */
function fakeShell(attempts: readonly Attempt[], controller: AbortController) {
  let index = 0
  const commands: string[][] = []

  const shell: AdbShell = {
    async run(command: AdbCommand): Promise<Result<AdbRunOutput>> {
      commands.push([...command.args])

      if (command.args[1] === 'pidof') {
        const attempt = attempts[index]

        // Hết kịch bản: dừng vòng lặp, đúng như người dùng đóng màn hình. Dừng
        // ở ĐÂY chứ không ở giữa `stream`, để lượt bám cuối cùng còn kịp phát
        // ra sự kiện `detached` của nó.
        if (attempt === undefined) {
          controller.abort()
          return ok({ stdout: '', stderr: '', code: 1 })
        }

        if (attempt.pid === null) {
          index += 1
          return ok({ stdout: '', stderr: '', code: 1 })
        }
        return ok({ stdout: `${String(attempt.pid)}\n`, stderr: '', code: 0 })
      }

      // `ps -A` — đường lùi khi pidof không trả về gì. Ở đây luôn không khớp.
      if (command.args[1] === 'ps') {
        return ok({ stdout: 'USER PID PPID NAME\nu0 1 0 init\n', stderr: '', code: 0 })
      }

      return ok({ stdout: '', stderr: '', code: 0 })
    },

    async stream(
      command: AdbCommand,
      onLine: (line: string) => void,
    ): Promise<Result<AdbExit>> {
      commands.push([...command.args])

      const attempt = attempts[index]
      index += 1
      for (const line of attempt?.lines ?? []) onLine(line)

      return ok({ code: 0, stderr: '' })
    },
  }

  return { shell, commands }
}

const collect = async (
  attempts: readonly Attempt[],
): Promise<{ events: FollowEvent[]; commands: string[][] }> => {
  const controller = new AbortController()
  const fake = fakeShell(attempts, controller)
  const events: FollowEvent[] = []

  const outcome = await followAppLogcat(
    { shell: fake.shell },
    { serial: 'emulator-5554', packageName: 'com.pion.lovetest', pollIntervalMs: 1, settleMs: 0 },
    (event) => events.push(event),
    controller.signal,
  )

  assert.equal(outcome.ok, true)
  return { events, commands: fake.commands }
}

describe('followAppLogcat', () => {
  it('bám pid rồi đẩy từng dòng ra ngoài', async () => {
    const { events } = await collect([{ pid: 100, lines: ['dòng một', 'dòng hai'] }])

    assert.deepEqual(events, [
      { type: 'attached', pid: 100 },
      { type: 'line', line: 'dòng một' },
      { type: 'line', line: 'dòng hai' },
      { type: 'detached', pid: 100 },
    ])
  })

  it('bám LẠI với pid mới khi app khởi động lại', async () => {
    // Đây là lý do tồn tại của cả use case này: không có bước bám lại thì màn
    // hình đứng im từ lần chạy lại đầu tiên, và điều đó nhìn giống hệt "app
    // không in log nữa".
    const { events } = await collect([
      { pid: 100, lines: ['trước khi chết'] },
      { pid: 200, lines: ['sau khi chạy lại'] },
    ])

    assert.deepEqual(
      events.filter((event) => event.type === 'attached'),
      [
        { type: 'attached', pid: 100 },
        { type: 'attached', pid: 200 },
      ],
    )
    assert.equal(events.filter((event) => event.type === 'detached').length, 2)
  })

  it('báo chờ đúng MỘT lần trong lúc app chưa chạy', async () => {
    const { events } = await collect([{ pid: null }, { pid: null }, { pid: 300, lines: ['xong'] }])

    // Dò lại theo nhịp là chuyện của máy chủ; người dùng chỉ cần nghe một lần.
    assert.equal(events.filter((event) => event.type === 'waiting').length, 1)
    assert.deepEqual(events.at(0), { type: 'waiting' })
    assert.ok(events.some((event) => event.type === 'attached' && event.pid === 300))
  })

  it('chỉ cắt bớt lịch sử ở lần bám ĐẦU, không cắt ở những lần sau', async () => {
    const { commands } = await collect([
      { pid: 100, lines: [] },
      { pid: 200, lines: [] },
    ])

    const logcats = commands.filter((args) => args[0] === 'logcat')
    assert.equal(logcats.length, 2)
    // Lần đầu: app có thể đã chạy từ lâu, đệm đầy dòng cũ.
    assert.ok(logcats[0]?.includes('-T'))
    // Lần sau: pid vừa sinh ra, "toàn bộ đệm của nó" đúng bằng log từ lúc khởi
    // động — cắt ở đây là cắt mất đúng phần cần nhất.
    assert.equal(logcats[1]?.includes('-T'), false)
    assert.ok(logcats[1]?.includes('--pid'))
    assert.ok(logcats[1]?.includes('200'))
  })

  it('xoá đệm trên máy trước khi bám, khi được yêu cầu', async () => {
    const controller = new AbortController()
    const fake = fakeShell([{ pid: 100, lines: [] }], controller)

    await followAppLogcat(
      { shell: fake.shell },
      {
        serial: 'emulator-5554',
        packageName: 'com.pion.lovetest',
        clearFirst: true,
        pollIntervalMs: 1,
        settleMs: 0,
      },
      () => {},
      controller.signal,
    )

    assert.deepEqual(fake.commands[0], ['logcat', '-c'])
  })

  it('từ chối package name có thể biến thành cờ dòng lệnh', async () => {
    const controller = new AbortController()
    const fake = fakeShell([{ pid: 100 }], controller)

    const outcome = await followAppLogcat(
      { shell: fake.shell },
      { serial: 'emulator-5554', packageName: '--help', pollIntervalMs: 1, settleMs: 0 },
      () => {},
      controller.signal,
    )

    assert.equal(outcome.ok, false)
    assert.equal(fake.commands.length, 0)
  })
})
