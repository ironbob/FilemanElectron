<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/45" @click.self="$emit('cancel')">
    <section class="finder-sheet w-[460px]" role="dialog" aria-modal="true" aria-labelledby="copy-title">
      <header class="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 id="copy-title" class="text-sm font-semibold">{{ $t('compare.copyDialog.title') }}</h2>
          <p class="mt-1 text-xs text-text-tertiary">{{ directionLabel }} · {{ $t('compare.copyDialog.visibleSelected', plan.items.length) }}</p>
        </div>
        <button class="toolbar-btn-enhanced" :aria-label="$t('common.close')" @click="$emit('cancel')">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-width="2" d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      <div class="space-y-4 px-5 py-4 text-sm">
        <p v-if="plan.blockedItems.length" class="rounded-lg border border-accent-orange/30 bg-accent-orange/10 p-3 text-xs text-accent-orange">
          {{ $t('compare.copyDialog.blockedNotice', plan.blockedItems.length) }}
        </p>
        <div v-if="plan.items.length" class="rounded-lg border border-border bg-bg-primary/50 p-3">
          <p class="mb-2 text-xs font-medium text-text-secondary">{{ $t('compare.copyDialog.pathsTitle') }}</p>
          <ul class="space-y-1 text-xs text-text-tertiary">
            <li v-for="item in plan.items.slice(0, 3)" :key="item.relativePath" class="truncate">{{ item.relativePath }} → {{ item.targetDirectory }}</li>
            <li v-if="plan.items.length > 3">{{ $t('compare.copyDialog.moreItems', plan.items.length - 3) }}</li>
          </ul>
        </div>
        <label class="block text-xs text-text-secondary">
          {{ $t('compare.copyDialog.conflictStrategy') }}
          <select v-model="strategy" class="mt-1.5 w-full rounded-md border border-border bg-bg-primary px-2 py-2 text-sm text-text-primary">
            <option value="skip">{{ $t('compare.copyDialog.strategySkip') }}</option>
            <option value="overwrite">{{ $t('compare.copyDialog.strategyOverwrite') }}</option>
            <option value="rename">{{ $t('compare.copyDialog.strategyRename') }}</option>
          </select>
        </label>
        <p class="text-xs text-text-tertiary">{{ $t('compare.copyDialog.queueNote') }}</p>
      </div>
      <footer class="flex justify-end gap-2 border-t border-border px-5 py-3">
        <button class="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary" @click="$emit('cancel')">{{ $t('common.cancel') }}</button>
        <button class="rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40" :disabled="!plan.items.length" @click="$emit('confirm', strategy)">
          {{ $t('compare.copyDialog.confirm') }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '@/i18n'
import type { CopyConflictStrategy, DirCompareCopyPlan } from '@/types'

const props = defineProps<{ plan: DirCompareCopyPlan }>()
defineEmits<{ cancel: []; confirm: [strategy: Exclude<CopyConflictStrategy, 'ask'>] }>()
const strategy = ref<Exclude<CopyConflictStrategy, 'ask'>>('skip')
const directionLabel = computed(() => props.plan.direction === 'left-to-right'
  ? t('compare.copyDialog.directionLeftToRight')
  : t('compare.copyDialog.directionRightToLeft'))
</script>
