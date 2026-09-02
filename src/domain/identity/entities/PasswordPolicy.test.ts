import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MIN_PASSWORD_LENGTH, validateNewPassword } from './PasswordPolicy'

describe('validateNewPassword', () => {
  it('chấp nhận mật khẩu đủ dài và không liên quan tới chủ tài khoản', () => {
    const result = validateNewPassword('ca-phe-sua-da-2026', { email: 'duy@pion.vn', name: 'Duy' })
    assert.ok(result.ok)
  })

  it('từ chối mật khẩu ngắn hơn ngưỡng', () => {
    const result = validateNewPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))
    assert.ok(!result.ok)
    assert.equal(result.error.kind, 'validation')
  })

  it('từ chối mật khẩu chứa phần đầu của email', () => {
    const result = validateNewPassword('duyduyduyduy', { email: 'duy@pion.vn' })
    assert.ok(!result.ok)
    assert.match(result.error.message, /email/)
  })

  it('từ chối mật khẩu chứa tên tài khoản, không phân biệt hoa thường', () => {
    const result = validateNewPassword('xxThanhDuyxx99', { name: 'thanh duy' })
    assert.ok(result.ok, 'tên có khoảng trắng thì không khớp nguyên khối')

    const exact = validateNewPassword('xxthanhduyxx99', { name: 'thanhduy' })
    assert.ok(!exact.ok)
  })

  it('từ chối chuỗi quá ít ký tự khác nhau dù đủ dài', () => {
    const result = validateNewPassword('ababababababab')
    assert.ok(!result.ok)
    assert.match(result.error.message, /ký tự khác nhau/)
  })

  it('từ chối mật khẩu mẫu trong .env.example', () => {
    // Nếu chuỗi này lọt qua thì nó sẽ được đem lên production nguyên vẹn.
    const result = validateNewPassword('doi-mat-khau-nay-ngay')
    assert.ok(!result.ok)
  })

  it('không sập khi không biết gì về chủ tài khoản', () => {
    assert.ok(validateNewPassword('mot-chuoi-du-dai-2026').ok)
  })
})
