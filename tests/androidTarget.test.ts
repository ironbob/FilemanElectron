import assert from 'node:assert/strict'
import { androidSerialOf, findAndroidDevice } from '../electron/src/adapters/androidTarget'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`✓ ${name}`)
}

const DEVICES = [
  { id: 'AAA', type: 'device' },
  { id: 'BBB', type: 'device' },
  { id: 'CCC', type: 'unauthorized' },
  { id: 'DDD', type: 'offline' }
]

test('androidSerialOf：剥 android: 前缀，裸 serial 原样', () => {
  assert.equal(androidSerialOf('android:BBB'), 'BBB')
  assert.equal(androidSerialOf('BBB'), 'BBB')
})

test('指定设备（带前缀）命中对应那台，而不是第一台', () => {
  assert.equal(findAndroidDevice(DEVICES, 'android:BBB')?.id, 'BBB')
})

test('旧匹配方式对带前缀的 id 永远不命中（串号缺陷的成因）', () => {
  assert.equal(DEVICES.find(d => d.id === 'android:BBB'), undefined)
})

test('裸 serial 配置同样命中', () => {
  assert.equal(findAndroidDevice(DEVICES, 'AAA')?.id, 'AAA')
})

test('指定设备不在线 → undefined，不回退到第一台', () => {
  assert.equal(findAndroidDevice(DEVICES, 'android:ZZZ'), undefined)
})

test('unauthorized / offline 条目仍可被定位（由调用方给出引导）', () => {
  assert.equal(findAndroidDevice(DEVICES, 'android:CCC')?.type, 'unauthorized')
  assert.equal(findAndroidDevice(DEVICES, 'android:DDD')?.type, 'offline')
})

test('未指定 deviceId → 取第一台（自动模式保留既有行为）', () => {
  assert.equal(findAndroidDevice(DEVICES)?.id, 'AAA')
})

test('空列表 + 未指定 → undefined', () => {
  assert.equal(findAndroidDevice([]), undefined)
})

console.log(`androidTarget: ${passed} tests passed`)
