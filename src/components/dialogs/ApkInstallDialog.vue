<template>
  <BaseSheet
    :title="$t('dialogs.apkInstall.title')"
    :subtitle="$t('dialogs.apkInstall.subtitle', { count: files.length, size: totalSizeText }, files.length)"
    :width="480"
    sheet-class="max-h-[80vh]"
    body-class="min-h-0 flex-1 overflow-auto"
    as="form"
    @close="emit('close')"
    @submit="confirm"
  >
    <!-- 安装包卡片：单个文件显示应用名 / 版本 / 大小与图标；解析不到退回文件名 -->
    <div v-if="single" class="flex items-center gap-3 rounded-lg bg-bg-tertiary p-3">
      <span class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[10px] bg-bg-primary">
        <img v-if="iconSrc" :src="iconSrc" class="h-9 w-9 rounded-lg object-contain" alt="" />
        <svg v-else class="h-6 w-6 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
          <path d="M4 7.5l8 4.5 8-4.5" />
          <path d="M12 12v9" />
        </svg>
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-text-primary" :title="primaryText">{{ primaryText }}</p>
        <p class="truncate text-xs text-text-tertiary">{{ secondaryText }}</p>
      </div>
    </div>

    <!-- 目标设备：本机 APK 单选；手机上的 APK 目标固定为该设备 -->
    <div class="mt-4">
      <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">{{ $t('dialogs.apkInstall.targetLabel') }}</h4>
      <p v-if="!isLocalSource" class="rounded-lg bg-bg-tertiary p-3 text-sm text-text-secondary">
        {{ $t('dialogs.apkInstall.fixedTarget', { device: sourceDeviceName }) }}
      </p>
      <p v-else-if="loading || targets.length === 0" class="rounded-lg bg-bg-tertiary p-3 text-xs text-text-tertiary">
        {{ loading ? $t('dialogs.apkInstall.loading') : $t('dialogs.apkInstall.noDevices') }}
      </p>
      <div v-else role="radiogroup" :aria-label="$t('dialogs.apkInstall.targetLabel')" class="flex flex-col gap-1.5">
        <label
          v-for="target in targets"
          :key="target.deviceId"
          class="flex items-center gap-2.5 rounded-[10px] border px-3 py-2 text-sm transition-colors"
          :class="rowClass(target)"
          :style="rowStyle(target)"
          :aria-disabled="!target.authorized"
        >
          <input
            v-model="selectedId"
            type="radio"
            name="apk-install-target"
            :value="target.deviceId"
            :disabled="!target.authorized"
            class="accent-accent"
          />
          <span class="min-w-0 flex-1 truncate">{{ target.name }}</span>
          <span
            v-if="target.authorized"
            class="flex-shrink-0 font-mono text-xs text-text-tertiary"
            :title="target.serial"
          >{{ target.serial }}</span>
          <span v-else class="flex-shrink-0 text-xs text-text-tertiary">{{ $t('dialogs.apkInstall.unauthorizedHint') }}</span>
        </label>
      </div>
    </div>

    <p class="mt-3 text-xs leading-relaxed text-text-tertiary">{{ $t('dialogs.apkInstall.note') }}</p>

    <template #footer>
      <button type="button" class="finder-btn-secondary" @click="emit('close')">{{ $t('dialogs.apkInstall.cancel') }}</button>
      <button type="submit" class="finder-btn-primary" :disabled="!canConfirm">{{ $t('dialogs.apkInstall.confirm', files.length) }}</button>
    </template>
  </BaseSheet>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { AndroidInstallTarget, ApkInfo } from '@shared/types'
import BaseSheet from './BaseSheet.vue'
import { formatSize } from '@/utils/path'
import { t } from '@/i18n'

const props = defineProps<{
  files: Array<{ path: string; name: string; isDirectory: boolean; size?: number }>
  /** 'local' 或目标 Android 设备自身的 deviceId（手机上的 APK 直接装到该设备）。 */
  sourceDeviceId: string
  sourceDeviceName: string
}>()
const emit = defineEmits<{ close: []; confirm: [targetDeviceId: string] }>()

/** 上次使用的目标设备（多设备时默认选中）。 */
const TARGET_STORAGE_KEY = 'fileman-apk-install-target'

const isLocalSource = computed(() => props.sourceDeviceId === 'local')
const single = computed(() => (props.files.length === 1 ? props.files[0] : null))
const totalSizeText = computed(() => formatSize(props.files.reduce((sum, file) => sum + (file.size ?? 0), 0)))

const info = ref<ApkInfo | null>(null)
const iconSrc = computed(() => (info.value?.iconBase64 ? `data:${info.value.iconMime ?? 'image/png'};base64,${info.value.iconBase64}` : null))

const targets = ref<AndroidInstallTarget[]>([])
const loading = ref(true)
const selectedId = ref<string | null>(null)

const primaryText = computed(() => info.value?.appName ?? single.value?.name ?? '')
const secondaryText = computed(() => {
  const size = formatSize(single.value?.size ?? 0)
  const apk = info.value
  if (!apk) return size
  const version = apk.versionName != null && apk.versionCode != null
    ? t('dialogs.apkInstall.versionWithCode', { name: apk.versionName, code: apk.versionCode })
    : apk.versionCode != null
      ? t('dialogs.apkInstall.versionCodeOnly', { code: apk.versionCode })
      : apk.versionName
  return version ? `${version} · ${size}` : size
})

const canConfirm = computed(() => (
  isLocalSource.value
    ? targets.value.some(target => target.deviceId === selectedId.value && target.authorized)
    : true
))

function isSelected(target: AndroidInstallTarget): boolean {
  return target.authorized && target.deviceId === selectedId.value
}

function rowClass(target: AndroidInstallTarget): string[] {
  return [
    isSelected(target) ? 'border-accent-blue' : 'border-border',
    !target.authorized ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-bg-hover'
  ]
}

// 选中态用 color-mix 实色 tint（Tailwind /opacity 在 CSS 变量色上静默失效）
function rowStyle(target: AndroidInstallTarget): Record<string, string> | undefined {
  return isSelected(target) ? { background: 'color-mix(in srgb, var(--accent-blue) 10%, transparent)' } : undefined
}

onMounted(() => {
  if (isLocalSource.value) void loadTargets()
  if (isLocalSource.value && single.value) void loadInfo()
})

async function loadTargets() {
  loading.value = true
  try {
    targets.value = await window.fileman.apkInstallTargets()
  } catch (error) {
    console.error('[ApkInstallDialog] list targets failed:', error)
    targets.value = []
  } finally {
    loading.value = false
  }
  const authorized = targets.value.filter(target => target.authorized)
  let remembered: string | null = null
  try { remembered = localStorage.getItem(TARGET_STORAGE_KEY) } catch { /* 隐私模式等：仅影响默认选中 */ }
  const preferred = authorized.find(target => target.deviceId === remembered)
    ?? (authorized.length === 1 ? authorized[0] : null)
  selectedId.value = preferred?.deviceId ?? null
}

/** 本机单个 APK 的包信息（图标 / 应用名 / 版本）；失败退回文件名，不阻塞安装。 */
async function loadInfo() {
  const path = single.value?.path
  if (!path) return
  try {
    info.value = await window.fileman.getApkInfo(path)
  } catch (error) {
    console.warn('[ApkInstallDialog] apk info unavailable:', error)
    info.value = null
  }
}

function confirm() {
  if (!canConfirm.value) return
  if (!isLocalSource.value) {
    emit('confirm', props.sourceDeviceId)
    return
  }
  const targetId = selectedId.value
  if (!targetId) return
  try { localStorage.setItem(TARGET_STORAGE_KEY, targetId) } catch { /* 同上 */ }
  emit('confirm', targetId)
}
</script>
