<template>
  <div class="finder-sidebar h-full bg-bg-sidebar flex flex-col overflow-hidden">
    <div class="finder-sidebar-content flex-1 min-h-0 overflow-y-auto">
    <!-- Devices Section -->
    <div class="py-3">
      <div class="px-4 mb-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">{{ $t('sidebar.locations') }}</div>
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
        :aria-label="$t('sidebar.addDevice')"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        <span>{{ $t('sidebar.addDevice') }}</span>
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
          <component :is="SmbIcon" class="w-5 h-5 text-text-secondary" />
          <span>{{ $t('sidebar.addSmb') }}</span>
        </div>
        <div
          class="px-3 py-2 text-base text-text-primary hover:bg-bg-hover flex items-center gap-2.5 transition-colors duration-100"
          @click="addDevice('ssh')"
        >
          <component :is="SshIcon" class="w-5 h-5 text-text-secondary" />
          <span>{{ $t('sidebar.addSsh') }}</span>
        </div>
        <div
          class="px-3 py-2 text-base text-text-primary hover:bg-bg-hover flex items-center gap-2.5 transition-colors duration-100"
          @click="addDevice('webdav')"
        >
          <component :is="WebDavIcon" class="w-5 h-5 text-text-secondary" />
          <span>{{ $t('sidebar.addWebdav') }}</span>
        </div>
      </div>
    </div>

    <!-- External Volumes Section (mounted on local filesystem, e.g. /Volumes/*) -->
    <div v-if="volumesStore.volumes.length > 0" class="py-3 border-t border-border">
      <div class="px-4 mb-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">{{ $t('sidebar.externalVolumes') }}</div>
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
      <div class="px-4 mb-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">{{ $t('sidebar.mobileDevices') }}</div>
      <!-- Scanning indicator -->
      <div v-if="mobileScanInProgress" class="px-2 py-1.5 text-text-secondary italic animate-pulse">
        {{ $t('sidebar.scanning') }}
      </div>
      <div v-else class="space-y-0.5 px-2">
        <div v-for="device in mobileDevices" :key="device.id">
          <div
            class="sidebar-item group"
            :class="[
              isActiveDevice(device.id) && !devicesStore.isAutoConnectDevice(device.id) ? 'sidebar-item-active'
                : 'sidebar-item-inactive'
            ]"
            @click="selectMobileDevice(device)"
          >
          <!-- Device icon -->
          <component :is="getMobileDeviceIconComponent(device.type)" class="w-5 h-5 flex-shrink-0" :class="getMobileDeviceIconColor(device.type)" />
          <span class="text-[13px] truncate flex-1 font-medium">{{ device.name }}</span>
          <!-- iOS pairing status badge -->
          <span
            v-if="device.type === 'ios'"
            class="ml-1.5"
          >
            <span
              v-if="device.pairingStatus === 'unpaired'"
              class="px-1.5 py-0.5 text-xs bg-text-tertiary text-white rounded"
            >{{ $t('sidebar.pairUnpaired') }}</span>
            <span v-else-if="device.pairingStatus === 'pairing'" class="px-1.5 py-0.5 text-xs bg-yellow-500 text-white rounded animate-pulse">
              {{ $t('sidebar.pairBadge') }}
            </span>
            <span v-else-if="device.pairingStatus === 'paired'" class="px-1.5 py-0.5 text-xs bg-green-500 text-white rounded">
              {{ $t('sidebar.paired') }}
            </span>
          </span>
          <!-- iOS 未配对:发起配对按钮(凑齐完整配对生命周期:发起→设备信任→校验) -->
          <button
            v-if="device.type === 'ios' && device.pairingStatus === 'unpaired' && !isPairing(device.id)"
            class="ml-1 px-1.5 py-0.5 text-xs text-white bg-accent-blue hover:bg-accent-blue/80 rounded"
            :title="$t('sidebar.pairActionTip')"
            @click.stop="pairMobileDevice(device.id)"
          >{{ $t('sidebar.pairAction') }}</button>
          <span
            v-if="isPairing(device.id)"
            class="ml-1 px-1.5 py-0.5 text-xs bg-yellow-500 text-white rounded animate-pulse"
          >{{ $t('sidebar.pairInProgress') }}</span>
          <!-- Auto-connect indicator -->
          <span
            v-if="devicesStore.isAutoConnectDevice(device.id)"
            class="w-2 h-2 rounded-full bg-green-500"
            :title="$t('sidebar.autoConnectEnabled')"
          ></span>
          <!-- Device actions (connect/forget) - shown on hover -->
          <div class="hidden group-hover:flex items-center gap-2 ml-auto">
            <!-- Connect button -->
            <button
              v-if="!isConnected(device.id) && !devicesStore.isAutoConnectDevice(device.id)"
              class="px-2 py-0.5 text-xs text-text-primary bg-accent-blue/20 hover:bg-accent-blue/30 hover:text-accent-blue rounded"
              @click.stop="connectMobileDevice(device.id)"
            >
              {{ $t('sidebar.connect') }}
            </button>
            <!-- Forget button -->
            <button
              v-if="devicesStore.isAutoConnectDevice(device.id)"
              class="px-2 py-0.5 text-xs text-text-tertiary hover:text-red-500"
              @click.stop="forgetDevice(device.id)"
            >
              {{ $t('sidebar.forget') }}
            </button>
          </div>
        </div>

        <!-- 设备工具栏:第一项「截图」(Android/OHOS/iOS 通用) -->
        <div class="flex items-center gap-1 pl-9 pr-2 py-0.5">
          <button
            class="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-40 disabled:cursor-default"
            :disabled="!canScreenshot(device) || deviceScreenshot.isCapturing(device.id)"
            :title="screenshotTooltip(device)"
            :aria-label="$t('sidebar.screenshotAria', { name: device.name })"
            @click.stop="deviceScreenshot.capture({ id: device.id, name: device.name })"
          >
            <component :is="CameraIcon" class="w-3.5 h-3.5" />
            <span>{{ deviceScreenshot.isCapturing(device.id) ? $t('sidebar.screenshotting') : $t('sidebar.screenshot') }}</span>
          </button>
        </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="mobileDevices.length === 0" class="px-4 py-3 text-center text-text-tertiary text-sm">
        <span>{{ $t('sidebar.noMobileDevices') }}</span>
      </div>

      <!-- libimobiledevice warning -->
      <div v-if="!libimobiledeviceInstalled" class="px-4 py-3">
        <div class="flex items-center gap-2 p-2 bg-yellow-50/30 dark:bg-yellow-50/10 border border-yellow-400/50 rounded">
          <svg class="w-5 h-5 text-yellow-500 dark:text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div class="flex-1">
            <span class="text-sm text-yellow-700 dark:text-yellow-400">{{ $t('sidebar.iosSupportTitle') }}</span>
            <span class="text-xs text-yellow-600 dark:text-yellow-400">{{ $t('sidebar.iosSupportDesc') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Places (system locations: Home / Desktop / ...) -->
    <div class="py-3 border-t border-border">
      <div class="px-4 mb-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">{{ $t('sidebar.places') }}</div>
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
      <div class="px-4 mt-4 mb-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">{{ $t('sidebar.favorites') }}</div>
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
            <component :is="BookmarkIcon" class="w-5 h-5 flex-shrink-0 text-[#ffd60a]" />
            <span class="text-[13px] truncate flex-1 font-medium">{{ item.name }}</span>
            <button
              class="hidden group-hover:flex items-center justify-center w-5 h-5 rounded text-text-tertiary hover:text-red-500 hover:bg-bg-hover flex-shrink-0"
              :title="$t('sidebar.removeFavorite')"
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
        {{ $t('sidebar.favoritesHint') }}
      </div>
    </div>

    </div>

    <div class="sidebar-utility-bar flex items-center gap-1 px-3 py-2 border-t border-border" :aria-label="$t('sidebar.toolsAria')">
      <button
        class="sidebar-utility-button"
        @click="emit('toggle-theme')"
        :title="theme === 'dark' ? $t('sidebar.switchToLight') : $t('sidebar.switchToDark')"
        :aria-label="theme === 'dark' ? $t('sidebar.switchToLight') : $t('sidebar.switchToDark')"
      >
        <component :is="theme === 'dark' ? SunIcon : MoonIcon" class="w-4 h-4" :class="theme === 'dark' ? 'text-accent-orange' : 'text-accent-indigo'" />
      </button>
      <button class="sidebar-utility-button" @click="emit('open-settings')" :title="$t('sidebar.settings')" :aria-label="$t('sidebar.settings')">
        <component :is="SettingsIcon" class="w-4 h-4" />
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
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useDevicesStore } from '@/stores/devices'
import { useTabsStore } from '@/stores/tabs'
import { useVolumesStore } from '@/stores/volumes'
import { useFavoritesStore } from '@/stores/favorites'
import DeviceDialog from './dialogs/DeviceDialog.vue'
import {
  HomeIcon, DesktopIcon, DocumentIcon, DownloadIcon, ApplicationIcon, BookmarkIcon,
  LocalIcon, AndroidIcon, SmbIcon, SshIcon, WebDavIcon, IosIcon, VolumeDriveIcon,
  SunIcon, MoonIcon, SettingsIcon, CameraIcon, OhosIcon
} from './icons/sidebarIcons'
import { useDeviceScreenshot } from '@/composables/useDeviceScreenshot'
import { t } from '@/i18n'
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
}>()

const emit = defineEmits<{
  'toggle-theme': []
  'open-settings': []
}>()

const showAddDeviceMenu = ref(false)

// 移动设备截图(侧边栏工具栏第一项;弹层挂 App.vue,状态由单例 composable 共享)
const deviceScreenshot = useDeviceScreenshot()

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

// Default favorites with SVG icon components and colors
const favorites = ref<Array<{ name: string; path: string; icon: any; iconColor: string }>>([])

async function loadFavorites() {
  try {
    const homeDir = await window.fileman.getHomeDir()
    favorites.value = [
      { name: 'Home', path: homeDir, icon: HomeIcon, iconColor: 'text-[#c084fc]' },
      { name: 'Desktop', path: homeDir + '/Desktop', icon: DesktopIcon, iconColor: 'text-[#6366f1]' },
      { name: 'Documents', path: homeDir + '/Documents', icon: DocumentIcon, iconColor: 'text-[#ffaa33]' },
      { name: 'Downloads', path: homeDir + '/Downloads', icon: DownloadIcon, iconColor: 'text-[#32d74b]' },
      { name: 'Applications', path: '/Applications', icon: ApplicationIcon, iconColor: 'text-[#ff5a7f]' },
    ]
  } catch (error) {
    console.error('Failed to get home directory:', error)
    favorites.value = [
      { name: 'Root', path: '/', icon: HomeIcon, iconColor: 'text-[#c084fc]' },
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

// Device icon components —— 见 ./icons/sidebarIcons.ts（iconfont「iconPark高质量统一化图标」库）

function getDeviceIconComponent(type: string) {
  const icons: Record<string, any> = {
    local: LocalIcon,
    android: AndroidIcon,
    ohos: OhosIcon,
    smb: SmbIcon,
    ssh: SshIcon,
    webdav: WebDavIcon,
    ios: IosIcon
  }
  return icons[type] || LocalIcon
}

function getDeviceIconColor(type: string): string {
  const colors: Record<string, string> = {
    local: 'text-[#5ac8fa]',
    android: 'text-[#32d74b]',
    ohos: 'text-[#f56c3d]',
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
    ohos: OhosIcon,
    ios: IosIcon
  }
  return icons[type] || AndroidIcon
}

function getMobileDeviceIconColor(type: string): string {
  const colors: Record<string, string> = {
    android: 'text-[#32d74b]',
    ohos: 'text-[#f56c3d]',
    ios: 'text-[#0a84ff]'
  }
  return colors[type] || 'text-text-secondary'
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
    alert(t('sidebar.connectFailed', { name: device.name, message: error instanceof Error ? error.message : String(error) }))
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
  { type: 'local', label: '本机' }, // 仅兜底；实际标签在 groupedFavorites computed 内按当前语言解析
  { type: 'android', label: 'Android' },
  { type: 'ohos', label: 'HarmonyOS' },
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
    .map(g => ({
      ...g,
      // 本机组名走词表（computed 内调用 t → 语言切换响应式）；其余为品牌名
      label: g.type === 'local' ? t('devices.localName') : g.label,
      items: byType.get(g.type) ?? []
    }))
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
    alert(t('sidebar.connectFailed', { name: config.name, message: error instanceof Error ? error.message : String(error) }))
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
    alert(t('sidebar.connectFailed', { name: device.name, message: error instanceof Error ? error.message : String(error) }))
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
      alert(t('sidebar.pairFailed', { reason: result.error || t('sidebar.unknownReason') }))
    }
    // 成功无需手动刷新 —— 扫描器轮询会把设备 pairingStatus 更新为 paired。
  } catch (error) {
    console.error('[AppSidebar] 配对异常:', error)
    alert(t('sidebar.pairError', { message: error instanceof Error ? error.message : String(error) }))
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

// ============ 移动设备工具栏:截图 ============

/** 截图前置条件:设备已连接;iOS 还要求已配对(未配对 idevicescreenshot 必然失败)。 */
function canScreenshot(device: DetectedMobileDevice): boolean {
  if (!isConnected(device.id)) return false
  if (device.type === 'ios') return device.pairingStatus === 'paired'
  return true
}

function screenshotTooltip(device: DetectedMobileDevice): string {
  if (!isConnected(device.id)) return t('sidebar.screenshotNeedConnect')
  if (device.type === 'ios' && device.pairingStatus !== 'paired') return t('sidebar.screenshotNeedPair')
  return t('sidebar.screenshotOf', { name: device.name })
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
