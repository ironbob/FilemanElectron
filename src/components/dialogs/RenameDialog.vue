<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-modal animate-fade-in" @click.self="$emit('close')">
    <div class="finder-sheet p-4 w-80">
      <h3 class="text-lg font-medium mb-4 text-text-primary">{{ $t('dialogs.rename.title') }}</h3>
      <input
        v-model="newName"
        type="text"
        class="w-full h-8 px-2.5 bg-bg-tertiary border border-border rounded-md text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
        @keydown.enter="confirm"
        @keydown.escape="$emit('close')"
        autofocus
      />
      <div class="flex justify-end gap-2 mt-4">
        <button
          class="finder-btn-secondary"
          @click="$emit('close')"
        >
          {{ $t('dialogs.rename.cancel') }}
        </button>
        <button
          class="finder-btn-primary"
          @click="confirm"
        >
          {{ $t('dialogs.rename.confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{
  filePath: string
}>()

const emit = defineEmits<{
  close: []
  confirm: [newName: string]
}>()

const newName = ref('')

onMounted(() => {
  // Extract filename from path
  const parts = props.filePath.split('/')
  newName.value = parts[parts.length - 1] || ''
})

function confirm() {
  if (newName.value.trim()) {
    emit('confirm', newName.value.trim())
  }
}
</script>
