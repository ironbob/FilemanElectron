<script setup lang="ts">
import { reactive, computed, ref, watch } from 'vue'
import { t } from '@/i18n'
import BaseSheet from './BaseSheet.vue'

const props = defineProps<{
  type?: 'smb' | 'ssh' | 'webdav'
}>()

const emit = defineEmits<{
  close: []
  connect: [config: { type: 'smb' | 'ssh' | 'webdav'; name: string; host: string; url?: string; port?: number; username?: string; password?: string; share?: string }]
}>()

const dialogTitle = computed(() => {
  if (props.type === 'smb') return t('dialogs.device.addSmbTitle')
  if (props.type === 'ssh') return t('dialogs.device.addSshTitle')
  return t('dialogs.device.addWebdavTitle')
})

const TYPES = [
  { value: 'smb' as const, label: 'SMB' },
  { value: 'ssh' as const, label: 'SSH / SFTP' },
  { value: 'webdav' as const, label: 'WebDAV' }
]

const form = reactive({
  type: props.type || 'smb',
  name: '',
  host: '',
  port: 22,
  username: '',
  password: '',
  share: '',
  url: ''
})

// 内联校验取代原生 alert()：任何字段改动即清除错误。
const error = ref('')
watch(form, () => { error.value = '' })

function handleConnect() {
  if (form.type === 'smb' && (!form.host.trim() || !form.share.trim())) {
    error.value = t('dialogs.device.needSmbFields')
    return
  }
  if (form.type === 'ssh' && !form.host.trim()) {
    error.value = t('dialogs.device.needSshHost')
    return
  }
  if (form.type === 'webdav' && !form.url.trim()) {
    error.value = t('dialogs.device.needWebdavUrl')
    return
  }
  emit('connect', {
    type: form.type,
    name: form.name || form.host || form.url,
    host: form.host,
    url: form.url,
    port: form.port,
    username: form.username,
    password: form.password,
    share: form.share
  })
}
</script>

<template>
  <BaseSheet
    :title="dialogTitle"
    glyph="network"
    tone="var(--accent-indigo)"
    :width="440"
    as="form"
    @close="emit('close')"
    @submit="handleConnect"
  >
    <div class="flex flex-col gap-3">
      <div class="finder-seg-tray w-full" role="radiogroup" :aria-label="$t('dialogs.device.type')">
        <button
          v-for="opt in TYPES"
          :key="opt.value"
          type="button"
          class="finder-segment-btn-text flex-1"
          :class="{ active: form.type === opt.value }"
          role="radio"
          :aria-checked="form.type === opt.value"
          @click="form.type = opt.value"
        >{{ opt.label }}</button>
      </div>

      <label v-if="form.type !== 'webdav'" class="block">
        <span class="mb-1.5 block text-xs text-text-secondary">{{ $t('dialogs.device.host') }}</span>
        <input v-model="form.host" type="text" data-autofocus class="sheet-name-input w-full" placeholder="192.168.1.100" spellcheck="false">
      </label>

      <label v-if="form.type === 'smb'" class="block">
        <span class="mb-1.5 block text-xs text-text-secondary">{{ $t('dialogs.device.share') }}</span>
        <input v-model="form.share" type="text" class="sheet-name-input w-full" placeholder="shared_folder" spellcheck="false">
      </label>

      <label v-if="form.type === 'webdav'" class="block">
        <span class="mb-1.5 block text-xs text-text-secondary">{{ $t('dialogs.device.url') }}</span>
        <input v-model="form.url" type="url" data-autofocus class="sheet-name-input w-full" placeholder="https://server.example.com/dav/" spellcheck="false">
      </label>

      <label v-if="form.type === 'ssh'" class="block">
        <span class="mb-1.5 block text-xs text-text-secondary">{{ $t('dialogs.device.port') }}</span>
        <input v-model.number="form.port" type="number" class="sheet-name-input w-24" placeholder="22">
      </label>

      <label class="block">
        <span class="mb-1.5 block text-xs text-text-secondary">{{ $t('dialogs.device.name') }}</span>
        <input v-model="form.name" type="text" class="sheet-name-input w-full" :placeholder="$t('dialogs.device.namePlaceholder')" spellcheck="false">
      </label>

      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-1.5 block text-xs text-text-secondary">{{ $t('dialogs.device.username') }}</span>
          <input v-model="form.username" type="text" class="sheet-name-input w-full" spellcheck="false">
        </label>
        <label class="block">
          <span class="mb-1.5 block text-xs text-text-secondary">{{ $t('dialogs.device.password') }}</span>
          <input v-model="form.password" type="password" class="sheet-name-input w-full" autocomplete="off">
        </label>
      </div>

      <p v-if="error" class="text-xs text-accent-red">{{ error }}</p>
    </div>
    <template #footer>
      <button type="button" class="finder-btn-secondary" @click="emit('close')">{{ $t('dialogs.device.cancel') }}</button>
      <button type="submit" class="finder-btn-primary">{{ $t('dialogs.device.connect') }}</button>
    </template>
  </BaseSheet>
</template>