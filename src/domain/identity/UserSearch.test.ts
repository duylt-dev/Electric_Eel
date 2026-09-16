import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildUserSearchIndex, filterUsers } from './UserSearch'
import type { SearchableUser } from './UserSearch'

const USERS: readonly SearchableUser[] = [
  { name: 'Lê Thanh Duy', email: 'duy@pion.vn' },
  { name: 'Nguyễn Văn An', email: 'an.nguyen@pion.vn' },
  { name: 'Trần Thị Bích', email: 'bich@example.com' },
]

const INDEX = buildUserSearchIndex(USERS)
const namesFor = (query: string): string[] => filterUsers(USERS, INDEX, query).map((user) => user.name)

describe('filterUsers', () => {
  it('rỗng thì trả nguyên danh sách', () => {
    assert.deepEqual(namesFor(''), USERS.map((user) => user.name))
  })

  it('tìm theo tên không cần gõ dấu', () => {
    assert.deepEqual(namesFor('thanh duy'), ['Lê Thanh Duy'])
  })

  it('tìm theo email', () => {
    assert.deepEqual(namesFor('example'), ['Trần Thị Bích'])
  })

  it('mọi từ đều phải khớp', () => {
    assert.deepEqual(namesFor('pion nguyen'), ['Nguyễn Văn An'])
    assert.deepEqual(namesFor('pion zzz'), [])
  })
})
