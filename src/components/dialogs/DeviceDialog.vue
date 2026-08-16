<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-modal animate-fade-in" @click.self="$emit('close')">
    <div class="bg-bg-secondary rounded-lg shadow-xl w-96 p-4 border border-border">
      <h3 class="text-lg font-medium mb-4 text-text-primary">{{ dialogTitle }}</h3>

      <div class="grid gap-4 mb-4">
        <div class="flex items-center gap-2">
          <label class="text-sm w-20 text-text-secondary">{{ $t('dialogs.device.type') }}</label>
          <select v-model="form.type" class="flex-1 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors">
            <option value="smb">SMB</option>
            <option value="ssh">SSH/SFTP</option>
            <option value="webdav">WebDAV (HTTP/HTTPS)</option>
          </select>
        </div>

        <!-- SMB Fields -->
        <template v-if="form.type === 'smb'">
          <div class="flex items-center gap-2">
            <label class="text-sm w-20 text-text-secondary">{{ $t('dialogs.device.host') }}</label>
            <input v-model="form.host" type="text" class="flex-1 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors" placeholder="192.168.1.100" />
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm w-20 text-text-secondary">{{ $t('dialogs.device.share') }}</label>
            <input v-model="form.share" type="text" class="flex-1 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors" placeholder="shared_folder" />
          </div>
        </template>

        <!-- WebDAV Fields -->
        <template v-if="form.type === 'webdav'">
          <div class="flex items-center gap-2">
            <label class="text-sm w-20 text-text-secondary">{{ $t('dialogs.device.url') }}</label>
            <input v-model="form.url" type="url" class="flex-1 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors" placeholder="https://server.example.com/dav/" />
          </div>
        </template>

        <!-- SSH Fields -->
        <template v-if="form.type === 'ssh'">
          <div class="flex items-center gap-2">
            <label class="text-sm w-20 text-text-secondary">{{ $t('dialogs.device.host') }}</label>
            <input v-model="form.host" type="text" class="flex-1 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors" placeholder="192.168.1.100" />
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm w-20 text-text-secondary">{{ $t('dialogs.device.port') }}</label>
            <input v-model="form.port" type="number" class="w-20 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors" placeholder="22" />
          </div>
        </template>

        <!-- Common Fields -->
        <div class="flex items-center gap-2">
          <label class="text-sm w-24 text-text-secondary">{{ $t('dialogs.device.name') }}</label>
          <input v-model="form.name" type="text" class="flex-1 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors" :placeholder="$t('dialogs.device.namePlaceholder')" />
        </div>
        <div class="flex items-center gap-2">
          <label class="text-sm w-24 text-text-secondary">{{ $t('dialogs.device.username') }}</label>
          <input v-model="form.username" type="text" class="flex-1 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors" />
        </div>
        <div class="flex items-center gap-2">
          <label class="text-sm w-24 text-text-secondary">{{ $t('dialogs.device.password') }}</label>
          <input v-model="form.password" type="password" class="flex-1 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors" />
        </div>
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <button
          class="px-3 py-1.5 rounded text-sm text-text-secondary hover:bg-bg-hover transition-colors"
          @click="$emit('close')"
        >
          {{ $t('dialogs.device.cancel') }}
        </button>
        <button
          class="px-3 py-1.5 rounded bg-accent-blue hover:bg-accent-blue-hover text-sm text-white transition-colors"
          @click="handleConnect"
        >
          {{ $t('dialogs.device.connect') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue'
import { t } from '@/i18n'

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

function handleConnect() {
  if (form.type === 'smb' && (!form.host.trim() || !form.share.trim())) {
    alert(t('dialogs.device.needSmbFields'))
    return
  }
  if (form.type === 'ssh' && !form.host.trim()) {
    alert(t('dialogs.device.needSshHost'))
    return
  }
  if (form.type === 'webdav' && !form.url.trim()) {
    alert(t('dialogs.device.needWebdavUrl'))
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
