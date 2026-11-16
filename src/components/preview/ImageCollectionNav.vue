<script setup lang="ts">
/**
 * 图片集合文件区（多图预览会话）：底部文件浏览器，列表 / 网格两种视图，
 * 大中小三档缩略图，搜索、折叠、显示预览。与主文件浏览器同一组织方式。
 *
 * - 列表/网格切换 + S/M/L 尺寸即时生效；多文件夹时按文件夹分节。
 * - 当前项高亮并自动滚入可视区；缩略图复用 useThumbnailStore（webp，并发受限 +
 *   缓存），当前窗口即时预热 + IntersectionObserver 懒加载长尾。
 * - 文件区不显示滚动条（滚轮/触控板仍可滚动），保留搜索。
 * - 折叠由上层 PreviewImageContent 拥有（与预览关闭互斥）；折叠时预览用 ←/→ 导航。
 * 跳转复用上层 goTo（含未保存标注守卫）。
 *
 * 文件管理（fileOps 控制器由 PreviewView 下传）：
 * - 多选：单击 = 跳转预览 + 单选；⌘/Ctrl 单击 = 切换选中（不跳转）；Shift 单击 =
 *   按当前筛选顺序范围选（不跳转）。选区（蓝环/浅蓝底 + ✓ 徽标）区别于当前预览项。
 * - 右键菜单（FinderContextMenu）：定位（新 tab 打开所在文件夹并选中）/拷贝/剪切/
 *   制作副本/重新命名/全选/移到废纸篓/立即删除，按设备能力门控。
 * - 键盘（焦点在本面板内时）：⌘A 全选 · ⌘C/X 拷贝/剪切 · D 制作副本 ·
 *   ⌫/⌥⌫ 删除（废纸篓/永久）· Esc 取消选择。
 */
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { FileInfo } from '@/types'
import type { DeviceCapabilities } from '@/types/fileOperation'
import { useThumbnailStore } from '@/stores/thumbnail'
import { useDevicesStore } from '@/stores/devices'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import type { CollectionFileOps } from '@/composables/useCollectionFileOps'
import { parseCollectionKey } from '@/utils/imageCollection'
import { t } from '@/i18n'
import AppIcon from '../AppIcon.vue'
import FinderContextMenu, { type FinderMenuItem } from '../menu/FinderContextMenu.vue'

const props = defineProps<{
  files: FileInfo[]
  index: number
  deviceId: string
  collectionKey: string
  /** 分栏方向：决定折叠箭头朝向与布局切换按钮图标。 */
  orientation: 'vertical' | 'horizontal'
  /** 文件管理控制器（拷贝/剪切/副本/定位/重命名/删除）；缺省时退化为纯导航。 */
  fileOps?: CollectionFileOps | null
}>()
const emit = defineEmits<{ go: [index: number]; collapse: []; toggleOrientation: [] }>()

const thumbStore = useThumbnailStore()
const devicesStore = useDevicesStore()

const filter = ref('')
const view = ref<'grid' | 'list'>('grid')
const size = ref<'s' | 'm' | 'l'>('m')

/** 原始索引保留：跳转按完整 files 索引（与顶栏 n/n 一致），筛选只影响显示。 */
const indexed = computed(() => props.files.map((file, i) => ({ file, i })))
const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return indexed.value
  return indexed.value.filter(x => (x.file.name + ' ' + x.file.path).toLowerCase().includes(q))
})

/** 集合根目录：从 collectionKey（deviceId:folderPath:mode）解析，用于分节相对标题。 */
const root = computed(() => parseCollectionKey(props.collectionKey)?.root ?? '')
function dirOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx > 0 ? path.slice(0, idx) : '/'
}
function folderLabel(dir: string): string {
  const r = root.value
  if (r && dir === r) return dir.split('/').pop() || dir
  if (r && dir.startsWith(r + '/')) return dir.slice(r.length + 1)
  return dir.split('/').pop() || dir
}
const groups = computed(() => {
  const list = filtered.value
  const map = new Map<string, typeof list>()
  for (const x of list) {
    const d = dirOf(x.file.path)
    if (!map.has(d)) map.set(d, [])
    map.get(d)!.push(x)
  }
  return [...map.entries()].map(([dir, items]) => ({ dir, label: folderLabel(dir), items }))
})

// ── 多选选区（路径集合；区别于「当前预览项」index 高亮） ──────────────────────
const rootRef = ref<HTMLElement | null>(null)
const selected = ref<Set<string>>(new Set())
const anchorPath = ref<string | null>(null)
const selectedCount = computed(() => selected.value.size)
function isSelected(path: string): boolean {
  return selected.value.has(path)
}
function clearSelection() {
  selected.value = new Set()
}
function selectAll() {
  selected.value = new Set(filtered.value.map(x => x.file.path))
  anchorPath.value = filtered.value[0]?.file.path ?? null
}

type IndexedFile = { file: FileInfo; i: number }
function onItemClick(it: IndexedFile, e: MouseEvent) {
  const path = it.file.path
  // ⌘/Ctrl 单击：切换选中，不动预览（Finder 加选语义）
  if (e.metaKey || e.ctrlKey) {
    if (selected.value.has(path)) selected.value.delete(path)
    else selected.value.add(path)
    anchorPath.value = path
    return
  }
  // Shift 单击：按当前筛选顺序范围选（替换选区），不动预览
  if (e.shiftKey && anchorPath.value) {
    const list = filtered.value
    const a = list.findIndex(x => x.file.path === anchorPath.value)
    const b = list.findIndex(x => x.i === it.i)
    if (a >= 0 && b >= 0) {
      const [lo, hi] = a < b ? [a, b] : [b, a]
      selected.value = new Set(list.slice(lo, hi + 1).map(x => x.file.path))
      return
    }
  }
  // 普通单击：跳转预览 + 单选
  selected.value = new Set([path])
  anchorPath.value = path
  emit('go', it.i)
}

// 列表变化（删除/改名/重扫）后修剪选区，防悬空路径
watch(() => props.files, files => {
  const present = new Set(files.map(f => f.path))
  for (const p of [...selected.value]) {
    if (!present.has(p)) selected.value.delete(p)
  }
  if (anchorPath.value && !present.has(anchorPath.value)) anchorPath.value = null
})

// ── 右键菜单（FinderContextMenu；能力门控，未知能力时放行由任务层兜底） ────────
const capabilities = ref<DeviceCapabilities | null>(null)
const menu = reactive({ visible: false, x: 0, y: 0, items: [] as FinderMenuItem[] })

function buildMenu(background: boolean): FinderMenuItem[] {
  const caps = capabilities.value
  const n = selected.value.size
  const divider: FinderMenuItem = { label: '---', action: '__divider__' }
  const items: FinderMenuItem[] = []
  if (background || n === 0 || !props.fileOps) {
    items.push({ label: t('fileList.menu.selectAll'), action: 'select-all', shortcut: '⌘A', icon: 'check' })
    return items
  }
  items.push({ label: t('preview.collection.locate'), action: 'reveal', icon: 'focus', disabled: n !== 1 })
  items.push(divider)
  if (caps?.canCopyFrom !== false) items.push({ label: t('fileList.menu.copy'), action: 'copy', shortcut: '⌘C', icon: 'copy' })
  if (caps?.canMoveFrom !== false) items.push({ label: t('fileList.menu.cut'), action: 'cut', shortcut: '⌘X', icon: 'cut' })
  if (caps?.canCopy !== false) items.push({ label: t('fileList.menu.duplicate'), action: 'duplicate', shortcut: '⌘D', icon: 'duplicates' })
  if (n === 1 && caps?.canRename !== false) items.push({ label: t('fileList.menu.rename'), action: 'rename', icon: 'rename' })
  items.push(divider)
  items.push({ label: t('fileList.menu.selectAll'), action: 'select-all', shortcut: '⌘A', icon: 'check' })
  if (caps?.canDelete !== false) {
    items.push(divider)
    items.push({ label: t('fileList.menu.moveToTrash'), action: 'trash', shortcut: '⌘⌫', icon: 'trash' })
    items.push({ label: t('preview.collection.deletePermanently'), action: 'delete', shortcut: '⌥⌘⌫', icon: 'trash' })
  }
  return items
}

function openMenu(e: MouseEvent, background: boolean) {
  menu.x = e.clientX
  menu.y = e.clientY
  menu.items = buildMenu(background)
  menu.visible = true
}
function onItemContextMenu(it: IndexedFile, e: MouseEvent) {
  // 右键未选中项 → 先单选它（Finder 语义）；已在选区内 → 保持多选
  if (!selected.value.has(it.file.path)) {
    selected.value = new Set([it.file.path])
    anchorPath.value = it.file.path
  }
  openMenu(e, false)
}
function onBackgroundContextMenu(e: MouseEvent) {
  openMenu(e, true)
}
function closeMenu() {
  menu.visible = false
}
function onMenuSelect(action: string) {
  menu.visible = false
  const ops = props.fileOps
  const paths = [...selected.value]
  switch (action) {
    case 'select-all': selectAll(); break
    case 'reveal': if (paths.length === 1) ops?.reveal(paths[0]); break
    case 'copy': ops?.copy(paths); break
    case 'cut': ops?.cut(paths); break
    case 'duplicate': ops?.duplicate(paths); break
    case 'rename': if (paths.length === 1) ops?.requestRename(paths[0]); break
    case 'trash': ops?.requestDelete(paths, false); break
    case 'delete': ops?.requestDelete(paths, true); break
  }
  // 菜单浮层卸载后焦点会落到 body：收回面板，键盘快捷键继续可用
  void nextTick(() => rootRef.value?.focus())
}

// 外点/失焦关闭（菜单内部 click 被 FinderContextMenu @click.stop 拦截；
// 用 click 而非 mousedown——后者会在菜单项 click 落地前卸载浮层）。
// 不随内容滚动关闭：菜单是视口 fixed 浮层，且当前项平滑滚动动画会误关刚开的菜单。
function onDocumentClick() {
  if (menu.visible) closeMenu()
}

// ── 键盘（焦点在本面板内且非文本输入时消费；菜单/对话框各自的拦截器 LIFO 优先） ──
useKeyInterceptor(e => {
  if (!props.fileOps || menu.visible) return
  const active = document.activeElement as HTMLElement | null
  if (!rootRef.value || !active || !rootRef.value.contains(active)) return
  if (active.closest('input, textarea, [contenteditable="true"]')) return
  const mod = e.metaKey || e.ctrlKey
  const key = e.key.toLowerCase()
  const paths = [...selected.value]
  if (mod && key === 'a') {
    e.preventDefault()
    selectAll()
    return true
  }
  if (paths.length === 0) return
  if (mod && key === 'c') {
    e.preventDefault()
    props.fileOps.copy(paths)
    return true
  }
  if (mod && key === 'x') {
    e.preventDefault()
    props.fileOps.cut(paths)
    return true
  }
  if (mod && key === 'd') {
    e.preventDefault()
    props.fileOps.duplicate(paths)
    return true
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    props.fileOps.requestDelete(paths, e.altKey)
    return true
  }
  if (e.key === 'Escape' && selected.value.size > 0) {
    clearSelection()
    return true
  }
  return
})

// ── 缩略图懒加载（复用 thumbnail store；webp data URL；'' = 已尝试无图 sentinel） ──
const thumbUrls = ref<Map<string, string>>(new Map())
const pending = new Set<string>()
function thumbUrl(file: FileInfo): string | null {
  return thumbUrls.value.get(file.path) || null
}
async function ensureThumb(file: FileInfo) {
  const key = file.path
  if (thumbUrls.value.has(key) || pending.has(key)) return
  pending.add(key)
  try {
    const b64 = await thumbStore.getThumbnail(props.deviceId, file, size.value === 'l' ? 'large' : 'small')
    thumbUrls.value.set(key, b64 ? `data:image/webp;base64,${b64}` : '')
  } catch {
    thumbUrls.value.set(key, '')
  } finally {
    pending.delete(key)
  }
}
function onThumbError(file: FileInfo) {
  thumbUrls.value.set(file.path, '')
}
/** 即时预热当前项及邻近缩略图（不依赖滚动/视口）；长尾由 IntersectionObserver 懒加载。 */
function eagerLoad() {
  const list = filtered.value
  if (!list.length) return
  const pos = Math.max(0, list.findIndex(x => x.i === props.index))
  for (let k = Math.max(0, pos - 8); k <= Math.min(list.length - 1, pos + 16); k++) void ensureThumb(list[k].file)
}

let io: IntersectionObserver | null = null
const bodyRef = ref<HTMLElement | null>(null)
function refreshObserver() {
  if (!io) return
  io.disconnect()
  bodyRef.value?.querySelectorAll<HTMLElement>('.icn-frame[data-path]').forEach(el => io!.observe(el))
}
function scrollActive() {
  const active = bodyRef.value?.querySelector<HTMLElement>('.icn-item.active')
  active?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}
function fmtSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

watch(() => props.index, () => nextTick(() => { scrollActive(); eagerLoad() }))
watch([groups, view, size], () => nextTick(() => { refreshObserver(); scrollActive(); eagerLoad() }), { flush: 'post' })

onMounted(() => {
  io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const path = (entry.target as HTMLElement).dataset.path
      const file = props.files.find(f => f.path === path)
      if (file) void ensureThumb(file)
      io?.unobserve(entry.target)
    }
  }, { root: null, rootMargin: '300px' })
  refreshObserver()
  eagerLoad()
  nextTick(scrollActive)
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('contextmenu', onDocumentClick)
  window.addEventListener('blur', closeMenu)
  if (props.fileOps) {
    devicesStore.getDeviceCapabilities(props.deviceId)
      .then(caps => { capabilities.value = caps })
      .catch(() => { capabilities.value = null })
  }
})
onUnmounted(() => {
  io?.disconnect()
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('contextmenu', onDocumentClick)
  window.removeEventListener('blur', closeMenu)
})
</script>

<template>
  <div ref="rootRef" class="icn-pane h-full flex flex-col min-h-0" tabindex="-1">
    <!-- 标题栏：折叠钮 + 计数 ‥ 显示预览 / 搜索 / 视图 / 尺寸 -->
    <div class="icn-head">
      <span class="icn-dot"></span>
      <span class="icn-title">{{ $t('preview.collection.title') }}</span>
      <span class="icn-sub">{{ $t('preview.collection.count', { n: filtered.length }) }}<template v-if="groups.length > 1"> · {{ $t('preview.collection.folderCount', { n: groups.length }) }}</template></span>
      <span v-if="selectedCount > 0" class="icn-selchip" data-testid="icn-selection-chip">
        {{ $t('preview.collection.selectedCount', { n: selectedCount }) }}
        <button class="icn-selclear" :title="$t('preview.collection.clearSelection')" :aria-label="$t('preview.collection.clearSelection')" @click="clearSelection"><AppIcon name="x" class="w-3 h-3" /></button>
      </span>
      <div class="icn-spacer"></div>

      <div class="icn-search" :class="{ has: filter }">
        <AppIcon name="search" class="w-3.5 h-3.5" />
        <input v-model="filter" :placeholder="$t('preview.collection.filterPlaceholder')" :aria-label="$t('preview.collection.filterPlaceholder')" />
        <button v-if="filter" class="icn-clr" :aria-label="$t('preview.collection.clearFilter')" @click="filter = ''"><AppIcon name="x" class="w-3 h-3" /></button>
      </div>
      <button class="icn-btn" :title="orientation === 'vertical' ? $t('preview.collection.layoutHorizontal') : $t('preview.collection.layoutVertical')" :aria-label="orientation === 'vertical' ? $t('preview.collection.layoutHorizontal') : $t('preview.collection.layoutVertical')" @click="emit('toggleOrientation')">
        <AppIcon :name="orientation === 'vertical' ? 'panelLeft' : 'panelBottom'" class="w-4 h-4" />
      </button>
      <div class="icn-seg" role="group">
        <button :class="{ on: view === 'list' }" :title="$t('preview.collection.viewList')" :aria-pressed="view === 'list'" @click="view = 'list'"><AppIcon name="list" class="w-4 h-4" /></button>
        <button :class="{ on: view === 'grid' }" :title="$t('preview.collection.viewGrid')" :aria-pressed="view === 'grid'" @click="view = 'grid'"><AppIcon name="layoutGrid" class="w-4 h-4" /></button>
      </div>
      <div class="icn-seg icn-size" role="group">
        <button :class="{ on: size === 's' }" :aria-pressed="size === 's'" @click="size = 's'">{{ $t('preview.collection.sizeSmall') }}</button>
        <button :class="{ on: size === 'm' }" :aria-pressed="size === 'm'" @click="size = 'm'">{{ $t('preview.collection.sizeMedium') }}</button>
        <button :class="{ on: size === 'l' }" :aria-pressed="size === 'l'" @click="size = 'l'">{{ $t('preview.collection.sizeLarge') }}</button>
      </div>
      <button class="icn-btn" :title="$t('preview.collection.collapseFiles')" :aria-label="$t('preview.collection.collapseFiles')" @click="emit('collapse')">
        <AppIcon :name="orientation === 'horizontal' ? 'chevronRight' : 'chevronDown'" class="w-4 h-4" />
      </button>
    </div>

    <!-- 文件体：列表 / 网格（无可见滚动条，滚轮可滚） -->
    <div
      ref="bodyRef"
      class="icn-body"
      :class="[view, 'sz-' + size]"
      @contextmenu.prevent="onBackgroundContextMenu"
      @click.self="clearSelection"
    >
      <template v-if="filtered.length">
        <section v-for="g in groups" :key="g.dir" class="icn-section">
          <div v-if="groups.length > 1" class="icn-section-head"><AppIcon name="folder" class="w-3.5 h-3.5" />{{ g.label }}<span class="icn-section-count">{{ g.items.length }}</span></div>

          <!-- 网格 -->
          <div v-if="view === 'grid'" class="icn-grid">
            <button
              v-for="it in g.items"
              :key="it.file.path"
              class="icn-item icn-cell"
              :class="{ active: it.i === index, selected: isSelected(it.file.path) }"
              :data-path="it.file.path"
              :data-selected="isSelected(it.file.path) || undefined"
              :title="$t('preview.collection.jumpTip', { name: it.file.name })"
              @click="onItemClick(it, $event)"
              @contextmenu.prevent.stop="onItemContextMenu(it, $event)"
            >
              <span class="icn-frame icn-cell-ph" :data-path="it.file.path">
                <img v-if="thumbUrl(it.file)" :src="thumbUrl(it.file)!" alt="" loading="lazy" @error="onThumbError(it.file)" />
                <span v-else class="icn-ph"><AppIcon name="image" class="w-6 h-6" /></span>
                <span class="icn-idx">{{ it.i + 1 }}</span>
                <span v-if="isSelected(it.file.path)" class="icn-check"><AppIcon name="check" class="w-2.5 h-2.5" :stroke="3" /></span>
              </span>
              <span class="icn-cell-name">{{ it.file.name }}</span>
            </button>
          </div>

          <!-- 列表 -->
          <div v-else class="icn-list">
            <button
              v-for="it in g.items"
              :key="it.file.path"
              class="icn-item icn-row"
              :class="{ active: it.i === index, selected: isSelected(it.file.path) }"
              :data-path="it.file.path"
              :data-selected="isSelected(it.file.path) || undefined"
              :title="$t('preview.collection.jumpTip', { name: it.file.name })"
              @click="onItemClick(it, $event)"
              @contextmenu.prevent.stop="onItemContextMenu(it, $event)"
            >
              <span class="icn-frame icn-row-thumb" :data-path="it.file.path">
                <img v-if="thumbUrl(it.file)" :src="thumbUrl(it.file)!" alt="" loading="lazy" @error="onThumbError(it.file)" />
                <span v-else class="icn-ph"><AppIcon name="image" class="w-4 h-4" /></span>
                <span v-if="isSelected(it.file.path)" class="icn-check icn-check-sm"><AppIcon name="check" class="w-2 h-2" :stroke="3" /></span>
              </span>
              <span class="icn-row-name">{{ it.file.name }}</span>
              <span class="icn-row-folder">{{ folderLabel(dirOf(it.file.path)) }}</span>
              <span class="icn-row-size">{{ fmtSize(it.file.size) }}</span>
              <span class="icn-row-idx">{{ it.i + 1 }}</span>
            </button>
          </div>
        </section>
      </template>
      <div v-else class="icn-empty">
        <AppIcon name="search" class="w-7 h-7" />{{ $t('preview.collection.empty', { query: filter }) }}
        <button class="icn-textbtn" @click="filter = ''">{{ $t('preview.collection.clearFilter') }}</button>
      </div>
    </div>

    <!-- 右键菜单（Teleport 到 shell 浮层层；定位/钳制/键盘导航在组件内） -->
    <FinderContextMenu
      v-if="menu.visible"
      :items="menu.items"
      :x="menu.x"
      :y="menu.y"
      @select="onMenuSelect"
      @close="closeMenu"
    />
  </div>
</template>

<style scoped>
.icn-pane { background: var(--finder-chrome); border-top: 1px solid var(--finder-divider); outline: none; }

.icn-head {
  flex: none; display: flex; align-items: center; gap: 8px;
  height: 38px; padding: 0 12px;
  font-size: 11px; color: var(--finder-secondary-label);
  backdrop-filter: saturate(150%) blur(18px); -webkit-backdrop-filter: saturate(150%) blur(18px);
}
.icn-dot { width: 6px; height: 6px; border-radius: 99px; background: var(--finder-selection); flex: none; }
.icn-title { font-weight: 600; color: var(--finder-label); font-size: 12px; }
.icn-sub { font-variant-numeric: tabular-nums; white-space: nowrap; }
.icn-spacer { flex: 1; }

/* 选区计数 chip（多选时出现；✕ 一键取消） */
.icn-selchip {
  display: inline-flex; align-items: center; gap: 4px;
  height: 20px; padding: 0 4px 0 8px; border-radius: 99px;
  background: color-mix(in srgb, var(--finder-selection) 16%, transparent);
  color: var(--finder-selection); font-size: 11px; font-weight: 600;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.icn-selclear { display: grid; place-items: center; width: 14px; height: 14px; border-radius: 99px; color: inherit; opacity: .75; }
.icn-selclear:hover { background: color-mix(in srgb, var(--finder-selection) 24%, transparent); opacity: 1; }

.icn-btn { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 7px; color: var(--finder-secondary-label); transition: background-color .14s, color .14s; }
.icn-btn:hover { background: var(--finder-control-strong); color: var(--finder-label); }
.icn-textbtn { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border-radius: 7px; background: var(--finder-control); color: var(--finder-label); font-size: 12px; font-weight: 500; white-space: nowrap; }
.icn-textbtn:hover { background: var(--finder-control-strong); }

.icn-search { display: flex; align-items: center; gap: 6px; width: 188px; height: 26px; padding: 0 8px; background: var(--finder-control); border-radius: 7px; color: var(--finder-secondary-label); }
.icn-search input { flex: 1; min-width: 0; border: 0; background: none; outline: none; font-size: 12px; color: var(--finder-label); }
.icn-search input::placeholder { color: var(--finder-secondary-label); opacity: .8; }
.icn-clr { display: grid; place-items: center; width: 16px; height: 16px; border-radius: 99px; color: var(--finder-secondary-label); }
.icn-clr:hover { background: var(--finder-control-strong); color: var(--finder-label); }

.icn-seg { display: flex; gap: 2px; padding: 2px; background: var(--finder-control); border-radius: 8px; }
.icn-seg button { display: grid; place-items: center; height: 22px; min-width: 26px; padding: 0 6px; border-radius: 6px; color: var(--finder-secondary-label); font-size: 11px; font-weight: 600; transition: background-color .14s, color .14s; }
.icn-seg button:hover { color: var(--finder-label); }
.icn-seg button.on { background: var(--finder-list-header); color: var(--finder-label); box-shadow: 0 1px 2px rgba(0,0,0,.12); }
.icn-size button { min-width: 24px; }

/* 文件体：隐藏滚动条（滚轮/触控板仍可滚动）；禁文本选（Shift 范围选不拖蓝） */
.icn-body { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 12px 16px; scrollbar-width: none; -ms-overflow-style: none; user-select: none; -webkit-user-select: none; }
.icn-body::-webkit-scrollbar { width: 0; height: 0; display: none; }
.icn-body.sz-s { --cell: 92px; --rt: 30px; }
.icn-body.sz-m { --cell: 138px; --rt: 44px; }
.icn-body.sz-l { --cell: 196px; --rt: 60px; }

.icn-section { margin-bottom: 14px; }
.icn-section:last-child { margin-bottom: 0; }
.icn-section-head { display: flex; align-items: center; gap: 6px; padding: 4px 2px 8px; font-size: 11.5px; font-weight: 600; color: var(--finder-secondary-label); }
.icn-section-head .app-icon { color: var(--finder-selection); }
.icn-section-count { font-weight: 500; opacity: .7; font-variant-numeric: tabular-nums; }

/* 网格 */
.icn-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--cell), 1fr)); gap: 12px; }
.icn-cell { display: flex; flex-direction: column; gap: 6px; text-align: center; }
.icn-cell-ph { width: 100%; aspect-ratio: 4 / 5; }
.icn-cell-name { font-size: 11px; color: var(--finder-secondary-label); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icn-cell.selected .icn-cell-name { color: var(--finder-selection); font-weight: 600; }
.icn-cell.active .icn-cell-name { color: var(--finder-selection); font-weight: 600; }

/* 列表 */
.icn-list { display: flex; flex-direction: column; gap: 2px; }
.icn-row { display: flex; align-items: center; gap: 10px; padding: 5px 8px; border-radius: 8px; text-align: left; transition: background-color .12s; }
.icn-row:hover { background: var(--finder-row-hover); }
.icn-row.selected { background: color-mix(in srgb, var(--finder-selection) 16%, transparent); }
.icn-row.active { background: var(--finder-selection); }
.icn-row-thumb { width: var(--rt); height: var(--rt); flex: none; border-radius: 6px; }
.icn-row-name { flex: 1; min-width: 0; font-size: 12.5px; color: var(--finder-label); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icn-row-folder { flex: none; max-width: 200px; font-size: 11px; color: var(--finder-secondary-label); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icn-row-size { flex: none; width: 64px; text-align: right; font-size: 11px; color: var(--finder-secondary-label); font-variant-numeric: tabular-nums; }
.icn-row-idx { flex: none; width: 26px; text-align: right; font-size: 11px; color: var(--finder-secondary-label); font-variant-numeric: tabular-nums; opacity: .7; }
.icn-row.active .icn-row-name, .icn-row.active .icn-row-folder, .icn-row.active .icn-row-size, .icn-row.active .icn-row-idx { color: #fff; }
.icn-row.active .icn-row-folder, .icn-row.active .icn-row-size { opacity: .85; }

/* 缩略图框 */
.icn-frame { position: relative; display: block; overflow: hidden; border-radius: 9px; background: var(--finder-control); box-shadow: inset 0 0 0 1px var(--finder-divider); transition: box-shadow .16s, transform .16s; }
.icn-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
.icn-ph { position: absolute; inset: 0; display: grid; place-items: center; color: var(--finder-secondary-label); opacity: .5; }
.icn-cell:hover .icn-frame { transform: translateY(-3px); box-shadow: inset 0 0 0 1px var(--finder-divider), 0 6px 16px rgba(0,0,0,.18); }
.icn-cell.selected .icn-frame { box-shadow: 0 0 0 2px color-mix(in srgb, var(--finder-selection) 60%, transparent), 0 4px 12px rgba(0,0,0,.14); }
.icn-cell.active .icn-frame { box-shadow: 0 0 0 3px var(--finder-selection), 0 6px 16px rgba(0,0,0,.2); }
.icn-row.active .icn-frame { box-shadow: inset 0 0 0 1px rgba(255,255,255,.4); }
.icn-idx { position: absolute; top: 5px; left: 5px; font-size: 9px; font-weight: 700; color: #fff; background: rgba(0,0,0,.5); padding: 1px 5px; border-radius: 99px; font-variant-numeric: tabular-nums; backdrop-filter: blur(4px); }
.icn-cell.active .icn-idx { background: var(--finder-selection); }

/* 选中 ✓ 徽标（右上角；与左上角序号徽标对称） */
.icn-check {
  position: absolute; top: 5px; right: 5px;
  width: 16px; height: 16px; border-radius: 99px;
  display: grid; place-items: center;
  background: var(--finder-selection); color: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,.35);
}
.icn-check-sm { width: 13px; height: 13px; top: 3px; right: 3px; }

.icn-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; height: 100%; color: var(--finder-secondary-label); font-size: 12px; }

@media (prefers-reduced-motion: reduce) {
  .icn-frame, .icn-row { transition: none; }
}
</style>