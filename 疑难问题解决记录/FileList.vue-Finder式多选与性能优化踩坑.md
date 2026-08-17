# FileList.vue — Finder 式多选与性能优化踩坑记录

## 一、Finder 选择行为完整规范

在实现前务必理清 macOS Finder 的行为，否则后期反复返工。

| 操作 | 行为 | anchor 是否更新 |
|------|------|----------------|
| 普通单击 | 仅选中该项，清除其他选中 | **更新** |
| 空白区域单击 | 清空所有选中 | 清除 |
| Cmd+Click | 切换该项（已选→取消，未选→加入），不影响其他 | **更新** |
| Shift+Click | 从 anchor 到当前项范围选中，**替换**当前选择 | **不更新** |
| Cmd+Shift+Click | 从 anchor 到当前项范围，**追加**到已有选择 | **不更新** |
| 空白区域拖动（rubber-band）| 框内项实时高亮选中 | 不影响 |
| Cmd+拖动 | 框选结果追加到原有选择 | 不影响 |
| 从文件项拖动 | 文件 DnD，不触发框选 | — |

**关键坑：anchor 必须独立维护。** 不能用 `selectedFiles[selectedFiles.length - 1]` 代替——多次 Shift+Click 后锚点不会跟着动，而 selectedFiles 末尾项会变。

---

## 二、Rubber-band（拖动框选）实现方案

### 核心思路

- `containerRef` 上监听 `mousedown`，通过 `target.closest('.file-item')` 区分"文件项"与"空白区域"。
- 空白区域按下 → `startRubberBand(e)`，注册 `document` 级 `mousemove` / `mouseup`（防止鼠标移出容器失效）。
- `mousemove` 更新矩形坐标（reactive，保证视觉流畅）+ 用 `requestAnimationFrame` **节流** selection 计算（每帧最多一次 `emit('select', ...)`）。
- `mouseup` 取消 rAF，`rubberBand.active = false`；若拖动距离 < 4px 视为空白点击，清空选中。

### 必须给文件行/格加标记

```html
<!-- 每个可点击的文件行/格 -->
<div class="file-item ..."  :data-file-path="file.path" ...>
```

rubber-band move 时通过 `containerRef.querySelectorAll('[data-file-path]')` 查找当前可见项，再用 `getBoundingClientRect()` 判断与选框的相交。

### 虚拟滚动兼容

`RecycleScroller` 只渲染可见项，所以 `querySelectorAll('[data-file-path]')` 只能命中当前视口内的元素。框选时如需跨越滚动区域，需另行实现自动滚动（本次未实现，作为后续增强）。

---

## 三、性能大坑

### 坑 1（最严重）：tabs store deep watch 每次选中都写 localStorage

**现象**：选中卡顿，尤其是框选时非常明显（~60fps 的 emit 直接卡成幻灯片）。

**根因**：
```
emit('select', [...])
  → tabsStore.setSelectedFiles(paneId, files)
  → pane.selectedFiles = files          ← 修改 reactive tabs ref
  → watch([tabs, activeTabId], { deep: true }) 触发
  → JSON.stringify(整个 tabs 状态) + localStorage.setItem  ← 同步！
```

`selectedFiles` 是**瞬态 UI 状态**，不需要持久化，但在 deep watch 里被一起序列化了。

**修复**：
1. `saveToStorage` 中对每个 pane 的 `selectedFiles` 写入 `[]`（剥离后再序列化）。
2. 用 300ms 防抖包装 `saveToStorage`，高频操作只触发一次写入。

```ts
// tabs.ts
function debouncedSave(state: PersistedTabState) {
  if (_saveDebounceTimer) clearTimeout(_saveDebounceTimer)
  _saveDebounceTimer = setTimeout(() => {
    saveToStorage(state)
  }, 300)
}

function saveToStorage(state: PersistedTabState) {
  const stripped = {
    ...state,
    tabs: state.tabs.map(tab => ({
      ...tab,
      panes: tab.panes.map(pane => ({ ...pane, selectedFiles: [] }))
    }))
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped))
}
```

---

### 坑 2（次要）：`getFileIconComponent` 每次渲染都创建新的 Component 对象

**现象**：选中一个文件 → 所有可见文件项重渲染 → 每项调用 `getFileIconComponent` → 返回新对象 → Vue 判断 `<component :is="...">` 类型变化 → **unmount + remount 循环**。30 个可见项 = 30 次 DOM 销毁重建，每次选中都如此。

**根因**：`createSvgIcon()` / `createPathIcon()` 在函数体内直接 `return { render() {...} }`，每次调用都是全新对象。Vue 使用对象引用判断组件类型，引用不同 → 触发重挂载。

**修复**：模块级缓存，以扩展名为 key：

```ts
const _fileIconCache = new Map<string, Component>()

function getFileIconComponent(file: FileInfo): Component {
  const key = file.isDirectory ? '__dir__' : (file.extension?.toLowerCase().replace('.', '') || '__default__')
  let comp = _fileIconCache.get(key)
  if (!comp) {
    comp = buildIcon(key)  // 原有逻辑
    _fileIconCache.set(key, comp)
  }
  return comp
}
```

同样的问题也适用于 `formatDate`——每次调用都执行 `new Date() + toLocaleDateString()`，用 `_formattedDateCache` memoize 即可。

---

### 坑 3：缩略图 IPC 在框选时大量重复触发

**现象**：框选时控制台涌现大量 `[ThumbnailStore] Calling IPC thumbnail.get for: xxx.wav`，且每次都有 elapsed 日志，说明不断重新发起请求。

**根因**：
1. `getThumbnailUrl(file, size)` 在 template 中每次渲染都被调用。
2. `loadThumbnail` 的缓存只覆盖"命中缓存"，对 IPC 返回 null 的文件**不写入**任何缓存值。
3. 下次渲染（rubberBand.currentX/Y 每帧更新触发重渲染）→ 再次调用 `loadThumbnail` → 再次 IPC。

**修复**：写入空字符串 sentinel + `has()` 检查 + 非响应式 `pendingLoads` Set 防并发：

```ts
const pendingLoads = new Set<string>()  // 非响应式

async function loadThumbnail(file, size) {
  const key = `${file.path}:${size}`
  if (thumbnailUrls.value.has(key) || pendingLoads.has(key)) return  // 命中 or 进行中
  pendingLoads.add(key)
  try {
    const base64 = await thumbnailStore.getThumbnail(...)
    thumbnailUrls.value.set(key, base64 ? `data:image/webp;base64,${base64}` : '')
    //                                                              ↑ 空串 sentinel
  } finally {
    pendingLoads.delete(key)
  }
}

function getThumbnailUrl(file, size) {
  const key = `${file.path}:${size}`
  if (thumbnailUrls.value.has(key)) {     // ← has() 识别空串 sentinel
    return thumbnailUrls.value.get(key) || null
  }
  loadThumbnail(file, size)
  return null
}
```

---

## 四、性能诊断日志

在 FileList.vue 中加入轻量诊断，方便快速定位问题：

```ts
// 监控 selectedFiles 变化频率
watch(() => props.selectedFiles, (newFiles, oldFiles) => {
  _perf.selectCount++
  const gap = performance.now() - _perf.lastSelectTime
  _perf.lastSelectTime = performance.now()
  if (_perf.selectCount > 1 && gap < 50) {
    console.log(`[FileList:Perf] selection update gap=${gap.toFixed(1)}ms size=${newFiles.length}`)
  }
}, { flush: 'sync' })

// rubber-band rAF 回调耗时
const t0 = performance.now()
// ... selection 计算 ...
const elapsed = performance.now() - t0
if (elapsed > 8) {
  console.log(`[FileList:Perf] rubber-band rAF slow: ${elapsed.toFixed(1)}ms`)
}
```

tabs store 中对超慢写入预警：
```ts
const t0 = performance.now()
localStorage.setItem(...)
if (performance.now() - t0 > 5) {
  console.warn('[TabsStore] saveToStorage took', (performance.now() - t0).toFixed(1), 'ms')
}
```

---

## 五、涉及文件

| 文件 | 改动要点 |
|------|---------|
| `src/components/FileList.vue` | anchor 逻辑、rubber-band 全实现、图标/日期 memoize、缩略图 sentinel、诊断日志 |
| `src/stores/tabs.ts` | selectedFiles 不持久化、300ms 防抖 save |

---

## 六、list 模式文件填满视口后无法框选（2026-08-17）

### 现象
list 视图下鼠标拖动无法框选（Cmd/Shift+click 多选正常）；grid 视图一切正常。

### 根因（三层叠加）
1. `handleContainerMouseDown` 只在 `!target.closest('.file-item')` 时启动框选 —— 即只有按在**非行区域**才能框选；
2. list 行是**全宽 flex 行**（icon w-6 + name flex-1 + 日期/大小/种类/权限列），行高 26px 无行距紧密堆叠。文件数 ≥ 视口容量后**内容区每一像素都属于某个 `.file-item`**（实测 emptySpaceBelowPx=0），唯一的非行区域只剩顶部表头。grid 格子间有 rowGap/columnGap、末行右侧常有空轨道，所以总能找到框选起点；
3. 行带 `draggable="true"`，从行上按下拖动触发原生 HTML5 文件拖拽，手势被吞。

### 修复（Finder 语义：拖拽热点）
- list 行模板：图标容器 + `FileNameMatchLabel` 标记 `finder-drag-hotspot`（marker 类，无样式）；行的**元数据列视为背景**；
- `handleContainerMouseDown`：list 模式下按在行内但不在热点上 → 同样 `startRubberBand(e)`。其 `e.preventDefault()` 会**抑制该按势的原生 dragstart**（Chromium 行为，实测有效）；
- `handleDragStart` 开头加 `if (rubberBand.active) { event.preventDefault(); return }` 双保险；
- **click 余波坑**：mousedown preventDefault **不会**抑制 click 派发——框选真实拖动（≥4px）后若按下/释放在同一行内，随后的 click 会触发 `handleClick` 单选冲掉框选结果。用 `suppressNextClick` 标志在 `handleRubberBandUp` 置位、`handleClick` 开头吞掉。

### 验证
- 60 文件填满视口：元数据区拖动 → 框选矩形出现、扫过行选中、dragstart=0；文件名区拖动 → dragstart 正常（跨面板拖拽传输保留）；
- 元数据区单击仍单选该行（click 未被 preventDefault 破坏）；Cmd+click/Shift+click 不受影响；grid 框选/拖拽无回归；
- `e2e/drag-transfer.spec.ts` 5/5 通过（合成 dragstart 派发在行元素上，不受热点限制影响）。
