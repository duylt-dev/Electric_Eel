import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_AUDIT_QUERY, auditQueryToRange, auditQueryToSearchParams, parseAuditQuery } from './AuditQuery'

describe('parseAuditQuery', () => {
  it('không có gì thì ra mặc định', () => {
    assert.deepEqual(parseAuditQuery({}), DEFAULT_AUDIT_QUERY)
  })

  it('đọc đủ bốn trường', () => {
    assert.deepEqual(parseAuditQuery({ from: '2026-09-01', to: '2026-09-15', status: 'failed', page: '3' }), {
      from: '2026-09-01',
      to: '2026-09-15',
      status: 'failed',
      page: 3,
    })
  })

  it('lấy giá trị đầu khi tham số lặp', () => {
    assert.equal(parseAuditQuery({ status: ['succeeded', 'failed'] }).status, 'succeeded')
  })

  it('ngày sai dạng hoặc không có thật thì bỏ', () => {
    assert.equal(parseAuditQuery({ from: '15/09/2026' }).from, null)
    assert.equal(parseAuditQuery({ from: '2026-02-30' }).from, null)
    assert.equal(parseAuditQuery({ from: '2026-13-01' }).from, null)
  })

  it('đảo lại khi từ ngày đứng sau đến ngày', () => {
    const query = parseAuditQuery({ from: '2026-09-15', to: '2026-09-01' })
    assert.equal(query.from, '2026-09-01')
    assert.equal(query.to, '2026-09-15')
  })

  it('trạng thái lạ thành "all", trang hỏng thành 1', () => {
    assert.equal(parseAuditQuery({ status: 'maybe' }).status, 'all')
    assert.equal(parseAuditQuery({ page: '0' }).page, 1)
    assert.equal(parseAuditQuery({ page: 'x' }).page, 1)
    assert.equal(parseAuditQuery({ page: '-4' }).page, 1)
  })
})

describe('auditQueryToSearchParams', () => {
  it('mặc định thì không ghi gì', () => {
    assert.equal(auditQueryToSearchParams(DEFAULT_AUDIT_QUERY).toString(), '')
  })

  it('chỉ ghi phần khác mặc định', () => {
    const params = auditQueryToSearchParams({ from: '2026-09-01', to: null, status: 'failed', page: 2 })
    assert.equal(params.toString(), 'from=2026-09-01&status=failed&page=2')
  })

  it('đi vòng qua URL rồi về không đổi', () => {
    const query = { from: '2026-09-01', to: '2026-09-15', status: 'succeeded' as const, page: 4 }
    const params = Object.fromEntries(auditQueryToSearchParams(query))
    assert.deepEqual(parseAuditQuery(params), query)
  })
})

describe('auditQueryToRange', () => {
  it('ngày là ngày ở Việt Nam: 00:00 +07:00, mốc cuối là 00:00 ngày kế tiếp', () => {
    const range = auditQueryToRange({ from: '2026-09-15', to: '2026-09-15', status: 'all', page: 1 })
    assert.equal(range.from?.toISOString(), '2026-09-14T17:00:00.000Z')
    assert.equal(range.to?.toISOString(), '2026-09-15T17:00:00.000Z')
    assert.equal(range.succeeded, null)
  })

  it('mốc cuối lăn đúng qua cuối tháng và cuối năm', () => {
    assert.equal(
      auditQueryToRange({ ...DEFAULT_AUDIT_QUERY, to: '2026-12-31' }).to?.toISOString(),
      '2026-12-31T17:00:00.000Z',
    )
  })

  it('trạng thái thành cờ succeeded', () => {
    assert.equal(auditQueryToRange({ ...DEFAULT_AUDIT_QUERY, status: 'succeeded' }).succeeded, true)
    assert.equal(auditQueryToRange({ ...DEFAULT_AUDIT_QUERY, status: 'failed' }).succeeded, false)
  })

  it('không chọn ngày thì không có mốc', () => {
    const range = auditQueryToRange(DEFAULT_AUDIT_QUERY)
    assert.equal(range.from, null)
    assert.equal(range.to, null)
  })
})
