<template>
  <!-- 新建三合一 Sheet（新建文件夹 / 新建文件 / 从剪贴板新建文件，2026-08-21 Finder 化）：
       纯展示组件——IO（touch/mkdir 任务、剪贴板全量读取直写）全留 FilePane，
       父层错误经 error prop 回流。路径标签永不折行 + 路径独立一行（middleEllipsis
       中间省略 + title 悬停全路径）；输入框 30px 细蓝 focus ring；默认选中文件名
       主体（保留扩展名）。遮罩/规格沿 dialogs/ 家族（z-70 遮罩 45）。 -->
  <div
    class="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 animate-fade-in"
    @click.self="emit('close')"
  >
    <form
      class="finder-sheet flex flex-col p-5"
      :class="source === 'clipboard' ? 'w-[560px]' : 'w-[440px]'"
      role="dialog"
      :aria-label="ariaLabel"
      data-testid="create-item-sheet"
      @submit.prevent="submit"
    >
      <div class="flex items-center gap-3">
        <FinderIcon :name="iconName" class="finder-item-icon flex-shrink-0" decorative />
        <h3 class="sheet-title">{{ title }}</h3>
      </div>
      <p v-if="source === 'clipboard'" class="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
        {{ t('filePane.createDialog.clipboardSummary', { kind: t(clipKind === 'text' ? 'filePane.createDialog.clipboardKindText' : 'filePane.createDialog.clipboardKindImage') }) }}
      </p>

      <!-- 创建位置：标签永不折行；路径独立一行（中间省略 + 悬停全路径） -->
      <div class="mt-4">
        <div class="sheet-path-label">{{ t('filePane.createDialog.createdInLabel') }}</div>
        <div class="sheet-path mt-0.5" :title="dirPath">{{ middleEllipsis(dirPath, 48) }}</div>
      </div>

      <!-- 剪贴板内容预览：浅灰凹陷区（一张材质规则，无描边无阴影——不是嵌套弹窗） -->
      <div
        v-if="source === 'clipboard'"
        class="finder-inset-group mt-3 px-3 py-2.5"
        data-testid="clipboard-preview-area"
      >
        <img
          v-if="clipKind === 'image' && previewDataUrl"
          :src="previewDataUrl"
          :alt="t('filePane.createDialog.clipboardKindImage')"
          class="mx-auto max-h-[200px] w-auto max-w-full object-contain"
        >
        <pre
          v-else-if="clipKind === 'text'"
          class="max-h-[120px] overflow-hidden whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-text-secondary"
          >{{ previewText }}<span v-if="previewTruncated" class="text-text-tertiary">…</span></pre>
        <!-- 元信息行：类型 · 分辨率（仅图片） · 大小 -->
        <div class="mt-2 text-xs text-text-tertiary">
          <template v-if="clipKind === 'image' && imageWidth && imageHeight">
            {{ t('filePane.createDialog.clipboardMetaImage', { width: imageWidth, height: imageHeight, size: sizeLabel }) }}
          </template>
          <template v-else>
            {{ t('filePane.createDialog.clipboardMetaText', { size: sizeLabel }) }}
          </template>
        </div>
      </div>

      <label class="mt-3 flex flex-col gap-1.5">
        <input
          ref="nameInputRef"
          v-model="name"
          class="sheet-name-input w-full"
          :placeholder="kind === 'file' ? 'example.txt' : t('filePane.createDialog.folderPlaceholder')"
          data-testid="create-item-name-input"
          spellcheck="false"
          @input="emit('clear-error')"
        >
        <p v-if="error" class="text-xs text-accent-red">{{ error }}</p>
      </label>

      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="finder-btn-secondary" @click="emit('close')">
          {{ t('common.cancel') }}
        </button>
        <button type="submit" class="finder-btn-primary" :disabled="!name.trim()">
          {{ t('filePane.createDialog.create') }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { t } from '@/i18n'
import FinderIcon from '@/components/FinderIcon.vue'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import { middleEllipsis } from '@/utils/taskDisplay'
import { formatBytes } from '@/utils/taskMetrics'

const props = withDefaults(
  defineProps<{
    /** 'file' | 'folder' 决定标题/图标/默认名与扩展名保留策略；剪贴板态恒为 file。 */
    kind: 'file' | 'folder'
    /** manual=普通新建；clipboard=从剪贴板新建（预览区 + 摘要 + 560px 宽）。 */
    source?: 'manual' | 'clipboard'
    initialName: string
    dirPath: string
    /** 父层错误（重名/创建失败/剪贴板已变化），经 prop 回流显示。 */
    error?: string
    // ── source='clipboard' 的预览数据（打开对话框时冻结的探针快照） ──
    clipKind?: 'text' | 'image'
    previewText?: string
    previewTruncated?: boolean
    previewDataUrl?: string
    byteSize?: number
    imageWidth?: number
    imageHeight?: number
  }>(),
  {
    source: 'manual',
    error: '',
    clipKind: 'text',
    previewText: '',
    previewTruncated: false,
    previewDataUrl: '',
    byteSize: 0,
    imageWidth: 0,
    imageHeight: 0
  }
)

const emit = defineEmits<{
  close: []
  /** 校验通过（非空且不含斜杠），由父层执行实际创建。 */
  confirm: [name: string]
  'clear-error': []
}>()

const name = ref(props.initialName)
const nameInputRef = ref<HTMLInputElement | null>(null)

const title = computed(() => {
  if (props.source === 'clipboard') return t('filePane.createDialog.clipboardTitle')
  return props.kind === 'file' ? t('filePane.toolbar.newFile') : t('filePane.toolbar.newFolder')
})

const ariaLabel = computed(() => {
  if (props.source === 'clipboard') return t('filePane.createDialog.clipboardAria')
  return props.kind === 'file' ? t('filePane.createDialog.fileAria') : t('filePane.createDialog.folderAria')
})

const iconName = computed(() => (props.kind === 'folder' ? 'folder' : 'fileText'))

const sizeLabel = computed(() => (props.byteSize > 0 ? formatBytes(props.byteSize) : ''))

function submit() {
  // 名称合法性（斜杠/./..）由父层 confirmCreateDialog 校验并写 error prop——
  // 与旧内联实现同一链路；此处只拦空名（按钮已禁用，双保险）。
  const trimmed = name.value.trim()
  if (!trimmed) return
  emit('confirm', trimmed)
}

useKeyInterceptor((event): boolean => {
  if (event.key === 'Escape') {
    emit('close')
    return true
  }
  return false
})

// 打开即聚焦：文件名只选中主体（保留扩展名，Finder 惯例）——untitled.txt 选
// 「untitled」；无扩展名 / 隐藏文件（.gitignore，点在首位）/ 文件夹 → 全选。
void nextTick(() => {
  const input = nameInputRef.value
  if (!input) return
  input.focus()
  const value = name.value
  let end = value.length
  if (props.kind === 'file') {
    const dot = value.lastIndexOf('.')
    if (dot > 0) end = dot
  }
  input.setSelectionRange(0, end)
})
</script>
