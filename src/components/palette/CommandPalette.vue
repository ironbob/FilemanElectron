<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import { useCommandRegistryStore, type CommandContext } from '@/stores/commandRegistry'
import { useFavoritesStore } from '@/stores/favorites'
import { rankFuzzyMatches } from '@/utils/fuzzyMatch'
import FileNameMatchLabel from '@/components/FileNameMatchLabel.vue'

/**
 * 命令面板（⌘⇧P）—— 注册表命令 + 收藏目录 + 手输绝对路径三种入口。
 *
 * 键盘契约（疑难问题解决记录/子组件ESC键消费）：↑↓/Enter/Esc 经
 * useKeyInterceptor 捕获期消费（return true），不得落入 FileList 的
 * document 冒泡监听（否则触发 typeahead/重命名等）。
 */

const props = defineProps<{
  /** 执行上下文（App 组装：活动面板 + 导航回调）。 */
  context: CommandContext
}>()

const emit = defineEmits<{ close: [] }>()

const commandRegistry = useCommandRegistryStore()
const favoritesStore = useFavoritesStore()

const query = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const activeIndex = ref(0)
const listRef = shallowRef<HTMLElement | null>(null)

interface PaletteEntry {
  key: string
  title: string
  group: string
  shortcut?: string
  indices: number[]
  execute: () => void
}

/** 候选集合：注册命令 + 收藏目录（动态并入，不进注册表）。 */
const entries = computed<PaletteEntry[]>(() => {
  const commandEntries: PaletteEntry[] = commandRegistry.allCommands.map(command => ({
    key: `cmd:${command.id}`,
    title: command.title,
    group: command.group,
    shortcut: command.shortcut,
    indices: [],
    execute: () => { void command.run(props.context) }
  }))
  const favoriteEntries: PaletteEntry[] = favoritesStore.favorites.map(favorite => ({
    key: `fav:${favorite.deviceId}:${favorite.path}`,
    title: favorite.name,
    group: '收藏目录',
    indices: [],
    execute: () => { props.context.navigate?.(favorite.deviceId, favorite.path) }
  }))
  return [...commandEntries, ...favoriteEntries]
})

const MAX_RESULTS = 12

/** 匹配：空查询显示全部（按注册顺序）；非空做子序列评分排序。 */
const results = computed<PaletteEntry[]>(() => {
  const q = query.value.trim()
  if (!q) return entries.value.slice(0, MAX_RESULTS)
  return rankFuzzyMatches(
    entries.value,
    entry => `${entry.title} ${entry.group}`,
    q,
    MAX_RESULTS
  ).map(match => ({ ...match.item, indices: match.indices }))
})

/** 手输绝对路径跳转（当前活动面板）。 */
const typedPathNavigation = computed<(() => void) | null>(() => {
  const q = query.value.trim()
  if (!q.startsWith('/') || q.length < 2 || !props.context.navigate) return null
  return () => props.context.navigate!('local', q)
})

watch(results, () => { activeIndex.value = 0 }, { flush: 'post' })

const selectedIndexOffset = computed(() => typedPathNavigation.value ? 1 : 0)

function move(delta: number): void {
  const total = results.value.length + selectedIndexOffset.value
  if (total === 0) return
  activeIndex.value = (activeIndex.value + delta + total) % total
}

function accept(): void {
  if (typedPathNavigation.value && activeIndex.value === 0) {
    typedPathNavigation.value()
    emit('close')
    return
  }
  const entry = results.value[activeIndex.value - selectedIndexOffset.value]
  if (entry) {
    entry.execute()
    emit('close')
  }
}

// 捕获期消费面板自身按键（LIFO：面板是最新挂载的，先于 App/文档层）
useKeyInterceptor(event => {
  if (event.key === 'ArrowDown') { event.preventDefault(); move(1); return true }
  if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); return true }
  if (event.key === 'Enter') { event.preventDefault(); accept(); return true }
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return true }
  return false
})

onMounted(() => {
  void nextTick(() => inputRef.value?.focus())
})

function groupLabel(group: string): string {
  return group
}
</script>

<template>
  <div
    class="fixed inset-0 z-modal flex items-start justify-center pt-[12vh] bg-black/30"
    @click.self="emit('close')"
  >
    <div
      class="w-[560px] max-w-[86vw] rounded-xl border border-border bg-bg-secondary shadow-2xl overflow-hidden"
      role="dialog"
      aria-label="命令面板"
    >
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        class="w-full px-4 py-3 text-sm bg-transparent text-text-primary placeholder:text-text-tertiary border-b border-border focus:outline-none"
        placeholder="输入命令、收藏名称或绝对路径（/开头）…"
        spellcheck="false"
      />
      <div ref="listRef" class="max-h-[46vh] overflow-y-auto py-1">
        <!-- 手输绝对路径（置顶候选） -->
        <div
          v-if="typedPathNavigation"
          class="px-4 py-2 text-sm cursor-pointer flex items-center gap-2"
          :class="activeIndex === 0 ? 'bg-accent-blue text-white' : 'text-text-primary hover:bg-bg-hover'"
          @click="typedPathNavigation(); emit('close')"
          @mousemove="activeIndex = 0"
        >
          <span class="text-xs opacity-70">前往</span>
          <span class="truncate font-mono">{{ query.trim() }}</span>
        </div>
        <div
          v-for="(entry, index) in results"
          :key="entry.key"
          class="px-4 py-2 text-sm cursor-pointer flex items-center gap-2"
          :class="activeIndex === index + selectedIndexOffset ? 'bg-accent-blue text-white' : 'text-text-primary hover:bg-bg-hover'"
          @click="entry.execute(); emit('close')"
          @mousemove="activeIndex = index + selectedIndexOffset"
        >
          <span class="text-[10px] w-16 flex-shrink-0 truncate opacity-60">{{ groupLabel(entry.group) }}</span>
          <FileNameMatchLabel
            class="flex-1 truncate"
            :name="entry.title"
            :highlight-indices="entry.indices"
            :selected="activeIndex === index + selectedIndexOffset"
          />
          <span v-if="entry.shortcut" class="text-[10px] opacity-60 flex-shrink-0 font-mono">{{ entry.shortcut }}</span>
        </div>
        <div v-if="results.length === 0 && !typedPathNavigation" class="px-4 py-6 text-sm text-text-tertiary text-center">
          无匹配命令
        </div>
      </div>
      <div class="px-4 py-1.5 text-[10px] text-text-tertiary border-t border-border flex gap-3">
        <span>↑↓ 选择</span><span>↩ 执行</span><span>Esc 关闭</span><span>⌘⇧P 呼出</span>
      </div>
    </div>
  </div>
</template>
