import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { inspectServerEnv } from './envRules'

const HEX = 'a'.repeat(64)

const productionEnv = (overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv =>
  ({
    NODE_ENV: 'production',
    AUTH_SECRET: 'x'.repeat(32),
    AUTH_URL: 'https://tools.pion.vn',
    CREDENTIAL_ENCRYPTION_KEY: HEX,
    DATABASE_URL: 'file:./dev.db',
    ...overrides,
  }) as NodeJS.ProcessEnv

const fatalVariables = (env: NodeJS.ProcessEnv): string[] =>
  inspectServerEnv(env)
    .filter((problem) => problem.severity === 'fatal')
    .map((problem) => problem.variable)

describe('inspectServerEnv', () => {
  it('không phàn nàn gì khi cấu hình production đầy đủ', () => {
    assert.deepEqual(inspectServerEnv(productionEnv()), [])
  })

  it('liệt kê MỌI vấn đề chứ không dừng ở cái đầu tiên', () => {
    // Sửa cấu hình theo kiểu mỗi lần khởi động lại lộ đúng một dòng là cách
    // nhanh nhất để người ta bỏ cuộc.
    const problems = fatalVariables(
      productionEnv({ AUTH_SECRET: undefined, CREDENTIAL_ENCRYPTION_KEY: undefined }),
    )
    assert.ok(problems.includes('AUTH_SECRET'))
    assert.ok(problems.includes('CREDENTIAL_ENCRYPTION_KEY'))
  })

  it('ở production bắt buộc AUTH_URL dùng https', () => {
    assert.ok(fatalVariables(productionEnv({ AUTH_URL: 'http://tools.pion.vn' })).includes('AUTH_URL'))
  })

  it('nhưng cho phép http với localhost — trình duyệt vẫn coi đó là ngữ cảnh an toàn', () => {
    // Nếu không có ngoại lệ này thì `pnpm build && pnpm start` tại máy sẽ hỏng.
    assert.deepEqual(fatalVariables(productionEnv({ AUTH_URL: 'http://localhost:3000' })), [])
    assert.deepEqual(fatalVariables(productionEnv({ AUTH_URL: 'http://127.0.0.1:3123' })), [])
  })

  it('từ chối khoá mã hoá sai định dạng ở mọi môi trường, kể cả dev', () => {
    const env = { NODE_ENV: 'development', CREDENTIAL_ENCRYPTION_KEY: 'qua-ngan' } as NodeJS.ProcessEnv
    assert.ok(fatalVariables(env).includes('CREDENTIAL_ENCRYPTION_KEY'))
  })

  it('ở dev thì thiếu biến chỉ là cảnh báo, không chặn', () => {
    // Máy vừa clone repo về chưa có `.env` mà vẫn phải chạy được.
    const problems = inspectServerEnv({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)
    assert.ok(problems.length > 0)
    assert.equal(problems.every((problem) => problem.severity === 'warning'), true)
  })

  it('cảnh báo khi khoá cũ đang bằng đúng khoá hiện hành', () => {
    const problems = inspectServerEnv(
      productionEnv({ CREDENTIAL_ENCRYPTION_KEY_PREVIOUS: HEX }),
    )
    assert.ok(problems.some((problem) => problem.variable === 'CREDENTIAL_ENCRYPTION_KEY_PREVIOUS'))
  })

  it('từ chối khoá cũ sai định dạng', () => {
    assert.ok(
      fatalVariables(productionEnv({ CREDENTIAL_ENCRYPTION_KEY_PREVIOUS: 'khong-phai-hex' })).includes(
        'CREDENTIAL_ENCRYPTION_KEY_PREVIOUS',
      ),
    )
  })
})
