<script setup lang="ts">
import { ref, onMounted } from 'vue'
import BaseSheet from './BaseSheet.vue'

const props = defineProps<{
  filePath: string
}>()

const emit = defineEmits<{
  close: []
  confirm: [newName: string]
}>()

const newName = ref('')

onMounted(() => {
  const parts = props.filePath.split('/')
  newName.value = parts[parts.length - 1] || ''
})

function confirm() {
  if (newName.value.trim()) {
    emit('confirm', newName.value.trim())
  }
}
</script>

<template>
  <BaseSheet
    :title="$t('dialogs.rename.title')"
    glyph="edit"
    tone="var(--accent-blue)"
    :width="380"
    as="form"
    @close="emit('close')"
    @submit="confirm"
  >
    <input
      v-model="newName"
      type="text"
      class="sheet-name-input w-full"
      data-autofocus
      spellcheck="false"
    >
    <template #footer>
      <button type="button" class="finder-btn-secondary" @click="emit('close')">
        {{ $t('dialogs.rename.cancel') }}
      </button>
      <button type="submit" class="finder-btn-primary">
        {{ $t('dialogs.rename.confirm') }}
      </button>
    </template>
  </BaseSheet>
</template>