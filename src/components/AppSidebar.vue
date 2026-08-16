<template>
  <div class="finder-sidebar h-full bg-bg-sidebar flex flex-col overflow-hidden">
    <div class="finder-sidebar-content flex-1 min-h-0 overflow-y-auto">
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
        class="w-full flex items-center justify-center gap-2.5 px-3 py-2 rounded-md text-base text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
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
          class="px-3 py-2 text-base text-text-primary hover:bg-bg-hover flex items-center gap-2.5 transition-colors duration-100"
          @click="addDevice('smb')"
        >
          <svg class="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
          <span>SMB Share</span>
        </div>
        <div
          class="px-3 py-2 text-base text-text-primary hover:bg-bg-hover flex items-center gap-2.5 transition-colors duration-100"
          @click="addDevice('ssh')"
        >
          <svg class="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>SSH/SFTP Server</span>
        </div>
        <div
          class="px-3 py-2 text-base text-text-primary hover:bg-bg-hover flex items-center gap-2.5 transition-colors duration-100"
          @click="addDevice('webdav')"
        >
          <svg class="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5h16v14H4zM8 9h8M8 13h5" />
          </svg>
          <span>WebDAV (HTTP/HTTPS)</span>
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
              class="px-1.5 py-0.5 text-xs bg-text-tertiary text-white rounded"
            >未配对</span>
            <span v-else-if="device.pairingStatus === 'pairing'" class="px-1.5 py-0.5 text-xs bg-yellow-500 text-white rounded animate-pulse">
              Pairing...
            </span>
            <span v-else-if="device.pairingStatus === 'paired'" class="px-1.5 py-0.5 text-xs bg-green-500 text-white rounded">
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
        <div class="flex items-center gap-2 p-2 bg-yellow-50/30 dark:bg-yellow-50/10 border border-yellow-400/50 rounded">
          <svg class="w-5 h-5 text-yellow-500 dark:text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 0v14a2 2m0 4h0m-6 6h6-6 12a6 0z" />
          </svg>
          <div class="flex-1">
            <span class="text-sm text-yellow-700 dark:text-yellow-400">iOS Support</span>
            <span class="text-xs text-yellow-600 dark:text-yellow-400">Install libimobiledevice for iOS device support</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Places (system locations: Home / Desktop / ...) -->
    <div class="py-3 border-t border-border">
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

      <!-- Favorites (user bookmarks, device-scoped, grouped by device platform).
           未连接设备的收藏不渲染(整组随之消失),连上后自动回归。 -->
      <div class="px-4 mt-4 mb-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">Favorites</div>
      <template v-for="group in groupedFavorites" :key="group.type">
        <div
          v-if="group.type !== 'local'"
          class="px-4 mt-2 mb-1 text-[10px] font-medium text-text-tertiary/80 tracking-wide"
        >{{ group.label }}</div>
        <div class="space-y-0.5 px-2">
          <div
            v-for="item in group.items"
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
        </div>
      </template>
      <div v-if="favoritesStore.favorites.length === 0" class="px-4 py-2 text-xs text-text-tertiary">
        右键文件夹可添加收藏
      </div>
    </div>

    </div>

    <div class="sidebar-utility-bar flex items-center gap-1 px-3 py-2 border-t border-border" aria-label="Application tools">
      <button
        class="sidebar-utility-button"
        @click="emit('toggle-theme')"
        :title="theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
        :aria-label="theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
      >
        <svg v-if="theme === 'dark'" class="w-4 h-4 text-accent-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
        <svg v-else class="w-4 h-4 text-accent-indigo" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
      </button>
      <button
        class="sidebar-utility-button relative"
        :class="{ active: isFileOperationsVisible }"
        @click="emit('toggle-file-operations')"
        title="File Operations"
        :aria-label="activeTaskCount > 0 ? `File Operations, ${activeTaskCount} active task${activeTaskCount === 1 ? '' : 's'}` : 'File Operations'"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        <span
          v-if="activeTaskCount > 0"
          class="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 font-semibold text-center ring-2 ring-bg-sidebar"
          aria-hidden="true"
        >{{ activeTaskCount }}</span>
      </button>
      <button class="sidebar-utility-button" :class="{ active: isDualPaneActive }" :disabled="isSplitToggleDisabled" @click="emit('toggle-dual-pane')" title="Toggle Dual Pane" aria-label="Toggle Dual Pane">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 012-2M9 7a2 2 0 012-2h2a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
      </button>
      <button class="sidebar-utility-button" @click="emit('open-settings')" title="Settings" aria-label="Settings">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
      </button>
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
import { useVolumesStore } from '@/stores/volumes'
import { useFavoritesStore } from '@/stores/favorites'
import DeviceDialog from './dialogs/DeviceDialog.vue'
import type { Device, DetectedMobileDevice } from '@/stores/devices'
import type { Volume } from '@/stores/volumes'
import type { Favorite } from '@/types'

const log = console
const devicesStore = useDevicesStore()
const tabsStore = useTabsStore()
const volumesStore = useVolumesStore()
const favoritesStore = useFavoritesStore()

defineProps<{
  theme: 'light' | 'dark'
  isFileOperationsVisible: boolean
  activeTaskCount: number
  isDualPaneActive: boolean
  isSplitToggleDisabled: boolean
}>()

const emit = defineEmits<{
  'toggle-theme': []
  'toggle-file-operations': []
  'toggle-dual-pane': []
  'open-settings': []
}>()

const showAddDeviceMenu = ref(false)

// Mobile device state
const mobileScanInProgress = ref(false)
const mobileDevices = computed(() => devicesStore.detectedMobileDevices)
const libimobiledeviceInstalled = computed(() => devicesStore.libimobiledeviceInstalled)

const deviceDialog = reactive<{
  visible: boolean
  type: 'smb' | 'ssh' | 'webdav'
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
  // Load device list + subscribe to device:changed pushes. Without this,
  // Android/iOS devices only exist in detectedMobileDevices — the devices
  // array stays empty and device-scoped favorites never pass the
  // getDevice(id)?.status === 'connected' visibility filter.
  devicesStore.loadDevices()
  devicesStore.setupDeviceListener()
  // Set up mobile device listener
  log.info('[FinderSidebar] setting up mobile device listener')
  devicesStore.setupMobileDeviceListener()
  // Check if libimobiledevice is installed
  devicesStore.checkLibimobiledeviceInstalled()
  // Load external volumes + subscribe to mount/unmount changes
  log.info('[FinderSidebar] setting up volumes')
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

const WebDAVIcon = {
  render() {
    return h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M4 5h16v14H4zM8 9h8M8 13h5' })
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
    webdav: WebDAVIcon,
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
    webdav: 'text-[#64d2ff]',
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

async function selectDevice(device: Device) {
  const pane = tabsStore.activePane
  if (!pane) return

  try {
    // 先完成远程设备连接，再同时切换 deviceId 与路径。此前这里仅改路径，
    // 当 pane 停在 Android 等远程设备时，点击“本地”仍会用旧适配器发起 fs:list。
    if (device.type !== 'local') {
      await devicesStore.connectDevice(device.id)
    }

    const rootPath = device.rootPath || '/'
    pane.deviceId = device.id
    tabsStore.navigatePane(pane.id, rootPath)
  } catch (error) {
    console.error('[AppSidebar] Failed to select device:', { deviceId: device.id, error })
    alert(`无法连接 ${device.name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function navigateTo(path: string) {
  const pane = tabsStore.activePane
  if (pane) {
    // Places 是本机路径：窗格当前挂在远程设备上时必须先切回 local，
    // 否则会向远程设备 listFiles 一个 macOS 路径，列表显示为空
    pane.deviceId = 'local'
    tabsStore.navigatePane(pane.id, path)
  }
}

/**
 * 收藏夹是设备相关的（deviceId + path）。切换时把活动窗格的设备一并切到
 * 收藏项所属设备，再导航到路径；主进程会按需建立尚未连接的适配器。
 */

// ── 收藏按平台分组渲染 ──────────────────────────────────────────────────────
// 未连接设备的收藏不显示(避免 UI 杂乱);连上后 device:changed 推送驱动
// devices 列表更新,本 computed 自动重算。本机(local)收藏恒可见。
// 被 Forget/删除设备名下的收藏静默留存,不显示也不清理,同序列号重连即回归。
const FAVORITE_GROUP_ORDER: Array<{ type: string; label: string }> = [
  { type: 'local', label: '本机' },
  { type: 'android', label: 'Android' },
  { type: 'ios', label: 'iOS' },
  { type: 'smb', label: 'SMB' },
  { type: 'ssh', label: 'SSH' },
  { type: 'webdav', label: 'WebDAV' }
]

const visibleFavorites = computed(() =>
  favoritesStore.favorites.filter(f =>
    f.deviceId === 'local' ||
    devicesStore.getDevice(f.deviceId)?.status === 'connected'
  )
)

// 同平台(如多台安卓)共用一组;空组直接消失。
const groupedFavorites = computed(() => {
  const byType = new Map<string, Favorite[]>()
  for (const f of visibleFavorites.value) {
    const type = devicesStore.getDevice(f.deviceId)?.type ?? 'local'
    const list = byType.get(type)
    if (list) list.push(f)
    else byType.set(type, [f])
  }
  // 已知平台按固定顺序在前,未知平台类型按插入顺序垫底
  const known = FAVORITE_GROUP_ORDER.filter(g => byType.has(g.type))
  const extra = [...byType.keys()]
    .filter(t => !FAVORITE_GROUP_ORDER.some(g => g.type === t))
    .map(t => ({ type: t, label: t }))
  return [...known, ...extra]
    .map(g => ({ ...g, items: byType.get(g.type) ?? [] }))
    .filter(g => g.items.length > 0)
})

function isActiveFavorite(fav: Favorite): boolean {
  const p = tabsStore.activePane
  return !!p && p.deviceId === fav.deviceId && p.path === fav.path
}

function selectFavorite(fav: Favorite) {
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
  const pane = tabsStore.activePane
  if (pane) {
    pane.deviceId = 'local'
    tabsStore.navigatePane(pane.id, volume.mountPath)
  }
}

function addDevice(type: 'smb' | 'ssh' | 'webdav') {
  deviceDialog.type = type
  deviceDialog.visible = true
  showAddDeviceMenu.value = false
}

async function handleDeviceConnect(config: { type: 'smb' | 'ssh' | 'webdav'; name: string; host: string; url?: string; port?: number; username?: string; password?: string; share?: string }) {
  const deviceId = `${config.type}-${Date.now()}`
  let added = false
  try {
    await devicesStore.addDeviceWithCredentials({
      id: deviceId,
      type: config.type,
      name: config.name,
      host: config.host,
      url: config.url,
      port: config.port,
      share: config.share,
      rootPath: '/'
    }, {
      username: config.username,
      password: config.password
    })
    added = true
    await devicesStore.connectDevice(deviceId)
    deviceDialog.visible = false
  } catch (error) {
    console.error('Failed to connect:', error)
    if (added) {
      // The dialog is kept open for correction; do not leave an unusable,
      // duplicate persisted connection behind after a failed first attempt.
      await devicesStore.removeDeviceCompletely(deviceId).catch(() => {
        devicesStore.updateDeviceStatus(deviceId, 'disconnected')
      })
    }
    alert(`无法连接 ${config.name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ============ Mobile Device Functions ============

/**
 * Select a mobile device
 */
async function selectMobileDevice(device: DetectedMobileDevice) {
  const pane = tabsStore.activePane
  if (!pane) return

  try {
    // 不在适配器建立前切换 pane，避免 FileList watch 立即以未连接的
    // Android/iOS deviceId 发起 fs:list。
    await devicesStore.connectDevice(device.id)
    pane.deviceId = device.id
    tabsStore.navigatePane(pane.id, '/')
  } catch (error) {
    console.error('[AppSidebar] Failed to select mobile device:', { deviceId: device.id, error })
    alert(`无法连接 ${device.name}: ${error instanceof Error ? error.message : String(error)}`)
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
