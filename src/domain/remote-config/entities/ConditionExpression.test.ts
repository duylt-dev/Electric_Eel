import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseExpression, serializeExpression } from './ConditionExpression'

describe('ConditionExpression', () => {
  const roundTrips = (expression: string) => {
    const clauses = parseExpression(expression)
    assert.equal(
      serializeExpression(clauses),
      expression,
      `phân tích rồi chuỗi hoá lại phải ra đúng đầu vào: ${expression}`,
    )
  }

  it('nhận ra danh sách quốc gia', () => {
    assert.deepEqual(parseExpression("device.country in ['VN', 'US']"), [
      { kind: 'country', countries: ['VN', 'US'] },
    ])
  })

  it('nhận ra nền tảng và app id', () => {
    assert.deepEqual(parseExpression("device.os == 'android'"), [{ kind: 'platform', os: 'android' }])
    assert.deepEqual(parseExpression("app.id == '1:123:android:abc'"), [
      { kind: 'appId', appId: '1:123:android:abc' },
    ])
  })

  it('tách nhiều mệnh đề nối bằng &&', () => {
    assert.deepEqual(parseExpression("device.country in ['VN'] && device.os == 'android'"), [
      { kind: 'country', countries: ['VN'] },
      { kind: 'platform', os: 'android' },
    ])
  })

  it('giữ nguyên biểu thức lạ thay vì đoán bừa', () => {
    const exotic = "app.version.>=(['1.2.0'])"
    assert.deepEqual(parseExpression(exotic), [{ kind: 'raw', expression: exotic }])
  })

  it('không tách khi có || ở cấp ngoài cùng', () => {
    const either = "device.country in ['VN'] || device.country in ['US']"
    assert.deepEqual(parseExpression(either), [{ kind: 'raw', expression: either }])
  })

  it('không nhầm && nằm trong chuỗi thành toán tử', () => {
    const tricky = "app.userProperty['a && b'] == 'x'"
    assert.deepEqual(parseExpression(tricky), [{ kind: 'raw', expression: tricky }])
  })

  it('phân tích rồi chuỗi hoá lại không làm đổi biểu thức', () => {
    for (const expression of [
      "device.country in ['VN', 'US']",
      "device.language in ['vi']",
      "device.os == 'ios'",
      "app.id == '1:123:android:abc'",
      "device.country in ['VN'] && device.os == 'android'",
      "app.version.>=(['1.2.0'])",
      "percent('seed') <= 50",
      "device.country in ['VN'] || device.country in ['US']",
      'true',
    ]) {
      roundTrips(expression)
    }
  })

  it('biểu thức rỗng cho ra danh sách rỗng', () => {
    assert.deepEqual(parseExpression('   '), [])
  })

  it('danh sách sai cú pháp rơi về raw chứ không mất chữ', () => {
    const broken = 'device.country in [VN]'
    assert.deepEqual(parseExpression(broken), [{ kind: 'raw', expression: broken }])
  })
})
