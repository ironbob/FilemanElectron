<template>
  <div class="h-full bg-bg-sidebar flex flex-col overflow-hidden">
    <!-- Devices Section -->
    <div class="py-3">
      <div class="px-4 mb-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">Locations</div>
      <div class="space-y-0.5 px-2">
        <div
          v-for="device in devicesStore.devices"
          :key="device.id"
          class="sidebar-item"
          :class="isActiveDevice(device.id) ? 'sidebar-item-active' : 'sidebar-item-inactive'"
          @click="selectDevice(device)"
        >
          <component :is="getDeviceIconComponent(device.type)" class="w-5 h-5 flex-shrink-0 sidebar-icon" :class="getDeviceIconColor(device.type)" />
          <span class="text-[13px] truncate flex-1 font-medium">{{ device.name }}</span>
          <span
            v-if="device.type !== 'local' && device.status !== 'connected'"
            class="w-2 h-2 rounded-full"
            :class="device.status === 'connecting' ? 'bg-accent-orange animate-pulse' : 'bg-text-tertiary'"
          />
        </div>
      </div>
    </div>

    <!-- Add Device Button -->
    <div class="px-4 py-2 border-t border-border">
      <button
        class="w-full flex items-center justify-center gap-2.5 px-3 py-2 rounded-md text-base text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer"
        @click="showAddDeviceMenu = !showAddDeviceMenu"
        aria-label="Add Device"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        <span>Add Device</span>
      </button>

      <!-- Add Device Menu -->
      <div
        v-if="showAddDeviceMenu"
        class="mt-1 bg-bg-secondary rounded-lg border border-border shadow-lg overflow-hidden animate-fade-in"
      >
        <div
          class="px-3 py-2 text-base text-text-primary hover:bg-bg-hover cursor-pointer flex items-center gap-2.5 transition-colors duration-100"
          @click="addDevice('smb')"
        >
          <svg class="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
          <span>SMB Share</span>
        </div>
        <div
          class="px-3 py-2 text-base text-text-primary hover:bg-bg-hover cursor-pointer flex items-center gap-2.5 transition-colors duration-100"
          @click="addDevice('ssh')"
        >
          <svg class="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>SSH/SFTP Server</span>
        </div>
        <div
          class="px-3 py-2 text-base text-text-secondary hover:bg-bg-hover hover:text-text-primary cursor-pointer flex items-center gap-2.5 transition-colors duration-100"
          @click="addDevice('android')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <span>Android Device</span>
        </div>
      </div>
    </div>

    <!-- External Volumes Section (mounted on local filesystem, e.g. /Volumes/*) -->
    <div v-if="volumesStore.volumes.length > 0" class="py-3 border-t border-border">
      <div class="px-4 mb-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">External Volumes</div>
      <div class="space-y-0.5 px-2">
        <div
          v-for="volume in volumesStore.volumes"
          :key="volume.id"
          class="sidebar-item"
          :class="isActivePath(volume.mountPath) ? 'sidebar-item-active' : 'sidebar-item-inactive'"
          :title="volume.mountPath"
          @click="selectVolume(volume)"
        >
          <component :is="VolumeDriveIcon" class="w-5 h-5 flex-shrink-0 sidebar-icon text-[#5ac8fa]" />
          <span class="text-[13px] truncate flex-1 font-medium">{{ volume.name }}</span>
        </div>
      </div>
    </div>

    <!-- Mobile Devices Section -->
    <div class="py-3 border-t border-border">
      <div class="px-4 mb-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">Mobile Devices</div>
      <!-- Scanning indicator -->
      <div v-if="mobileScanInProgress" class="px-2 py-1.5 text-text-secondary italic animate-pulse">
        Scanning...
      </div>
      <div v-else class="space-y-0.5 px-2">
        <div
          v-for="device in mobileDevices"
          :key="device.id"
          class="sidebar-item group"
          :class="[
            isActiveDevice(device.id) && !devicesStore.isAutoConnectDevice(device.id) ? 'sidebar-item-active'
              : 'sidebar-item-inactive'
          ]"
          @click="selectMobileDevice(device)"
        >
          <!-- Device icon -->
          <component :is="getMobileDeviceIconComponent(device.type)" class="w-5 h-5 flex-shrink-0" :class="device.type === 'ios' ? 'text-[#0a84ff]' : 'text-[#32d74b]'" />
          <span class="text-[13px] truncate flex-1 font-medium">{{ device.name }}</span>
          <!-- iOS pairing status badge -->
          <span
            v-if="device.type === 'ios'"
            class="ml-1.5"
          >
            <span
              v-if="device.pairingStatus === 'unpaired'"
              class="px-1.5 py-0.5 text-xs bg-gray-400 rounded"
            >未配对</span>
            <span v-else-if="device.pairingStatus === 'pairing'" class="px-1.5 py-0.5 text-xs bg-yellow-500 rounded animate-pulse">
              Pairing...
            </span>
            <span v-else-if="device.pairingStatus === 'paired'" class="px-1.5 py-0.5 text-xs bg-green-500 rounded">
              ✓ Paired
            </span>
          </span>
          <!-- iOS 未配对:发起配对按钮(凑齐完整配对生命周期:发起→设备信任→校验) -->
          <button
            v-if="device.type === 'ios' && device.pairingStatus === 'unpaired' && !isPairing(device.id)"
            class="ml-1 px-1.5 py-0.5 text-xs text-white bg-accent-blue hover:bg-accent-blue/80 rounded"
            title="发起配对(设备上会弹出『信任此电脑』)"
            @click.stop="pairMobileDevice(device.id)"
          >配对</button>
          <span
            v-if="isPairing(device.id)"
            class="ml-1 px-1.5 py-0.5 text-xs bg-yellow-500 text-white rounded animate-pulse"
          >配对中…</span>
          <!-- Auto-connect indicator -->
          <span
            v-if="devicesStore.isAutoConnectDevice(device.id)"
            class="w-2 h-2 rounded-full bg-green-500"
            title="Auto-connect enabled"
          ></span>
          <!-- Device actions (connect/forget) - shown on hover -->
          <div class="hidden group-hover:flex items-center gap-2 ml-auto">
            <!-- Connect button -->
            <button
              v-if="!isConnected(device.id) && !devicesStore.isAutoConnectDevice(device.id)"
              class="px-2 py-0.5 text-xs text-text-primary bg-accent-blue/20 hover:bg-accent-blue/30 hover:text-accent-blue rounded"
              @click.stop="connectMobileDevice(device.id)"
            >
              Connect
            </button>
            <!-- Forget button -->
            <button
              v-if="devicesStore.isAutoConnectDevice(device.id)"
              class="px-2 py-0.5 text-xs text-text-tertiary hover:text-red-500"
              @click.stop="forgetDevice(device.id)"
            >
              Forget
            </button>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="mobileDevices.length === 0" class="px-4 py-3 text-center text-text-tertiary text-sm">
        <span>No mobile devices detected</span>
      </div>

      <!-- libimobiledevice warning -->
      <div v-if="!libimobiledeviceInstalled" class="px-4 py-3">
        <div class="flex items-center gap-2 p-2 bg-yellow-50/30 dark:bg-yellow-50/10 border border-yellow-400 rounded">
          <svg class="w-5 h-5 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 0v14a2 2m0 4h0m-6 6h6-6 12a6 0z" />
          </svg>
          <div class="flex-1">
            <span class="text-sm text-yellow-700">iOS Support</span>
            <span class="text-xs text-yellow-600">Install libimobiledevice for iOS device support</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Places (system locations: Home / Desktop / ...) -->
    <div class="py-3 border-t border-border flex-1 overflow-auto">
      <div class="px-4 mb-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">Places</div>
      <div class="space-y-0.5 px-2">
        <div
          v-for="fav in favorites"
          :key="fav.path"
          class="sidebar-item"
          :class="isActivePath(fav.path) ? 'sidebar-item-active' : 'sidebar-item-inactive'"
          @click="navigateTo(fav.path)"
        >
          <component :is="fav.icon" class="w-5 h-5 flex-shrink-0" :class="fav.iconColor" />
          <span class="text-[13px] truncate font-medium">{{ fav.name }}</span>
        </div>
      </div>

      <!-- Favorites (user bookmarks, device-scoped) -->
      <div class="px-4 mt-4 mb-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">Favorites</div>
      <div class="space-y-0.5 px-2">
        <div
          v-for="item in favoritesStore.favorites"
          :key="item.deviceId + '::' + item.path"
          class="sidebar-item group"
          :class="isActiveFavorite(item) ? 'sidebar-item-active' : 'sidebar-item-inactive'"
          :title="item.path"
          @click="selectFavorite(item)"
        >
          <component :is="StarIcon" class="w-5 h-5 flex-shrink-0 text-[#ffd60a]" />
          <span class="text-[13px] truncate flex-1 font-medium">{{ item.name }}</span>
          <button
            class="hidden group-hover:flex items-center justify-center w-5 h-5 rounded text-text-tertiary hover:text-red-500 hover:bg-bg-hover flex-shrink-0"
            title="移除收藏"
            @click.stop="removeFavorite(item)"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div v-if="favoritesStore.favorites.length === 0" class="px-4 py-2 text-xs text-text-tertiary">
          右键文件夹可添加收藏
        </div>
      </div>
    </div>

    <!-- Preview Section (Bottom) -->
    <div class="mt-auto border-t border-border">
      <div
        class="sidebar-item"
        :class="isPreviewFullscreen ? 'sidebar-item-active' : 'sidebar-item-inactive'"
        @click="togglePreviewFullscreen"
      >
        <svg class="w-5 h-5 flex-shrink-0 text-[#5ac8fa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <span class="text-[13px] flex-1 font-medium">Preview</span>
        <span
          v-if="previewTabCount > 0"
          class="px-1.5 py-0.5 text-[11px] rounded-full font-semibold"
          :class="isPreviewFullscreen ? 'bg-white/20' : 'bg-accent-blue/20 text-accent-blue'"
        >
          {{ previewTabCount }}
        </span>
      </div>
    </div>

    <!-- Device Dialog -->
    <DeviceDialog
      v-if="deviceDialog.visible"
      :type="deviceDialog.type"
      @close="deviceDialog.visible = false"
      @connect="handleDeviceConnect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, h, onMounted, computed, watch, markRaw } from 'vue'
import { useDevicesStore } from '@/stores/devices'
import { useTabsStore } from '@/stores/tabs'
import { usePreviewStore } from '@/stores/preview'
import { useVolumesStore } from '@/stores/volumes'
import { useFavoritesStore } from '@/stores/favorites'
import DeviceDialog from './dialogs/DeviceDialog.vue'
import type { Device, DetectedMobileDevice } from '@/stores/devices'
import type { Volume } from '@/stores/volumes'
import type { Favorite } from '@/types'

const devicesStore = useDevicesStore()
const tabsStore = useTabsStore()
const previewStore = usePreviewStore()
const volumesStore = useVolumesStore()
const favoritesStore = useFavoritesStore()

const showAddDeviceMenu = ref(false)

// Mobile device state
const mobileScanInProgress = ref(false)
const mobileDevices = computed(() => devicesStore.detectedMobileDevices)
const libimobiledeviceInstalled = computed(() => devicesStore.libimobiledeviceInstalled)

const previewTabCount = computed(() => previewStore.tabs.length)
const isPreviewFullscreen = computed(() => previewStore.isFullscreen)

const deviceDialog = reactive<{
  visible: boolean
  type: 'smb' | 'ssh'
}>({
  visible: false,
  type: 'smb'
})

// SVG Icon Components
const HomeIcon = {
  render() {
    return h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' })
    ])
  }
}

const DesktopIcon = {
  render() {
    return h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' })
    ])
  }
}

const DocumentIcon = {
  render() {
    return h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' })
    ])
  }
}

const DownloadIcon = {
  render() {
    return h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' })
    ])
  }
}

const ApplicationIcon = {
  render() {
    return h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' })
    ])
  }
}

// 用户收藏夹条目图标（金色书签）
const StarIcon = {
  render() {
    return h('svg', { class: 'w-5 h-5', fill: 'currentColor', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '1.5', d: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z' })
    ])
  }
}

// Default favorites with SVG icon components and colors
const favorites = ref<Array<{ name: string; path: string; icon: any; iconColor: string }>>([])

async function loadFavorites() {
  try {
    const homeDir = await window.fileman.getHomeDir()
    favorites.value = [
      { name: 'Home', path: homeDir, icon: markRaw(HomeIcon), iconColor: 'text-[#c084fc]' },
      { name: 'Desktop', path: homeDir + '/Desktop', icon: markRaw(DesktopIcon), iconColor: 'text-[#6366f1]' },
      { name: 'Documents', path: homeDir + '/Documents', icon: markRaw(DocumentIcon), iconColor: 'text-[#ffaa33]' },
      { name: 'Downloads', path: homeDir + '/Downloads', icon: markRaw(DownloadIcon), iconColor: 'text-[#32d74b]' },
      { name: 'Applications', path: '/Applications', icon: markRaw(ApplicationIcon), iconColor: 'text-[#ff5a7f]' },
    ]
  } catch (error) {
    console.error('Failed to get home directory:', error)
    favorites.value = [
      { name: 'Root', path: '/', icon: markRaw(HomeIcon), iconColor: 'text-[#c084fc]' },
    ]
  }
}

onMounted(() => {
  loadFavorites()
  favoritesStore.load()
  // Set up mobile device listener
  console.log('[AppSidebar] Setting up mobile device listener')
  devicesStore.setupMobileDeviceListener()
  // Check if libimobiledevice is installed
  devicesStore.checkLibimobiledeviceInstalled()
  // Load external volumes + subscribe to mount/unmount changes
  console.log('[AppSidebar] Setting up volumes')
  volumesStore.loadVolumes()
  volumesStore.setupVolumesListener()
})

// Watch for mobile device changes
watch(mobileDevices, (newDevices) => {
  console.log('[AppSidebar] mobileDevices changed:', newDevices.length, newDevices)
}, { immediate: true, deep: true })

// Device icon components
const LocalIcon = {
  render() {
    return h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' })
    ])
  }
}

const AndroidIcon = {
  render() {
    return h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' })
    ])
  }
}

const SmbIcon = {
  render() {
    return h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01' })
    ])
  }
}

const SshIcon = {
  render() {
    return h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' })
    ])
  }
}

const IosIcon = {
  render() {
    return h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' })
    ])
  }
}

// 外接磁盘图标（侧栏 External Volumes 分区用）
const VolumeDriveIcon = {
  render() {
    return h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M4 6a2 2 0 012-2h9l5 5v9a2 2 0 01-2 2H6a2 2 0 01-2-2V6z' }),
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M8 6v3h4V6M8 18v-6h8v6' })
    ])
  }
}

function getDeviceIconComponent(type: string) {
  const icons: Record<string, any> = {
    local: LocalIcon,
    android: AndroidIcon,
    smb: SmbIcon,
    ssh: SshIcon,
    ios: IosIcon
  }
  return icons[type] || LocalIcon
}

function getDeviceIconColor(type: string): string {
  const colors: Record<string, string> = {
    local: 'text-[#5ac8fa]',
    android: 'text-[#32d74b]',
    smb: 'text-[#ffaa33]',
    ssh: 'text-[#c084fc]',
    ios: 'text-[#0a84ff]'
  }
  return colors[type] || 'text-text-secondary'
}

function getMobileDeviceIconComponent(type: string) {
  const icons: Record<string, any> = {
    android: AndroidIcon,
    ios: IosIcon
  }
  return icons[type] || AndroidIcon
}

function isActiveDevice(deviceId: string): boolean {
  return tabsStore.activePane?.deviceId === deviceId
}

function isActivePath(path: string): boolean {
  return tabsStore.activePane?.path === path
}

function selectDevice(device: Device) {
  // Exit fullscreen preview when navigating to a device
  if (previewStore.isFullscreen) {
    previewStore.closeFullscreen()
  }
  if (tabsStore.activePane) {
    const rootPath = device.rootPath || '/'
    tabsStore.navigatePane(tabsStore.activePane.id, rootPath)
  }
}

function navigateTo(path: string) {
  // Exit fullscreen preview when navigating to a directory
  if (previewStore.isFullscreen) {
    previewStore.closeFullscreen()
  }
  if (tabsStore.activePane) {
    tabsStore.navigatePane(tabsStore.activePane.id, path)
  }
}

/**
 * 收藏夹是设备相关的（deviceId + path）。切换时把活动窗格的设备一并切到
 * 收藏项所属设备，再导航到路径。若该远程设备未连接，listFiles 会失败——
 * 用户需先在侧栏连接它（与 selectMobileDevice/selectVolume 的既有行为一致）。
 */
function isActiveFavorite(fav: Favorite): boolean {
  const p = tabsStore.activePane
  return !!p && p.deviceId === fav.deviceId && p.path === fav.path
}

function selectFavorite(fav: Favorite) {
  if (previewStore.isFullscreen) {
    previewStore.closeFullscreen()
  }
  const pane = tabsStore.activePane
  if (!pane) return
  pane.deviceId = fav.deviceId
  tabsStore.navigatePane(pane.id, fav.path)
}

function removeFavorite(fav: Favorite) {
  favoritesStore.remove(fav.deviceId, fav.path)
}

/**
 * 选择一个外接卷：卷是本地路径，必须先把 pane 切到 local 设备，再导航到挂载点，
 * 否则当 pane 停在远程设备上时会用错 adapter。
 */
function selectVolume(volume: Volume) {
  // Exit fullscreen preview when navigating to a volume
  if (previewStore.isFullscreen) {
    previewStore.closeFullscreen()
  }
  const pane = tabsStore.activePane
  if (pane) {
    pane.deviceId = 'local'
    tabsStore.navigatePane(pane.id, volume.mountPath)
  }
}

function addDevice(type: 'smb' | 'ssh' | 'android') {
  deviceDialog.type = type === 'android' ? 'smb' : type
  deviceDialog.visible = true
  showAddDeviceMenu.value = false
}

function togglePreviewFullscreen() {
  if (previewTabCount.value > 0) {
    previewStore.toggleFullscreen()
  }
}

async function handleDeviceConnect(config: { type: string; name: string; host: string; port?: number; username?: string; password?: string; share?: string }) {
  // Add device to store
  const deviceId = config.type + '-' + Date.now()
  devicesStore.addDevice({
    id: deviceId,
    type: config.type as Device['type'],
    name: config.name,
    status: 'connecting',
    rootPath: '/'
  })

  deviceDialog.visible = false

  // Try to connect (placeholder - actual connection would be handled by main process)
  try {
    await devicesStore.connectDevice(deviceId)
  } catch (error) {
    console.error('Failed to connect:', error)
    devicesStore.updateDeviceStatus(deviceId, 'disconnected')
  }
}

// ============ Mobile Device Functions ============

/**
 * Select a mobile device
 */
function selectMobileDevice(device: DetectedMobileDevice) {
  // Exit fullscreen preview when navigating to a mobile device
  if (previewStore.isFullscreen) {
    previewStore.closeFullscreen()
  }
  if (tabsStore.activePane) {
    // Update the pane's deviceId and path
    tabsStore.activePane.deviceId = device.id
    tabsStore.navigatePane(tabsStore.activePane.id, '/')
  }
}

/**
 * Connect to a mobile device
 */
async function connectMobileDevice(deviceId: string) {
  try {
    await devicesStore.connectDevice(deviceId)
  } catch (error) {
    console.error('Failed to connect mobile device:', error)
  }
}

// ============ iOS 配对发起(完整配对生命周期) ============
// 配对中设备集合(数组重赋值保响应式);成功后扫描器下个周期把 pairingStatus 翻成 paired,UI 自动转可浏览。
const pairingDeviceIds = ref<string[]>([])
function isPairing(deviceId: string): boolean {
  return pairingDeviceIds.value.includes(deviceId)
}

async function pairMobileDevice(deviceId: string) {
  pairingDeviceIds.value = [...pairingDeviceIds.value, deviceId]
  try {
    const result = await window.fileman.pairDevice(deviceId)
    if (!result.success) {
      console.error('[AppSidebar] 配对失败:', result.error)
      // 简单反馈:失败时短暂 alert(后续可接 toast)
      alert(`配对失败:${result.error || '未知原因'}`)
    }
    // 成功无需手动刷新 —— 扫描器轮询会把设备 pairingStatus 更新为 paired。
  } catch (error) {
    console.error('[AppSidebar] 配对异常:', error)
    alert(`配对异常:${error instanceof Error ? error.message : String(error)}`)
  } finally {
    pairingDeviceIds.value = pairingDeviceIds.value.filter(id => id !== deviceId)
  }
}

/**
 * Check if a mobile device is connected
 */
function isConnected(deviceId: string): boolean {
  const device = devicesStore.getDevice(deviceId)
  return device?.status === 'connected'
}

/**
 * Remember a mobile device for auto-connect
 */
async function rememberDevice(deviceId: string) {
  try {
    await devicesStore.rememberDevice(deviceId)
  } catch (error) {
    console.error('Failed to remember device:', error)
  }
}

/**
 * Forget a mobile device (remove from auto-connect)
 */
async function forgetDevice(deviceId: string) {
  try {
    await devicesStore.forgetDevice(deviceId)
  } catch (error) {
    console.error('Failed to forget device:', error)
  }
}
</script>
