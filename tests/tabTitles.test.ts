/**
 * 标签标题同名消歧纯函数 — 最小断言 harness
 *
 * 仓库无测试框架；本文件经 esbuild 打包后以 node 运行（package.json
 * test:tab-titles）。不被应用代码引用，不进生产 bundle。
 *
 * 覆盖：tabTitleEntry 提取（浏览/预览/工具/zip/根/双窗格）、
 * disambiguateTabTitles 逐级升级（父 → 祖父 → 设备名 → '…' 头）、
 * 工具页排除、大小写敏感分组。
 */

import assert from 'node:assert/strict'
import { tabTitleEntry, disambiguateTabTitles, tabFullPath, tabKindOf } from '../src/utils/tabTitles'
import type { Tab } from '../src/types'
import type { FileInfo } from '../shared/types'

// ============ 构造辅助 ============

let seq = 0
function browseTab(path: string, deviceId = 'local', over: Partial<Tab> = {}): Tab {
  seq++
  return {
    id: `t${seq}`,
    title: path === '/' ? 'Root' : path.split('/').filter(Boolean).pop()!,
    panes: [{
      id: `p${seq}`, deviceId, path, history: [path], historyIndex: 0,
      viewMode: 'list', selectedFiles: [], gridSize: 'large'
    }],
    activePaneId: `p${seq}`,
    ...over
  }
}

function previewTab(path: string, name: string, deviceId = 'local'): Tab {
  seq++
  const file = { path, name, isDirectory: false, size: 10, mtime: 0 } as unknown as FileInfo
  return {
    id: `t${seq}`,
    title: name,
    panes: [],
    activePaneId: '',
    preview: { id: `s${seq}`, file, deviceId, type: 'text' }
  }
}

function toolTab(title: string, titleKey: string, over: Partial<Tab> = {}): Tab {
  seq++
  return {
    id: `t${seq}`,
    title,
    titleKey,
    titleParams: {},
    panes: [],
    activePaneId: '',
    ...over
  }
}

function prefixOf(tabs: Tab[], target: Tab, deviceName?: (id: string) => string | undefined): string | null | undefined {
  return disambiguateTabTitles(tabs.map(tabTitleEntry), deviceName).get(target.id)?.prefix
}

// ============ tabTitleEntry 提取 ============

// 浏览页：叶子 = 末段，祖先由近及远
assert.equal(tabTitleEntry(browseTab('/a/b/report')).leaf, 'report')
assert.deepEqual(tabTitleEntry(browseTab('/a/b/report')).ancestorSegments, ['b', 'a'])
// 根目录 → 'Root'，无祖先
assert.equal(tabTitleEntry(browseTab('/')).leaf, 'Root')
assert.deepEqual(tabTitleEntry(browseTab('/')).ancestorSegments, [])
// 预览页：叶子 = 文件名（含扩展名），祖先 = 路径去末段
{
  const e = tabTitleEntry(previewTab('/docs/notes.md', 'notes.md'))
  assert.equal(e.leaf, 'notes.md')
  assert.deepEqual(e.ancestorSegments, ['docs'])
  assert.equal(e.deviceId, 'local')
}
// zip 虚拟路径浏览页：内部段 + zip 宿主段
{
  const e = tabTitleEntry(browseTab('/a/b.zip::x/y'))
  assert.equal(e.leaf, 'y')
  assert.deepEqual(e.ancestorSegments, ['x', 'b.zip', 'a'])
}
// 工具页：titleKey → tool
assert.equal(tabTitleEntry(toolTab('重复文件 · x', 'tabs.title.dupes')).tool, true)
// 双窗格取活动 pane
{
  const dual: Tab = {
    id: 'dual', title: 'left',
    panes: [
      { id: 'pl', deviceId: 'local', path: '/l/dir', history: [], historyIndex: 0, viewMode: 'list', selectedFiles: [] },
      { id: 'pr', deviceId: 'nas', path: '/r/dir', history: [], historyIndex: 0, viewMode: 'list', selectedFiles: [] }
    ],
    activePaneId: 'pr'
  }
  assert.equal(tabTitleEntry(dual).deviceId, 'nas')
  assert.equal(tabTitleEntry({ ...dual, activePaneId: 'pl' }).deviceId, 'local')
}

// ============ tabFullPath / tabKindOf ============

assert.equal(tabFullPath(browseTab('/a/b')), '/a/b')
assert.equal(tabFullPath(previewTab('/docs/x.md', 'x.md')), '/docs/x.md')
assert.equal(tabKindOf(browseTab('/a')), 'browse')
assert.equal(tabKindOf(previewTab('/a.md', 'a.md')), 'preview')
assert.equal(tabKindOf(toolTab('搜索 · x', 'tabs.title.grep')), 'tool')

// ============ 消歧：逐级升级 ============

// 唯一叶子 → 无前缀
{
  const a = browseTab('/a/report'), b = browseTab('/b/other')
  assert.equal(prefixOf([a, b], a), null)
  assert.equal(prefixOf([a, b], b), null)
}

// 同叶不同父 → 双方同时升级为「父 › 叶」
{
  const a = browseTab('/a/report'), b = browseTab('/b/report')
  assert.equal(prefixOf([a, b], a), 'a')
  assert.equal(prefixOf([a, b], b), 'b')
}

// 同父同名 → 祖父级
{
  const a = browseTab('/x/a/report'), b = browseTab('/y/a/report')
  assert.equal(prefixOf([a, b], a), 'x › a')
  assert.equal(prefixOf([a, b], b), 'y › a')
}

// 层级上限：完全同路径 → '…' 头封顶
{
  const a = browseTab('/a/report'), b = browseTab('/a/report')
  assert.equal(prefixOf([a, b], a), '… › a')
  assert.equal(prefixOf([a, b], b), '… › a')
}

// 根目录同名（无祖先、同设备、无解析器）→ '…'
{
  const a = browseTab('/'), b = browseTab('/')
  assert.equal(prefixOf([a, b], a), '…')
}

// 深路径：两级封顶语义（zip 例）— 祖先用尽后走 '…'
{
  const a = browseTab('/m/n/b.zip::x/y/files'), b = browseTab('/m/n/b.zip::x/z/files')
  // 祖先：y,b.zip,x,n,m vs z,b.zip,x,n,m → 父层 y/z 已区分
  assert.equal(prefixOf([a, b], a), 'y')
  assert.equal(prefixOf([a, b], b), 'z')
}

// ============ 消歧：跨类型 / 跨设备 ============

// 预览 vs 浏览：不同叶子（notes.md vs notes）不冲突
{
  const d = browseTab('/docs/notes'), p = previewTab('/docs/notes.md', 'notes.md')
  assert.equal(prefixOf([d, p], d), null)
  assert.equal(prefixOf([d, p], p), null)
}
// 预览 vs 预览同名 → 父层升级（文件名保留扩展名）
{
  const a = previewTab('/a/notes.md', 'notes.md'), b = previewTab('/b/notes.md', 'notes.md')
  assert.equal(prefixOf([a, b], a), 'a')
  assert.equal(prefixOf([a, b], b), 'b')
}
// zip 内目录与普通目录同名 → 父层可区分
{
  const z = browseTab('/a/b.zip::x/report'), c = browseTab('/c/report')
  assert.equal(prefixOf([z, c], z), 'x')
  assert.equal(prefixOf([z, c], c), 'c')
}

// 设备名层级：祖先耗尽仍冲突且设备名可区分 → 设备名作最外层
{
  const l = browseTab('/d/files', 'local'), s = browseTab('/d/files', 'smb-1')
  const resolve = (id: string) => (id === 'local' ? '本机' : id === 'smb-1' ? 'NAS' : undefined)
  assert.equal(prefixOf([l, s], l, resolve), '本机 › d')
  assert.equal(prefixOf([l, s], s, resolve), 'NAS › d')
}
// 设备名不可区分（同名解析）→ 不引入设备层，'…' 封顶
{
  const l = browseTab('/d/files', 'local'), s = browseTab('/d/files', 'local')
  assert.equal(prefixOf([l, s], l, () => '本机'), '… › d')
}

// 工具页永不参与：即使标题与浏览页叶子同名，浏览页也不升级前缀
{
  const b = browseTab('/a/搜索'), t = toolTab('搜索', 'tabs.title.grep')
  assert.equal(prefixOf([b, t], b), null)
  assert.equal(prefixOf([b, t], t), null)
}

// 大小写敏感：Report 与 report 视为不同名
{
  const a = browseTab('/a/Report'), b = browseTab('/b/report')
  assert.equal(prefixOf([a, b], a), null)
  assert.equal(prefixOf([a, b], b), null)
}

// 三方冲突：仅冲突双方升级，第三方不动
{
  const a = browseTab('/a/files'), b = browseTab('/b/files'), c = browseTab('/c/unique')
  assert.equal(prefixOf([a, b, c], a), 'a')
  assert.equal(prefixOf([a, b, c], b), 'b')
  assert.equal(prefixOf([a, b, c], c), null)
}

console.log('[tabTitles] all assertions passed ✓')
