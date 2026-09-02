import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { hasLeftoverPlaceholder, protectSpecials, restorePlaceholders } from './GlyphMask'

describe('protectSpecials', () => {
  it('che emoji rồi trả lại đúng ký tự ban đầu', () => {
    const source = '<string name="hot">Deal 🔥 hot</string>'
    const { masked, masking } = protectSpecials(source)

    assert.ok(!masked.includes('🔥'), 'emoji phải biến mất khỏi phần gửi cho mô hình')
    assert.ok(masked.includes('__U1F525__'))
    assert.equal(restorePlaceholders(masked, masking), source)
  })

  it('không cắt đôi emoji ngoài mặt phẳng cơ bản', () => {
    // 🔥 là một điểm mã nhưng hai đơn vị UTF-16. Duyệt theo `charAt` sẽ tạo ra
    // hai nửa surrogate rời và ghép lại thành ký tự khác.
    const { masked, masking } = protectSpecials('🔥')
    assert.equal(masked, '__U1F525__')
    assert.equal(masking.size, 1)
    assert.equal(restorePlaceholders(masked, masking), '🔥')
  })

  it('giữ nguyên ký tự vùng dùng riêng — icon của font riêng trong app', () => {
    const source = '<string name="icon"> Menu</string>'
    const { masked, masking } = protectSpecials(source)

    assert.ok(masked.includes('__UE156__'))
    assert.equal(restorePlaceholders(masked, masking), source)
  })

  it('che cả thực thể số có sẵn trong tệp gốc', () => {
    const { masked, masking } = protectSpecials('Giá &#x1F4B0; ngay &#128512;')

    assert.ok(masked.includes('__HEXU1F4B0__'))
    assert.ok(masked.includes('__DECU1F600__'))
    assert.equal(restorePlaceholders(masked, masking), 'Giá &#x1F4B0; ngay &#128512;')
  })

  it('chuẩn hoá thực thể mô hình trả về kèm khoảng trắng thừa', () => {
    // Mô hình hay nhả ra "& #x1F525 ;". Android đọc dạng đó thành chữ.
    assert.equal(restorePlaceholders('& # x 1F525 ;', new Map()), '&#x1F525;')
  })

  it('preferNumericEntities đổi biểu tượng thành thực thể thay vì ký tự thật', () => {
    const { masked, masking } = protectSpecials('🔥', true)
    assert.equal(restorePlaceholders(masked, masking), '&#x1F525;')
  })

  it('không đụng tới chữ thường', () => {
    const source = '<string name="a">Xin chào Việt Nam</string>'
    const { masked, masking } = protectSpecials(source)
    assert.equal(masked, source)
    assert.equal(masking.size, 0)
  })

  it('phát hiện mã hiệu còn sót — dấu hiệu mô hình đã cắt mất biểu tượng', () => {
    assert.equal(hasLeftoverPlaceholder('còn __U1F525__ ở đây'), true)
    assert.equal(hasLeftoverPlaceholder('sạch rồi 🔥'), false)
  })
})
