<template>
  <!-- 保存 Sheet（macOS 顶部吸附式实色面板，替换旧版半透明居中弹窗）：
       意图 segmented（导出副本默认/替换原文件）→ 存储为/位置 → 摘要 → 折叠导出选项。
       遮罩不响应点击（防误触丢配置）；Esc=取消；替换需二次确认。 -->
  <div class="save-sheet-scrim absolute inset-0 z-[80]" @pointerdown.self.prevent @wheel.prevent>
    <form
      class="save-sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="$t('dialogs.saveImage.title')"
      @submit.prevent="onPrimary"
    >
      <h2 class="sheet-title">{{ $t('dialogs.saveImage.title') }}</h2>

      <!-- 保存意图（segmented） -->
      <div class="segmented mt-4" role="radiogroup" :aria-label="$t('dialogs.saveImage.modeAria')">
        <button
          type="button"
          class="segmented-item"
          :class="{ 'is-selected': intent === 'copy' }"
          role="radio"
          :aria-checked="intent === 'copy'"
          @click="intent = 'copy'"
        >{{ $t('dialogs.saveImage.modeCopy') }}</button>
        <button
          type="button"
          class="segmented-item"
          :class="{ 'is-selected': intent === 'overwrite' }"
          role="radio"
          :aria-checked="intent === 'overwrite'"
          @click="intent = 'overwrite'"
        >{{ $t('dialogs.saveImage.modeReplace') }}</button>
      </div>

      <!-- 替换原文件：风险提示（无存储为/位置行） -->
      <div v-if="intent === 'overwrite'" class="replace-warning mt-4 flex gap-2.5">
        <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
        <p>{{ $t('dialogs.saveImage.replaceWarn', { name: fileName }) }}</p>
      </div>

      <!-- 导出副本表单 -->
      <div v-else class="mt-4 flex flex-col gap-2.5">
        <div class="form-row">
          <label class="form-label" for="save-sheet-name">{{ $t('dialogs.saveImage.saveAs') }}</label>
          <div class="flex-1 flex flex-col gap-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <input
                id="save-sheet-name"
                ref="nameInputRef"
                v-model="nameInput"
                class="name-input"
                :class="{ 'is-invalid': nameError }"
                type="text"
                spellcheck="false"
                autocomplete="off"
                @input="touchOptions"
              />
              <span class="ext-chip" :title="outputPath">{{ '.' + outputExt }}</span>
            </div>
            <p v-if="nameError" class="field-error">{{ nameError }}</p>
            <p v-else class="preview-line">{{ $t('dialogs.saveImage.willSaveAs', { name: `${nameInput || ''}.${outputExt}` }) }}</p>
          </div>
        </div>

        <div class="form-row">
          <span class="form-label">{{ $t('dialogs.saveImage.location') }}</span>
          <div class="flex-1 flex items-center gap-2 min-w-0">
            <svg class="w-4 h-4 text-text-secondary flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M3.75 6A2.25 2.25 0 016 3.75h3.193c.6 0 1.17.24 1.59.66l1.2 1.2a.75.75 0 00.53.22h5.527A2.25 2.25 0 0120.25 8.1v9.65A2.25 2.25 0 0118 20.03H6A2.25 2.25 0 013.75 17.78V6z" /></svg>
            <div class="flex-1 min-w-0">
              <p class="location-name">{{ customDir ? $t('dialogs.saveImage.choose') : $t('dialogs.saveImage.sameFolder') }}</p>
              <p class="location-path" :title="customDir ?? fileDir">{{ customDir ?? fileDir }}</p>
            </div>
            <button type="button" class="edit-secondary-btn !h-7 flex-shrink-0" @click="chooseDirectory">{{ $t('dialogs.saveImage.choose') }}</button>
          </div>
        </div>

        <!-- 同名冲突提示（后端自动 -1 递增） -->
        <p v-if="conflictName" class="conflict-line">
          {{ $t('dialogs.saveImage.conflict', { name: `${nameInput}.${outputExt}`, finalName: conflictName }) }}
        </p>
      </div>

      <!-- 输出摘要（恒常预估） -->
      <div class="summary-bar mt-4" :title="outputPath">
        <template v-if="estimating">{{ $t('dialogs.saveImage.estimating') }}</template>
        <template v-else-if="estimate">{{ $t('dialogs.saveImage.summary', { format: estimate.format.toUpperCase(), width: estimate.width, height: estimate.height, size: formatBytes(estimate.estimatedBytes) }) }}</template>
        <template v-else>{{ $t('dialogs.saveImage.estimateUnavailable') }}</template>
      </div>

      <!-- 导出选项（默认折叠） -->
      <button type="button" class="disclosure mt-3" :aria-expanded="optionsOpen" @click="optionsOpen = !optionsOpen">
        <svg class="w-3 h-3 transition-transform duration-150" :class="{ 'rotate-90': optionsOpen }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" /></svg>
        <span>{{ $t('dialogs.saveImage.options') }}</span>
      </button>
      <div v-if="optionsOpen" class="options-block mt-2 flex flex-col gap-2.5">
        <div class="form-row">
          <label class="form-label" for="save-sheet-format">{{ $t('dialogs.saveImage.format') }}</label>
          <div class="flex-1 flex items-center gap-2">
            <select id="save-sheet-format" v-model="format" class="format-select" :disabled="intent === 'overwrite'" @change="touchOptions">
              <option value="keep">{{ $t('dialogs.saveImage.formatKeep') }}</option>
              <option value="jpeg">JPEG</option>
              <option value="png">PNG</option>
              <option value="webp">WebP</option>
            </select>
            <p v-if="intent === 'overwrite'" class="option-note">{{ $t('dialogs.saveImage.replaceLockedFormat') }}</p>
          </div>
        </div>
        <div class="form-row">
          <span class="form-label">{{ $t('dialogs.saveImage.quality', { value: quality }) }}</span>
          <div class="flex-1 flex items-center gap-3">
            <input
              v-model.number="quality"
              type="range"
              min="1"
              max="100"
              class="flex-1 accent-blue-500"
              :disabled="qualityDisabled"
              :aria-label="$t('dialogs.saveImage.quality', { value: quality })"
              @input="touchOptions"
            />
            <p v-if="qualityDisabled" class="option-note">{{ $t('dialogs.saveImage.qualityDisabledPng') }}</p>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label" for="save-sheet-scale">{{ $t('dialogs.saveImage.scaleImage') }}</label>
          <div class="flex-1 flex items-center gap-2">
            <button
              id="save-sheet-scale"
              type="button"
              class="switch"
              role="switch"
              :aria-checked="scaleOn"
              @click="scaleOn = !scaleOn; touchOptions()"
            ><span class="switch-knob" :class="{ 'is-on': scaleOn }"></span></button>
            <template v-if="scaleOn">
              <input
                v-model.number="maxEdge"
                type="number"
                min="256"
                :max="Math.max(dims.width, dims.height)"
                class="max-edge-input"
                :aria-label="$t('dialogs.saveImage.maxEdge')"
                @input="touchOptions"
              />
              <span class="text-xs text-text-secondary tabular-nums">{{ $t('dialogs.saveImage.scaledTo', { width: scaledDims.width, height: scaledDims.height }) }}</span>
            </template>
          </div>
        </div>
      </div>

      <!-- 错误行（就近 + 可重试） -->
      <div v-if="error" class="error-row mt-3">
        <span class="flex-1">{{ error }}</span>
        <button type="button" class="retry-link" @click="retry">{{ $t('dialogs.saveImage.retry') }}</button>
      </div>

      <!-- 底部操作（右对齐，32px） -->
      <div class="sheet-footer mt-5 flex justify-end gap-2">
        <button type="button" class="edit-secondary-btn sheet-btn" :disabled="applying" @click="emit('close')">{{ $t('dialogs.saveImage.cancel') }}</button>
        <button type="submit" class="edit-primary-btn sheet-btn" :disabled="applying || !!nameError">
          {{ applying ? $t('dialogs.saveImage.saving') : intent === 'copy' ? $t('dialogs.saveImage.saveCopy') : $t('dialogs.saveImage.replaceSave') }}
        </button>
      </div>

      <!-- 替换二次确认（标准 Alert，红色确认钮） -->
      <div v-if="replaceConfirmOpen" class="confirm-overlay absolute inset-0 z-10 flex items-center justify-center bg-black/35" @pointerdown.self.prevent>
        <div class="confirm-alert edit-panel p-5 w-[320px] text-center" role="alertdialog" :aria-label="$t('dialogs.saveImage.replaceConfirmTitle', { name: fileName })">
          <svg class="w-8 h-8 mx-auto mb-2 text-[color:var(--edit-warning)]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
          <h3 class="text-sm font-semibold">{{ $t('dialogs.saveImage.replaceConfirmTitle', { name: fileName }) }}</h3>
          <p class="mt-1.5 text-xs text-text-secondary">{{ $t('dialogs.saveImage.replaceConfirmBody') }}</p>
          <div class="mt-4 flex justify-center gap-2">
            <button type="button" class="edit-secondary-btn sheet-btn" @click="replaceConfirmOpen = false">{{ $t('dialogs.saveImage.replaceCancel') }}</button>
            <button type="button" class="replace-action sheet-btn" @click="doConfirm">{{ $t('dialogs.saveImage.replaceAction') }}</button>
          </div>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import type { EditCompressParams, EditEstimateResult, EditSaveSpec } from '@shared/types'

const props = defineProps<{
  /** 原文件名（含扩展名） */
  fileName: string
  /** 原图目录（默认输出位置） */
  fileDir: string
  sourceBytes?: number
  dims: { width: number; height: number }
  estimate: EditEstimateResult | null
  estimating: boolean
  applying: boolean
  error: string
  /** 压缩入口进入：导出选项默认展开且参数生效 */
  compressDefault?: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: [save: EditSaveSpec, params: EditCompressParams | null]
  'params-change': [params: EditCompressParams]
}>()

// ── 表单状态 ─────────────────────────────────────────────────────────────────
const intent = ref<'copy' | 'overwrite'>('copy')
const baseName = props.fileName.replace(/\.[^.]+$/, '')
const originalExt = (props.fileName.match(/\.([^.]+)$/)?.[1] ?? 'jpg').toLowerCase()
const nameInput = ref(`${baseName}_edited`)
const nameInputRef = ref<HTMLInputElement | null>(null)
const customDir = ref<string | null>(null)
const optionsOpen = ref(!!props.compressDefault)
/** 用户是否动过导出选项（或压缩入口）——决定 confirm 是否携带 compress op。 */
const optionsTouched = ref(!!props.compressDefault)
const format = ref<'keep' | 'jpeg' | 'png' | 'webp'>('keep')
const quality = ref(85)
const scaleOn = ref(false)
const maxEdge = ref(Math.max(props.dims.width, props.dims.height) || 4096)
const replaceConfirmOpen = ref(false)
const conflictName = ref<string | null>(null)

/** keep：png/webp 保原扩展，其余（jpg/heic/tiff…）输出统一映射 jpg。 */
const outputExt = computed(() => {
  if (format.value === 'jpeg') return 'jpg'
  if (format.value === 'png') return 'png'
  if (format.value === 'webp') return 'webp'
  return originalExt === 'png' || originalExt === 'webp' ? originalExt : 'jpg'
})

const qualityDisabled = computed(() => (format.value === 'keep' ? ['png'].includes(outputExt.value) : format.value === 'png'))

const nameError = computed(() => {
  const v = nameInput.value.trim()
  if (!v) return 'dialogs.saveImage.nameEmpty' as const
  if (v.includes('/') || v.includes('\\') || v === '.' || v === '..') return 'dialogs.saveImage.nameInvalid' as const
  return null
})

const scaledDims = computed(() => {
  const long = Math.max(props.dims.width, props.dims.height)
  const edge = Math.max(256, Math.min(maxEdge.value || long, long))
  const ratio = edge / (long || 1)
  return { width: Math.round(props.dims.width * ratio), height: Math.round(props.dims.height * ratio) }
})

const outputPath = computed(() => `${customDir.value ?? props.fileDir}/${nameInput.value || '…'}${conflictName.value ? `（→ ${conflictName.value}）` : ''}.${outputExt.value}`)

const params = computed<EditCompressParams>(() => ({
  quality: quality.value,
  maxEdge: scaleOn.value && maxEdge.value > 0 ? maxEdge.value : undefined,
  format: format.value
}))

function touchOptions() {
  optionsTouched.value = true
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// ── 预估与冲突探测（300ms 节流） ──────────────────────────────────────────────
let notifyTimer: ReturnType<typeof setTimeout> | null = null
watch([params, intent], () => {
  if (notifyTimer) clearTimeout(notifyTimer)
  notifyTimer = setTimeout(() => {
    emit('params-change', params.value)
    void checkConflict()
  }, 300)
}, { immediate: true })

async function checkConflict() {
  if (intent.value !== 'copy' || !nameInput.value.trim()) {
    conflictName.value = null
    return
  }
  const candidate = `${customDir.value ?? props.fileDir}/${nameInput.value.trim()}.${outputExt.value}`
  try {
    const exists = await window.fileman.exists('local', candidate)
    conflictName.value = exists ? `${nameInput.value.trim()}-1.${outputExt.value}` : null
  } catch {
    conflictName.value = null
  }
}

async function chooseDirectory() {
  try {
    const dir = await window.fileman.pickDirectory(props.fileDir)
    if (dir) {
      customDir.value = dir
      void checkConflict()
    }
  } catch (err) {
    console.error('[ImageSaveSheet] pickDirectory failed:', err)
  }
}

// ── 确认 ─────────────────────────────────────────────────────────────────────
let lastConfirm: { save: EditSaveSpec; params: EditCompressParams | null } | null = null

function onPrimary() {
  if (props.applying || nameError.value) return
  if (intent.value === 'overwrite') {
    replaceConfirmOpen.value = true
    return
  }
  doConfirm()
}

function doConfirm() {
  replaceConfirmOpen.value = false
  const save: EditSaveSpec =
    intent.value === 'overwrite'
      ? { mode: 'overwrite' }
      : {
          mode: 'copy',
          name: nameInput.value.trim(),
          dir: customDir.value ?? undefined,
          format: format.value !== 'keep' ? format.value : undefined
        }
  const out = optionsTouched.value || props.compressDefault ? params.value : null
  lastConfirm = { save, params: out }
  emit('confirm', save, out)
}

function retry() {
  if (lastConfirm) emit('confirm', lastConfirm.save, lastConfirm.params)
}

// Esc=取消（二次确认打开时先关确认；都由本层消费，不落入画布/退出阶梯）
useKeyInterceptor(e => {
  if (e.key !== 'Escape') return false
  e.preventDefault()
  if (replaceConfirmOpen.value) replaceConfirmOpen.value = false
  else emit('close')
  return true
})

onUnmounted(() => {
  if (notifyTimer) clearTimeout(notifyTimer)
})

// 打开即聚焦文件名（macOS Sheet 惯例）
void nextTick(() => nameInputRef.value?.focus())
</script>

<style scoped>
.save-sheet-scrim {
  background: var(--edit-scrim);
}

/* 顶部吸附实色面板：下圆角 10、240ms 下滑入场 */
.save-sheet {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: min(500px, calc(100% - 32px));
  padding: 20px;
  border: 1px solid var(--edit-hairline);
  border-top: 0;
  border-radius: 0 0 10px 10px;
  background: var(--edit-surface);
  box-shadow: var(--edit-shadow-sheet);
  animation: sheet-in 240ms ease-out;
}
@keyframes sheet-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .save-sheet {
    animation: none;
  }
}

.sheet-title {
  font-size: 15px;
  font-weight: 600;
  text-align: center;
  color: var(--finder-label);
}

.segmented {
  display: flex;
  height: 28px;
  padding: 2px;
  border-radius: 7px;
  background: var(--finder-control);
}
.segmented-item {
  flex: 1;
  border: 0;
  border-radius: 5px;
  font-size: 13px;
  color: var(--finder-secondary-label);
  background: transparent;
}
.segmented-item.is-selected {
  background: var(--edit-surface);
  color: var(--finder-label);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.form-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 36px;
}
.form-row > .form-label {
  width: 56px;
  flex-shrink: 0;
  padding-top: 6px;
  font-size: 13px;
  text-align: right;
  color: var(--finder-secondary-label);
}

.name-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--edit-hairline);
  border-radius: 6px;
  font-size: 13px;
  color: var(--finder-label);
  background: var(--finder-canvas);
}
.name-input:focus {
  outline: none;
  border-color: var(--finder-selection);
  box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.25);
}
.name-input.is-invalid {
  border-color: var(--accent-red);
}
.ext-chip {
  height: 28px;
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  border: 1px solid var(--edit-hairline);
  border-radius: 6px;
  font-size: 12px;
  color: var(--finder-secondary-label);
  flex-shrink: 0;
}
.field-error {
  font-size: 11px;
  color: var(--accent-red);
  margin: 0;
}
.preview-line,
.location-path,
.option-note {
  font-size: 11px;
  color: var(--finder-secondary-label);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.location-name {
  font-size: 13px;
  color: var(--finder-label);
  margin: 0;
}

.conflict-line {
  margin: 0;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11px;
  color: var(--edit-warning);
  background: color-mix(in srgb, var(--edit-warning) 12%, transparent);
}

.summary-bar {
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 12px;
  color: var(--finder-secondary-label);
  background: var(--finder-control);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
}

.disclosure {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  padding: 0;
  font-size: 13px;
  color: var(--finder-secondary-label);
  background: transparent;
}
.disclosure:hover {
  color: var(--finder-label);
}

.format-select {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--edit-hairline);
  border-radius: 6px;
  font-size: 13px;
  color: var(--finder-label);
  background: var(--finder-canvas);
}
.format-select:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* macOS 开关 */
.switch {
  width: 36px;
  height: 22px;
  border-radius: 9999px;
  border: 0;
  background: var(--finder-control);
  position: relative;
  transition: background-color 150ms ease;
  flex-shrink: 0;
}
.switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform 150ms ease;
}
.switch-knob.is-on {
  transform: translateX(14px);
}
.switch:has(.switch-knob.is-on) {
  background: var(--finder-selection);
}

.max-edge-input {
  width: 72px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--edit-hairline);
  border-radius: 6px;
  font-size: 13px;
  color: var(--finder-label);
  background: var(--finder-canvas);
}

.replace-warning {
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--finder-label);
  background: color-mix(in srgb, var(--edit-warning) 12%, transparent);
}
.replace-warning p {
  margin: 0;
}
.replace-warning svg {
  color: var(--edit-warning);
}

.error-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--accent-red);
  background: color-mix(in srgb, var(--accent-red) 10%, transparent);
}
.retry-link {
  border: 0;
  padding: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent-red);
  text-decoration: underline;
  background: transparent;
  flex-shrink: 0;
}

.sheet-btn {
  height: 32px;
  padding: 0 18px;
}
.replace-action {
  height: 32px;
  padding: 0 18px;
  border: 0;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 590;
  color: #fff;
  background: var(--accent-red);
}
.replace-action:hover {
  filter: brightness(1.08);
}

.confirm-overlay {
  border-radius: 0 0 10px 10px;
}
.confirm-alert h3 {
  color: var(--finder-label);
}
</style>
