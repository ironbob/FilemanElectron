/**
 * JSON 路径查询 + JSON→TS interface — 最小断言 harness（M4 验证）。
 */

import assert from 'node:assert/strict'
import { parseJsonPath, queryJson } from '../src/utils/jsonQuery'
import { jsonToInterfaces } from '../src/utils/jsonToTs'

// ============ parseJsonPath ============

assert.deepEqual(parseJsonPath(''), [])
assert.deepEqual(parseJsonPath('$'), [])
assert.deepEqual(parseJsonPath('$.a.b'), ['a', 'b'])
assert.deepEqual(parseJsonPath('$.items[0]'), ['items', '0'])
assert.deepEqual(parseJsonPath('$.items[*]'), ['items', '*'])
assert.deepEqual(parseJsonPath("$['k-1']"), ['k-1'])
assert.equal(parseJsonPath('a.b'), null)     // 缺 $
assert.equal(parseJsonPath('$.a['), null)    // 未闭合

// ============ queryJson ============

const doc = {
  name: 'app',
  version: 2,
  nested: { deep: { value: 'x' } },
  items: [
    { id: 1, tag: 'a' },
    { id: 2, tag: 'b' }
  ]
}

assert.equal(queryJson(doc, '$.name').value, 'app')
assert.equal(queryJson(doc, '$.version').value, 2)
assert.equal(queryJson(doc, '$.nested.deep.value').value, 'x')
assert.deepEqual(queryJson(doc, '$.items[1]').value, { id: 2, tag: 'b' })
assert.equal(queryJson(doc, '$.items[0].id').value, 1)
assert.deepEqual(queryJson(doc, '$.items[*]').value, doc.items)
assert.deepEqual(queryJson(doc, '').value, doc)

// 错误路径（不抛异常）
assert.equal(queryJson(doc, '$.missing').ok, false)
assert.equal(queryJson(doc, '$.items[9]').ok, false)
assert.equal(queryJson(doc, '$.name.sub').ok, false)   // 标量下钻
assert.equal(queryJson(doc, '$$bad').ok, false)

// ============ jsonToInterfaces ============

const single = jsonToInterfaces({ id: 1, name: 'x', active: true, score: 1.5, meta: null })!
assert.ok(single.includes('interface Root {'))
assert.ok(single.includes('id: number;'))
assert.ok(single.includes('name: string;'))
assert.ok(single.includes('active: boolean;'))
assert.ok(single.includes('meta: null;'))

// 嵌套对象 → 独立 interface
const nested = jsonToInterfaces({ user: { name: 'a' }, extra: { note: 'n' } })!
assert.ok(nested.includes('interface RootUser {'))
assert.ok(nested.includes('user: RootUser;'))
assert.ok(nested.includes('interface RootExtra {'))

// 对象数组 → Root 即元素合并形状 + 缺失字段 optional
const arr = jsonToInterfaces([
  { id: 1, tag: 'a' },
  { id: 2 }
])!
assert.ok(arr.includes('interface Root {'))
assert.ok(arr.includes('tag?: string;'))   // 第二项缺失 → optional
assert.ok(arr.includes('id: number;'))     // 值合并为标量类型（非 number[]）

// 特殊键名加引号
const quoted = jsonToInterfaces({ 'k-1': 1, normal: 2 })!
assert.ok(quoted.includes('"k-1": number;'))

// 标量根 → null
assert.equal(jsonToInterfaces(42), null)
assert.equal(jsonToInterfaces('str'), null)
assert.equal(jsonToInterfaces(null), null)

console.log('✓ jsonQuery / jsonToTs 测试全部通过')
