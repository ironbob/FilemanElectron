<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '@/i18n'
import BaseSheet from '@/components/dialogs/BaseSheet.vue'
import type { CopyConflictStrategy, DirCompareCopyPlan } from '@/types'

const props = defineProps<{ plan: DirCompareCopyPlan }>()
const emit = defineEmits<{ cancel: []; confirm: [strategy: Exclude<CopyConflictStrategy, 'ask'>] }>()
const strategy = ref<Exclude<CopyConflictStrategy, 'ask'>>('skip')
const directionLabel = computed(() => props.plan.direction === 'left-to-right'
  ? t('compare.copyDialog.directionLeftToRight')
  : t('compare.copyDialog.directionRightToLeft'))
</script>

<template>
  <BaseSheet
    :title="$t('compare.copyDialog.title')"
    :subtitle="`${directionLabel} · ${$t('compare.copyDialog.visibleSelected', plan.items.length)}`"
    glyph="copy"
    tone="var(--accent-blue)"
    :width="460"
    :z="50"
    show-close
    @close="emit('cancel')"
  >
    <div class="flex flex-col gap-4 text-sm">
      <p v-if="plan.blockedItems.length" class="rounded-[10px] border border-accent-orange/30 bg-accent-orange/10 p-3 text-xs text-accent-orange">
        {{ $t('compare.copyDialog.blockedNotice', plan.blockedItems.length) }}
      </p>
      <div v-if="plan.items.length" class="finder-inset-group p-3">
        <p class="mb-2 text-xs font-medium text-text-secondary">{{ $t('compare.copyDialog.pathsTitle') }}</p>
        <ul class="space-y-1 text-xs text-text-tertiary">
          <li v-for="item in plan.items.slice(0, 3)" :key="item.relativePath" class="truncate">{{ item.relativePath }} → {{ item.targetDirectory }}</li>
          <li v-if="plan.items.length > 3">{{ $t('compare.copyDialog.moreItems', plan.items.length - 3) }}</li>
        </ul>
      </div>
      <label class="block text-xs text-text-secondary">
        {{ $t('compare.copyDialog.conflictStrategy') }}
        <select v-model="strategy" class="sheet-name-input mt-1.5 w-full">
          <option value="skip">{{ $t('compare.copyDialog.strategySkip') }}</option>
          <option value="overwrite">{{ $t('compare.copyDialog.strategyOverwrite') }}</option>
          <option value="rename">{{ $t('compare.copyDialog.strategyRename') }}</option>
        </select>
      </label>
      <p class="text-xs text-text-tertiary">{{ $t('compare.copyDialog.queueNote') }}</p>
    </div>
    <template #footer>
      <button type="button" class="finder-btn-secondary" @click="emit('cancel')">{{ $t('common.cancel') }}</button>
      <button type="button" class="finder-btn-primary" :disabled="!plan.items.length" @click="emit('confirm', strategy)">{{ $t('compare.copyDialog.confirm') }}</button>
    </template>
  </BaseSheet>
</template>