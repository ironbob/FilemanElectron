<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'

/**
 * git 状态徽标（只读装饰）——list/grid/columns 三视图名称旁的内联小圆点。
 * 字母语义（porcelain XY → 展示优先级）：
 *   U=未跟踪(??)  A=新增  M=修改  D=删除  R=重命名  C=冲突
 * 颜色走 CSS 变量（accent-* / text-*），不硬编码 hex，双主题可读。
 */
const props = defineProps<{
  x: string
  y: string
}>()

const BADGE_PRIORITY = ['C', 'U', 'M', 'A', 'D', 'R'] as const

/** 展示字母 → CSS kind（与下方 .git-badge-* 类名一一对应）。 */
const KIND_BY_LETTER: Record<string, string> = {
  U: 'untracked',
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'conflict'
}

const badge = computed<{ letter: string; kind: string } | null>(() => {
  const { x, y } = props
  if (x === '?' && y === '?') return { letter: 'U', kind: 'untracked' }
  if (x === '!' || y === '!') return null // 忽略（.gitignore）不展示
  // 冲突组合（任一列为 D/A/U 且另一列不同步）
  const conflictPairs = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])
  if (conflictPairs.has(x + y)) return { letter: 'C', kind: 'conflict' }
  const letters = [x, y]
  for (const candidate of BADGE_PRIORITY) {
    if (candidate !== 'C' && letters.includes(candidate)) {
      return { letter: candidate, kind: KIND_BY_LETTER[candidate] }
    }
  }
  return null
})
</script>

<template>
  <span
    v-if="badge"
    class="git-badge"
    :class="`git-badge-${badge.kind}`"
    :title="t('fileList.gitBadgeTitle', { letter: badge.letter })"
  >{{ badge.letter }}</span>
</template>

<style scoped>
.git-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-left: 4px;
  border-radius: 9999px;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  flex-shrink: 0;
  user-select: none;
}
/* 未跟踪：中性蓝点（Finder 式「新增」语义） */
.git-badge-untracked {
  background: var(--accent-blue);
  color: #fff;
}
/* 修改：橙点 */
.git-badge-modified {
  background: var(--accent-orange);
  color: #fff;
}
/* 新增（已暂存新增）：绿点 */
.git-badge-added {
  background: var(--accent-green);
  color: #fff;
}
/* 删除：红点 */
.git-badge-deleted {
  background: var(--accent-red);
  color: #fff;
}
/* 重命名：紫点 */
.git-badge-renamed {
  background: var(--accent-purple);
  color: #fff;
}
/* 冲突：红底白字加粗 */
.git-badge-conflict {
  background: var(--accent-red);
  color: #fff;
  font-weight: 800;
}
</style>
