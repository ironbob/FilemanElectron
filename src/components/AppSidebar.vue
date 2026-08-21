<template>
  <div ref="sidebarRootEl" class="finder-sidebar h-full bg-bg-sidebar flex flex-col overflow-hidden">
    <div class="finder-sidebar-content flex-1 min-h-0 overflow-y-auto">
    <!-- Devices Section -->
    <div class="pt-4">
      <div class="sidebar-section-title mb-2">{{ $t('sidebar.locations') }}</div>
      <div class="space-y-0.5 px-2">
        <div
          v-for="device in devicesStore.devices"
          :key="device.id"
          class="sidebar-item"
          :class="isActiveDevice(device.id) ? 'sidebar-item-active' : 'sidebar-item-inactive'"
          @click="selectDevice(device)"
          @contextmenu.prevent="openSidebarMenuForDevice(device, $event)"
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

    <!-- Add Device（紧凑辅助行：Finder 式组内单行入口，不做大号居中按钮） -->
    <div class="px-2 pt-1">
      <button
        class="sidebar-item sidebar-item-inactive"
        :aria-label="$t('sidebar.addDevice')"
        @click="showAddDeviceMenu = !showAddDeviceMenu"
      >
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        <span class="text-[13px] truncate font-medium">{{ $t('sidebar.addDevice') }}</span>
      </button>

      <!-- Add Device Menu（与导航项同几何的紧凑行） -->
      <div v-if="showAddDeviceMenu" class="mt-0.5 animate-fade-in">
        <div class="sidebar-item sidebar-item-inactive" @click="addDevice('smb')">
          <component :is="SmbIcon" class="w-5 h-5 flex-shrink-0" />
          <span class="text-[13px] truncate font-medium">{{ $t('sidebar.addSmb') }}</span>
        </div>
        <div class="sidebar-item sidebar-item-inactive" @click="addDevice('ssh')">
          <component :is="SshIcon" class="w-5 h-5 flex-shrink-0" />
          <span class="text-[13px] truncate font-medium">{{ $t('sidebar.addSsh') }}</span>
        </div>
        <div class="sidebar-item sidebar-item-inactive" @click="addDevice('webdav')">
          <component :is="WebDavIcon" class="w-5 h-5 flex-shrink-0" />
          <span class="text-[13px] truncate font-medium">{{ $t('sidebar.addWebdav') }}</span>
        </div>
      </div>
    </div>

    <!-- External Volumes Section (mounted on local filesystem, e.g. /Volumes/*) -->
    <div v-if="volumesStore.volumes.length > 0" class="pt-5">
      <div class="sidebar-section-title mb-2">{{ $t('sidebar.externalVolumes') }}</div>
      <div class="space-y-0.5 px-2">
        <div
          v-for="volume in volumesStore.volumes"
          :key="volume.id"
          class="sidebar-item"
          :class="isActivePath(volume.mountPath) ? 'sidebar-item-active' : 'sidebar-item-inactive'"
          :title="volume.mountPath"
          @click="selectVolume(volume)"
          @contextmenu.prevent="openSidebarMenuForVolume(volume, $event)"
        >
          <component :is="VolumeDriveIcon" class="w-5 h-5 flex-shrink-0 sidebar-icon text-[#5ac8fa]" />
          <span class="text-[13px] truncate flex-1 font-medium">{{ volume.name }}</span>
        </div>
      </div>
    </div>

    <!-- Mobile Devices Section（空组整组隐藏——Finder 式：空分类不占位；
         扫描中或已有设备时才渲染，libimobiledevice 警告随之只在组内出现） -->
    <div v-if="mobileDevices.length > 0 || mobileScanInProgress" class="pt-5">
      <div class="sidebar-section-title mb-2">{{ $t('sidebar.mobileDevices') }}</div>
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
            @contextmenu.prevent="openSidebarMenuForMobile(device, $event)"
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
            <span v-else-if="device.pairingStatus === 'pairing'" class="px-1.5 py-0.5 text-xs bg-accent-yellow text-white rounded animate-pulse">
              {{ $t('sidebar.pairBadge') }}
            </span>
            <span v-else-if="device.pairingStatus === 'paired'" class="px-1.5 py-0.5 text-xs bg-accent-green text-white rounded">
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
            class="ml-1 px-1.5 py-0.5 text-xs bg-accent-yellow text-white rounded animate-pulse"
          >{{ $t('sidebar.pairInProgress') }}</span>
          <!-- Auto-connect indicator -->
          <span
            v-if="devicesStore.isAutoConnectDevice(device.id)"
            class="w-2 h-2 rounded-full bg-accent-green"
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

        <!-- 设备工具栏:第一项「截图」(Android/OHOS/iOS 通用)，缩进与上方条目文字列对齐 -->
        <div class="flex items-center gap-1 pl-10 pr-2 py-0.5">
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

      <!-- libimobiledevice warning -->
      <div v-if="!libimobiledeviceInstalled" class="px-4 pt-2">
        <div class="flex items-center gap-2 p-2 bg-accent-orange/10 border border-accent-orange/40 rounded">
          <svg class="w-5 h-5 text-accent-orange flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div class="flex-1">
            <span class="text-sm text-accent-orange">{{ $t('sidebar.iosSupportTitle') }}</span>
            <span class="text-xs text-accent-orange/80">{{ $t('sidebar.iosSupportDesc') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Places (system locations: Home / Desktop / ...) -->
    <div class="pt-5 pb-6">
      <div class="sidebar-section-title mb-2">{{ $t('sidebar.places') }}</div>
      <div class="space-y-0.5 px-2">
        <div
          v-for="fav in favorites"
          :key="fav.path"
          class="sidebar-item"
          :class="isActivePath(fav.path) ? 'sidebar-item-active' : 'sidebar-item-inactive'"
          @click="navigateTo(fav.path)"
          @contextmenu.prevent="openSidebarMenuForPlace(fav, $event)"
        >
          <component :is="fav.icon" class="w-5 h-5 flex-shrink-0" :class="fav.iconColor" />
          <span class="text-[13px] truncate font-medium">{{ fav.name }}</span>
        </div>
      </div>

      <!-- Favorites (user bookmarks, device-scoped, grouped by device platform).
           未连接设备的收藏不渲染(整组随之消失),连上后自动回归。 -->
      <div class="sidebar-section-title mt-5 mb-2">{{ $t('sidebar.favorites') }}</div>
      <template v-for="group in groupedFavorites" :key="group.type">
        <div
          v-if="group.type !== 'local'"
          class="sidebar-subgroup-title mt-2 mb-1"
        >{{ group.label }}</div>
        <div class="space-y-0.5 px-2">
          <div
            v-for="item in group.items"
            :key="item.deviceId + '::' + item.path"
            class="sidebar-item group"
            :class="isActiveFavorite(item) ? 'sidebar-item-active' : 'sidebar-item-inactive'"
            :title="item.path"
            @click="selectFavorite(item)"
            @contextmenu.prevent="openSidebarMenuForFavorite(item, group, $event)"
          >
            <component :is="BookmarkIcon" class="w-5 h-5 flex-shrink-0 text-[#ffd60a]" />
            <!-- 行内重命名（Finder 侧栏范式）：名称 span 原地换输入框，Enter 提交/Esc 取消/blur 提交 -->
            <input
              v-if="isRenaming(item)"
              :ref="onRenameInputMount"
              v-model="renameState.newName"
              class="flex-1 min-w-0 h-[20px] px-1 rounded text-[13px] font-medium bg-bg-primary text-text-primary border border-accent-blue outline-none"
              @click.stop
              @contextmenu.stop
              @keydown.enter.prevent="onRenameEnter"
              @keydown.esc.prevent.stop="cancelFavoriteRename"
              @blur="commitFavoriteRename"
            >
            <template v-else>
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
            </template>
          </div>
        </div>
      </template>
      <div v-if="favoritesStore.favorites.length === 0" class="sidebar-hint py-1.5">
        {{ $t('sidebar.favoritesHint') }}
      </div>
    </div>

    </div>

    <!-- 底部低层级工具区：ghost 图标钮 + 极轻上边线，不与列表争夺视觉 -->
    <div class="sidebar-utility-bar flex items-center gap-1" :aria-label="$t('sidebar.toolsAria')">
      <button
        class="sidebar-utility-button"
        @click="emit('toggle-theme')"
        :title="theme === 'dark' ? $t('sidebar.switchToLight') : $t('sidebar.switchToDark')"
        :aria-label="theme === 'dark' ? $t('sidebar.switchToLight') : $t('sidebar.switchToDark')"
      >
        <component :is="theme === 'dark' ? SunIcon : MoonIcon" class="w-4 h-4" />
      </button>
      <button class="sidebar-utility-button" @click="emit('open-settings')" :title="$t('sidebar.settings')" :aria-label="$t('sidebar.settings')">
        <component :is="SettingsIcon" class="w-4 h-4" />
      </button>
    </div>

    <!-- 侧栏右键菜单：浮层 DOM 由 FinderContextMenu Teleport 到 #popover-layer；
         外点关闭/与其它菜单互斥由 script 中的 document 监听负责 -->
    <FinderContextMenu
      v-if="contextMenu.visible"
      :items="contextMenu.items"
      :x="contextMenu.x"
      :y="contextMenu.y"
      @select="onSidebarMenuSelect"
      @close="closeSidebarMenu"
    />

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
import { ref, reactive, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useDevicesStore } from '@/stores/devices'
import { useTabsStore } from '@/stores/tabs'
import { useVolumesStore } from '@/stores/volumes'
import { useFavoritesStore } from '@/stores/favorites'
import DeviceDialog from './dialogs/DeviceDialog.vue'
import FinderContextMenu, { type FinderMenuItem } from './menu/FinderContextMenu.vue'
import {
  HomeIcon, DesktopIcon, DocumentIcon, DownloadIcon, ApplicationIcon, BookmarkIcon,
  LocalIcon, AndroidIcon, SmbIcon, SshIcon, WebDavIcon, IosIcon, VolumeDriveIcon,
  SunIcon, MoonIcon, SettingsIcon, CameraIcon, OhosIcon
} from './icons/sidebarIcons'
import { useDeviceScreenshot } from '@/composables/useDeviceScreenshot'
import { copyToClipboard } from '@/utils/clipboard'
import { toFileUri, getBaseName } from '@/utils/path'
import { t } from '@/i18n'
import type { Device, DetectedMobileDevice } from '@/stores/devices'
import type { Volume } from '@/stores/volumes'
import type { Favorite } from '@/types'
import type { DeviceCapabilities } from '@shared/types'

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
  if (isRenaming(fav)) return  // 行内编辑中：点击只属于输入框，不触发导航
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

// ============ 侧栏右键菜单 ============
// 复用 FinderContextMenu（NSMenu 实现）：本组件只把侧栏行语义组装成菜单项并
// 分发 action；键盘/钳制/防裁剪/Teleport 由组件提供。
//
// 外点关闭走 FileList 同款范式：document 冒泡相 click 监听 + 菜单根自带
// @click.stop（菜单内部点击不冒泡，不会误关）。注意不能用「wrapper ref
// contains()」判定 —— 菜单 DOM 被 Teleport 到 #popover-layer，wrapper 恒为空
// （TabContextMenu 曾因此菜单项点击先被外点判定吃掉）。
// 另挂 document 冒泡相 contextmenu 监听做互斥：文件列表等处开新菜单时关掉
// 侧栏菜单；事件源自侧栏自身行/任一菜单体时放行（行 handler 自管开合）。

/** 右键命中行的快照。favorite 额外携带显示组上下文（组内排序用）。 */
type SidebarMenuRow =
  | { kind: 'place'; deviceId: 'local'; path: string; name: string }
  | {
      kind: 'favorite'; deviceId: string; path: string; name: string
      groupKeys: Set<string>; canMoveUp: boolean; canMoveDown: boolean
    }
  | { kind: 'volume'; deviceId: 'local'; path: string; name: string; mountPath: string }
  | { kind: 'device'; device: Device }
  | { kind: 'mobile'; device: DetectedMobileDevice }

const contextMenu = reactive<{ visible: boolean; x: number; y: number; items: FinderMenuItem[] }>({
  visible: false, x: 0, y: 0, items: []
})
/** 打开瞬间的行快照（select 时菜单已关，靠它找回目标；openSidebarMenu 异步构建期间也用它做失效判定）。 */
let menuRow: SidebarMenuRow | null = null
const sidebarRootEl = ref<HTMLElement | null>(null)

function closeSidebarMenu(): void {
  if (!contextMenu.visible) return
  contextMenu.visible = false
  contextMenu.items = []
  menuRow = null
}

function divider(): FinderMenuItem {
  return { label: '---', action: '__divider__' }
}

async function openSidebarMenu(e: MouseEvent, row: SidebarMenuRow): Promise<void> {
  closeSidebarMenu()
  menuRow = row
  contextMenu.x = e.clientX
  contextMenu.y = e.clientY
  const items = await buildSidebarMenuItems(row)
  // 异步构建（远程收藏要查设备能力）期间用户又右键了别处 → menuRow 已换人，本次作废
  if (menuRow !== row) return
  contextMenu.items = items
  contextMenu.visible = true
}

function openSidebarMenuForDevice(device: Device, e: MouseEvent) { void openSidebarMenu(e, { kind: 'device', device }) }
function openSidebarMenuForMobile(device: DetectedMobileDevice, e: MouseEvent) { void openSidebarMenu(e, { kind: 'mobile', device }) }
function openSidebarMenuForVolume(volume: Volume, e: MouseEvent) {
  void openSidebarMenu(e, { kind: 'volume', deviceId: 'local', path: volume.mountPath, name: volume.name, mountPath: volume.mountPath })
}
function openSidebarMenuForPlace(fav: { name: string; path: string }, e: MouseEvent) {
  void openSidebarMenu(e, { kind: 'place', deviceId: 'local', path: fav.path, name: fav.name })
}
function openSidebarMenuForFavorite(item: Favorite, group: { items: Favorite[] }, e: MouseEvent) {
  const idx = group.items.indexOf(item)
  void openSidebarMenu(e, {
    kind: 'favorite',
    deviceId: item.deviceId,
    path: item.path,
    name: item.name,
    // 组内换位边界：上移/下移只在当前显示组内生效（组键集合交给 store 约束）
    groupKeys: new Set(group.items.map(f => f.deviceId + '::' + f.path)),
    canMoveUp: idx > 0,
    canMoveDown: idx >= 0 && idx < group.items.length - 1
  })
}

/**
 * 设备行菜单（位置区 SMB/SSH/WebDAV 与移动设备区共用骨架）。
 * local 行只有导航两项；远程行按连接态给「断开连接」，位置区远程设备多一项
 * 「移除设备」（移动设备走「忘记」hover 钮，不在此重复）。
 */
function buildDeviceMenuItems(device: Device | DetectedMobileDevice, isMobile: boolean): FinderMenuItem[] {
  const items: FinderMenuItem[] = [
    { label: t('sidebar.menu.open'), action: 'open', icon: 'open' },
    { label: t('sidebar.menu.openNewTab'), action: 'open-new-tab', icon: 'tab' }
  ]
  if ((device as Device).type === 'local') return items
  const connected = devicesStore.getDevice(device.id)?.status === 'connected'
  items.push(divider())
  if (connected) {
    items.push({ label: t('sidebar.menu.disconnect'), action: 'disconnect', icon: 'disconnect' })
  }
  if (!isMobile) {
    items.push({ label: t('sidebar.menu.removeDevice'), action: 'remove-device', icon: 'trash' })
  }
  return items
}

/**
 * 目录行菜单（常用位置 / 收藏 / 卷）。分组顺序：导航 ▸（收藏：重命名·排序·移除
 * ▸ 卷：弹出）▸ 目录工具 ▸ 宿主集成（仅 local）▸ 显示简介。
 * 工具组门控与 FileList 背景菜单同判定：查重/空间 canList+canStat、grep
 * canGrepContent；local 行不发 IPC（caps=null 视作全能力）。
 */
async function buildSidebarMenuItems(row: SidebarMenuRow): Promise<FinderMenuItem[]> {
  if (row.kind === 'device') return buildDeviceMenuItems(row.device, false)
  if (row.kind === 'mobile') return buildDeviceMenuItems(row.device, true)

  const caps: DeviceCapabilities | null = row.deviceId === 'local'
    ? null
    : await devicesStore.getDeviceCapabilities(row.deviceId).catch(() => null)
  if (menuRow !== row) return []

  const panes = tabsStore.activeTab?.panes ?? []
  const hasPanes = panes.length > 0

  // ── 导航组（compare/diff/工具 tab 无面板时整组隐藏，避免点了没反应）──
  const nav: FinderMenuItem[] = hasPanes
    ? [
        { label: t('sidebar.menu.open'), action: 'open', icon: 'open' },
        { label: t('sidebar.menu.openNewTab'), action: 'open-new-tab', icon: 'tab' },
        { label: t('sidebar.menu.openSplitTab'), action: 'open-split-tab', icon: 'split' },
        { label: t('sidebar.menu.openOppositePane'), action: 'open-opposite-pane', icon: 'swapPane' }
      ]
    : []

  // ── 收藏管理组（Finder 惯例：紧跟导航组）──
  const manage: FinderMenuItem[] = []
  if (row.kind === 'favorite') {
    manage.push(
      { label: t('sidebar.menu.renameFavorite'), action: 'rename-favorite', icon: 'rename' },
      { label: t('sidebar.menu.moveUp'), action: 'move-up', icon: 'up', disabled: !row.canMoveUp },
      { label: t('sidebar.menu.moveDown'), action: 'move-down', icon: 'down', disabled: !row.canMoveDown },
      { label: t('sidebar.menu.removeFromSidebar'), action: 'remove-favorite', icon: 'trash' }
    )
  }

  // ── 目录级工具组 ──
  const tools: FinderMenuItem[] = []
  const canListStat = !caps || (caps.canList && caps.canStat)
  if (canListStat) {
    tools.push(
      { label: t('sidebar.menu.findDuplicates'), action: 'find-duplicates', icon: 'duplicates' },
      { label: t('sidebar.menu.analyzeSpace'), action: 'analyze-space', icon: 'treemap' }
    )
    // 目录对比：对面一侧取当前标签的左右面板；单面板时「右面板」禁用
    if (hasPanes) {
      tools.push({
        label: t('sidebar.menu.compareDir'), action: 'compare-menu', icon: 'compare',
        children: [
          { label: t('sidebar.menu.compareWithLeft'), action: 'compare:left', disabled: panes.length < 1 },
          { label: t('sidebar.menu.compareWithRight'), action: 'compare:right', disabled: panes.length < 2 }
        ]
      })
    }
  }
  if (!caps || caps.canGrepContent !== false) {
    tools.push({ label: t('sidebar.menu.searchInFolder'), action: 'grep-here', icon: 'grep' })
  }

  // ── 宿主集成组（仅本地路径有 Finder/Terminal 语义）──
  const host: FinderMenuItem[] = []
  if (row.deviceId === 'local') {
    host.push(
      { label: t('sidebar.menu.revealInFinder'), action: 'reveal-in-finder', icon: 'finder' },
      { label: t('sidebar.menu.openInTerminal'), action: 'open-in-terminal', icon: 'terminal' },
      {
        label: t('fileList.menu.copyPath'), action: 'copy-path-menu', icon: 'copyPath',
        children: [
          { label: t('fileList.menu.copyPathPosix'), action: 'copy-path:posix' },
          { label: t('fileList.menu.copyPathUri'), action: 'copy-path:uri' },
          { label: t('fileList.menu.copyPathName'), action: 'copy-path:name' }
        ]
      }
    )
  }

  // ── 尾组：卷的「弹出」+ 显示简介 ──
  const tail: FinderMenuItem[] = []
  if (row.kind === 'volume') {
    tail.push({ label: t('sidebar.menu.eject', { name: row.name }), action: 'eject', icon: 'eject' })
  }
  tail.push({ label: t('sidebar.menu.getInfo'), action: 'info', icon: 'info', shortcut: '⌘I' })

  // 非空组之间插分隔线拼装
  const groups = [nav, manage, tools, host, tail].filter(g => g.length > 0)
  const items: FinderMenuItem[] = []
  groups.forEach((g, i) => {
    if (i > 0) items.push(divider())
    items.push(...g)
  })
  return items
}

async function onSidebarMenuSelect(action: string): Promise<void> {
  const row = menuRow
  closeSidebarMenu()
  if (!row) return
  try {
    await dispatchSidebarAction(row, action)
  } catch (error) {
    console.error('[AppSidebar] 侧栏菜单动作失败:', action, error)
  }
}

async function dispatchSidebarAction(row: SidebarMenuRow, action: string): Promise<void> {
  // ── 设备行（位置区 / 移动设备区）──
  if (row.kind === 'device' || row.kind === 'mobile') {
    switch (action) {
      case 'open':
        if (row.kind === 'device') await selectDevice(row.device)
        else await selectMobileDevice(row.device)
        return
      case 'open-new-tab': {
        const device = row.device
        try {
          if ((device as Device).type !== 'local') await devicesStore.connectDevice(device.id)
          tabsStore.openPathInNewTab(device.id, (device as Device).rootPath || '/')
        } catch (error) {
          alert(t('sidebar.connectFailed', { name: device.name, message: error instanceof Error ? error.message : String(error) }))
        }
        return
      }
      case 'disconnect':
        await devicesStore.disconnectDevice(row.device.id)
        return
      case 'remove-device':
        await devicesStore.removeDeviceCompletely(row.device.id)
        return
    }
    return
  }

  // ── 目录行（常用位置 / 收藏 / 卷）──
  const { deviceId, path, name } = row
  switch (action) {
    case 'open': {
      const pane = tabsStore.activePane
      if (!pane) return
      pane.deviceId = deviceId
      tabsStore.navigatePane(pane.id, path)
      return
    }
    case 'open-new-tab':
      tabsStore.openPathInNewTab(deviceId, path)
      return
    case 'open-split-tab':
      tabsStore.openPathInSplitTab(deviceId, path, tabsStore.activePane?.deviceId, tabsStore.activePane?.path)
      return
    case 'open-opposite-pane': {
      const tab = tabsStore.activeTab
      if (!tab || tab.panes.length === 0) return
      let other = tab.panes.find(p => p.id !== tab.activePaneId)
      if (!other) {
        // 单面板：现场分屏出第二面板（新面板成为活动面板），再重新读取引用
        tabsStore.toggleActiveSplit()
        other = tabsStore.activeTab?.panes[1] ?? null
      }
      if (!other) return
      other.deviceId = deviceId
      tabsStore.navigatePane(other.id, path)
      return
    }
    case 'find-duplicates':
      tabsStore.openDuplicatesTab(deviceId, path)
      return
    case 'analyze-space':
      tabsStore.openSpaceTab(deviceId, path)
      return
    case 'grep-here':
      tabsStore.openGrepTab({ deviceId, rootPath: path, pattern: '', isRegex: false, caseSensitive: false })
      return
    case 'compare:left':
    case 'compare:right': {
      const pane = action === 'compare:left' ? tabsStore.activeTab?.panes[0] : tabsStore.activeTab?.panes[1]
      if (!pane) return
      tabsStore.openCompareTab(deviceId, path, pane.deviceId, pane.path)
      return
    }
    case 'reveal-in-finder':
      await window.fileman.showInFolder(path)
      return
    case 'open-in-terminal':
      await window.fileman.openInTerminal(path)
      return
    case 'copy-path:posix':
      await copyToClipboard(path)
      return
    case 'copy-path:uri':
      await copyToClipboard(toFileUri(path))
      return
    case 'copy-path:name':
      await copyToClipboard(getBaseName(path))
      return
    case 'info': {
      // getStats 返回 FileStats（无 name/path），简介窗口要的是 FileInfo —— 行上已有两者
      const stats = await window.fileman.getStats(deviceId, path)
      const device = devicesStore.getDevice(deviceId)
      await window.fileman.openFileInfoWindow({
        deviceId,
        deviceType: device?.type ?? 'local',
        deviceName: device?.name ?? t('devices.localName'),
        files: [{ ...stats, name, path }]
      })
      return
    }
    case 'eject':
      if (row.kind !== 'volume') return
      try {
        await window.fileman.volumes.eject(row.mountPath)
      } catch (error) {
        // 卷列表无需手动刷新（VolumeScanner 轮询推送自愈）；失败用侧栏既有 alert 风格反馈
        alert(t('sidebar.menu.ejectFailed', { name, message: error instanceof Error ? error.message : String(error) }))
      }
      return
    case 'rename-favorite':
      if (row.kind === 'favorite') startFavoriteRename(row.deviceId, row.path, row.name)
      return
    case 'move-up':
      if (row.kind === 'favorite') await favoritesStore.reorder(deviceId, path, -1, row.groupKeys)
      return
    case 'move-down':
      if (row.kind === 'favorite') await favoritesStore.reorder(deviceId, path, 1, row.groupKeys)
      return
    case 'remove-favorite':
      await favoritesStore.remove(deviceId, path)
      return
  }
}

// ── 收藏行内重命名（FileList 内联重命名同范式：Enter 提交 / Esc 取消 / blur 提交；
//    isComposing 守卫 IME 回车、先置 active=false 防 Enter→blur 双提交）──
const renameState = reactive<{
  active: boolean
  deviceId: string
  path: string
  originalName: string
  newName: string
}>({ active: false, deviceId: '', path: '', originalName: '', newName: '' })

/** v-for 内的 ref 是数组语义，改用函数 ref 收唯一挂载的输入框 */
const renameInputEl = ref<HTMLInputElement | null>(null)
function onRenameInputMount(el: unknown): void {
  renameInputEl.value = (el as HTMLInputElement | null) ?? null
}

function isRenaming(fav: Favorite): boolean {
  return renameState.active && renameState.deviceId === fav.deviceId && renameState.path === fav.path
}

function startFavoriteRename(deviceId: string, path: string, name: string): void {
  renameState.deviceId = deviceId
  renameState.path = path
  renameState.originalName = name
  renameState.newName = name
  renameState.active = true
  nextTick(() => {
    renameInputEl.value?.focus()
    renameInputEl.value?.select()
  })
}

function cancelFavoriteRename(): void {
  renameState.active = false
}

function commitFavoriteRename(): void {
  if (!renameState.active) return  // Enter 已提交过 / Esc 已取消后的 blur 余波
  renameState.active = false
  const newName = renameState.newName.trim()
  if (newName && newName !== renameState.originalName) {
    void favoritesStore.rename(renameState.deviceId, renameState.path, newName)
  }
}

function onRenameEnter(e: KeyboardEvent): void {
  if (e.isComposing) return  // IME 输入中的回车是选字，不是提交
  commitFavoriteRename()
}

// ── 外点关闭与跨菜单互斥（document 冒泡相；挂卸随组件生命周期）──
function onDocClickCloseMenu(): void {
  closeSidebarMenu()  // 菜单体内点击被 .context-menu 根 @click.stop 拦截，到不了这里
}

function onDocContextMenu(e: MouseEvent): void {
  if (!contextMenu.visible) return
  const target = e.target as Element | null
  // 菜单体内右键：交给菜单自身（Finder 行为：不关）
  if (target?.closest?.('.context-menu')) return
  // 侧栏行右键：行 handler 自管（openSidebarMenu 会先关旧再开新）
  if (sidebarRootEl.value?.contains(target as Node)) return
  closeSidebarMenu()
}

onMounted(() => {
  document.addEventListener('click', onDocClickCloseMenu)
  document.addEventListener('contextmenu', onDocContextMenu)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClickCloseMenu)
  document.removeEventListener('contextmenu', onDocContextMenu)
})
</script>
