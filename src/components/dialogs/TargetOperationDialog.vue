<template>
  <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/45" @click.self="$emit('close')">
    <form class="w-[420px] rounded-xl border border-border bg-bg-secondary p-5 shadow-2xl" @submit.prevent="confirm">
      <h2 class="text-base font-semibold text-text-primary">{{ $t(mode === 'copy' ? 'dialogs.targetOperation.titleCopy' : 'dialogs.targetOperation.titleMove', count) }}</h2>
      <p class="mt-1 text-sm text-text-tertiary">{{ $t('dialogs.targetOperation.desc') }}</p>
      <label class="mt-4 block text-xs font-medium text-text-secondary">{{ $t('dialogs.targetOperation.deviceLabel') }}</label>
      <select v-model="deviceId" class="mt-1 w-full rounded border border-border bg-bg-primary px-3 py-2 text-sm">
        <option v-for="device in devices" :key="device.id" :value="device.id">{{ device.name }}</option>
      </select>
      <label class="mt-4 block text-xs font-medium text-text-secondary">{{ $t('dialogs.targetOperation.folderLabel') }}</label>
      <input v-model.trim="targetPath" class="mt-1 w-full rounded border border-border bg-bg-primary px-3 py-2 text-sm" placeholder="/" required />
      <label class="mt-4 block text-xs font-medium text-text-secondary">{{ $t('dialogs.targetOperation.conflictLabel') }}</label>
      <select v-model="conflictStrategy" class="mt-1 w-full rounded border border-border bg-bg-primary px-3 py-2 text-sm">
        <option value="skip">{{ $t('dialogs.targetOperation.conflictSkip') }}</option>
        <option value="overwrite">{{ $t('dialogs.targetOperation.conflictOverwrite') }}</option>
        <option value="rename">{{ $t('dialogs.targetOperation.conflictRename') }}</option>
      </select>
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="rounded px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover" @click="$emit('close')">{{ $t('dialogs.targetOperation.cancel') }}</button>
        <button type="submit" class="rounded bg-accent-blue px-3 py-2 text-sm text-white disabled:opacity-50" :disabled="!deviceId || !targetPath">{{ mode === 'copy' ? $t('dialogs.targetOperation.confirmCopy') : $t('dialogs.targetOperation.confirmMove') }}</button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ConflictStrategy } from '@/types/fileOperation'

const props = defineProps<{
  mode: 'copy' | 'move'
  count: number
  devices: Array<{ id: string; name: string; path?: string }>
}>()
const emit = defineEmits<{
  close: []
  confirm: [value: { deviceId: string; targetPath: string; conflictStrategy: ConflictStrategy }]
}>()

const deviceId = ref(props.devices[0]?.id || '')
const targetPath = ref(props.devices[0]?.path || '/')
const conflictStrategy = ref<ConflictStrategy>('skip')
const selectedDevice = computed(() => props.devices.find(device => device.id === deviceId.value))
watch(selectedDevice, device => { if (device?.path) targetPath.value = device.path })
watch(() => props.devices, devices => { if (!devices.some(device => device.id === deviceId.value)) deviceId.value = devices[0]?.id || '' })

function confirm() {
  emit('confirm', { deviceId: deviceId.value, targetPath: targetPath.value, conflictStrategy: conflictStrategy.value })
}
</script>
