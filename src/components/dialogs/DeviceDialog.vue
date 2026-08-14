<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-modal animate-fade-in" @click.self="$emit('close')">
    <div class="bg-bg-secondary rounded-lg shadow-xl w-96 p-4 border border-border">
      <h3 class="text-lg font-medium mb-4 text-text-primary">{{ dialogTitle }}</h3>

      <div class="grid gap-4 mb-4">
        <div class="flex items-center gap-2">
          <label class="text-sm w-20 text-text-secondary">Type:</label>
          <select v-model="form.type" class="flex-1 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary cursor-pointer focus:outline-none focus:border-accent-blue transition-colors">
            <option value="smb">SMB</option>
            <option value="ssh">SSH/SFTP</option>
            <option value="webdav">WebDAV (HTTP/HTTPS)</option>
          </select>
        </div>

        <!-- SMB Fields -->
        <template v-if="form.type === 'smb'">
          <div class="flex items-center gap-2">
            <label class="text-sm w-20 text-text-secondary">Host:</label>
            <input v-model="form.host" type="text" class="flex-1 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors" placeholder="192.168.1.100" />
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm w-20 text-text-secondary">Share:</label>
            <input v-model="form.share" type="text" class="flex-1 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors" placeholder="shared_folder" />
          </div>
        </template>

        <!-- WebDAV Fields -->
        <template v-if="form.type === 'webdav'">
          <div class="flex items-center gap-2">
            <label class="text-sm w-20 text-text-secondary">URL:</label>
            <input v-model="form.url" type="url" class="flex-1 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors" placeholder="https://server.example.com/dav/" />
          </div>
        </template>

        <!-- SSH Fields -->
        <template v-if="form.type === 'ssh'">
          <div class="flex items-center gap-2">
            <label class="text-sm w-20 text-text-secondary">Host:</label>
            <input v-model="form.host" type="text" class="flex-1 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors" placeholder="192.168.1.100" />
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm w-20 text-text-secondary">Port:</label>
            <input v-model="form.port" type="number" class="w-20 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors" placeholder="22" />
          </div>
        </template>

        <!-- Common Fields -->
        <div class="flex items-center gap-2">
          <label class="text-sm w-24 text-text-secondary">Name:</label>
          <input v-model="form.name" type="text" class="flex-1 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors" placeholder="My Server" />
        </div>
        <div class="flex items-center gap-2">
          <label class="text-sm w-24 text-text-secondary">Username:</label>
          <input v-model="form.username" type="text" class="flex-1 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors" />
        </div>
        <div class="flex items-center gap-2">
          <label class="text-sm w-24 text-text-secondary">Password:</label>
          <input v-model="form.password" type="password" class="flex-1 h-8 px-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors" />
        </div>
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <button
          class="px-3 py-1.5 rounded text-sm text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer"
          @click="$emit('close')"
        >
          Cancel
        </button>
        <button
          class="px-3 py-1.5 rounded bg-accent-blue hover:bg-accent-blue-hover text-sm text-white transition-colors cursor-pointer"
          @click="handleConnect"
        >
          Connect
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue'

const props = defineProps<{
  type?: 'smb' | 'ssh' | 'webdav'
}>()

const emit = defineEmits<{
  close: []
  connect: [config: { type: 'smb' | 'ssh' | 'webdav'; name: string; host: string; url?: string; port?: number; username?: string; password?: string; share?: string }]
}>()

const dialogTitle = computed(() => {
  if (props.type === 'smb') return 'Add SMB Server'
  if (props.type === 'ssh') return 'Add SSH/SFTP Server'
  return 'Add WebDAV Server'
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
    alert('请填写 SMB 主机地址和共享名称')
    return
  }
  if (form.type === 'ssh' && !form.host.trim()) {
    alert('请填写 SSH/SFTP 主机地址')
    return
  }
  if (form.type === 'webdav' && !form.url.trim()) {
    alert('请填写 WebDAV HTTP/HTTPS 地址')
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
