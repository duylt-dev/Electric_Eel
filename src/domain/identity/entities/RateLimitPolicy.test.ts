import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  LOGIN_RULE_BY_EMAIL,
  LOGIN_RULE_BY_IP,
  describeRetryAfter,
  judge,
  loginEmailBucket,
  loginIpBucket,
} from './RateLimitPolicy'

const NOW = new Date('2026-09-02T10:00:00Z')
const secondsAgo = (seconds: number): Date => new Date(NOW.getTime() - seconds * 1000)

describe('judge', () => {
  it('cho qua khi chưa chạm hạn mức', () => {
    const verdict = judge(LOGIN_RULE_BY_EMAIL, LOGIN_RULE_BY_EMAIL.limit - 1, secondsAgo(60), NOW)
    assert.equal(verdict.allowed, true)
    assert.equal(verdict.retryAfterSeconds, 0)
  })

  it('chặn khi đủ số lần hỏng trong cửa sổ', () => {
    const verdict = judge(LOGIN_RULE_BY_EMAIL, LOGIN_RULE_BY_EMAIL.limit, secondsAgo(60), NOW)
    assert.equal(verdict.allowed, false)
    assert.equal(verdict.retryAfterSeconds, LOGIN_RULE_BY_EMAIL.windowSeconds - 60)
  })

  it('mở lại khi lần hỏng cũ nhất đã trôi khỏi cửa sổ', () => {
    const verdict = judge(
      LOGIN_RULE_BY_EMAIL,
      LOGIN_RULE_BY_EMAIL.limit,
      secondsAgo(LOGIN_RULE_BY_EMAIL.windowSeconds + 1),
      NOW,
    )
    assert.equal(verdict.allowed, true)
  })

  it('cho qua khi không có lần hỏng nào được ghi', () => {
    // Ghi bộ đếm hỏng thì `oldestHitAt` là null. Chặn ở đây sẽ khoá hết mọi
    // người vì một lỗi ghi log.
    assert.equal(judge(LOGIN_RULE_BY_EMAIL, 99, null, NOW).allowed, true)
  })

  it('hạn mức theo email chặt hơn hẳn hạn mức theo IP', () => {
    // Một văn phòng dùng chung NAT phải không được tự khoá lẫn nhau, nên hạn
    // mức theo IP phải rộng hơn nhiều lần.
    assert.ok(LOGIN_RULE_BY_IP.limit > LOGIN_RULE_BY_EMAIL.limit * 3)
  })
})

describe('khoá đếm', () => {
  it('gộp email không phân biệt hoa thường và khoảng trắng', () => {
    assert.equal(loginEmailBucket('  A@B.COM '), loginEmailBucket('a@b.com'))
  })

  it('email và IP nằm ở hai không gian khoá khác nhau', () => {
    assert.notEqual(loginEmailBucket('1.2.3.4'), loginIpBucket('1.2.3.4'))
  })
})

describe('describeRetryAfter', () => {
  it('làm tròn lên phút và không bao giờ nói "0 phút"', () => {
    assert.match(describeRetryAfter(1), /một phút/)
    assert.match(describeRetryAfter(61), /2 phút/)
  })
})
