<template>
  <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/45" @click.self="$emit('close')">
    <div class="w-[460px] max-h-[80vh] flex flex-col rounded-xl border border-border bg-bg-secondary shadow-2xl">
      <!-- Header：图片文件显示预览，其余显示文件名 + 路径 -->
      <div class="relative flex-shrink-0">
        <img v-if="thumbnailSrc" :src="thumbnailSrc" class="h-40 w-full rounded-t-xl bg-bg-primary object-contain" alt="preview" />
        <div v-else class="flex items-start justify-between gap-4 px-5 pt-5">
          <div class="min-w-0">
            <h2 class="truncate text-base font-semibold text-text-primary">{{ headerTitle }}</h2>
            <p class="mt-1 break-all text-xs text-text-tertiary">{{ headerSubtitle }}</p>
          </div>
          <button type="button" class="text-text-tertiary hover:text-text-primary" @click="$emit('close')">×</button>
        </div>
        <button
          v-if="thumbnailSrc"
          type="button"
          class="absolute right-3 top-3 rounded px-1.5 text-text-tertiary hover:text-text-primary"
          @click="$emit('close')"
        >
          ×
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <!-- ── 常规 ─────────────────────────────────────────── -->
        <section>
          <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">常规</h4>
          <div class="rounded-lg bg-bg-tertiary/50 p-3">
            <dl class="grid grid-cols-[92px_1fr] gap-y-2 text-sm">
              <template v-if="isSingle">
                <dt class="text-text-tertiary">种类</dt><dd class="text-text-primary">{{ kindLabel }}</dd>
                <dt class="text-text-tertiary">大小</dt>
                <dd class="text-text-primary">
                  <template v-if="!file.isDirectory">{{ formatSize(file.size) }}</template>
                  <template v-else>
                    {{ scan ? formatSize(scan.totalBytes) : '—' }}
                    <span v-if="scanStatus === 'scanning'" class="ml-2 text-xs text-text-tertiary">
                      正在计算… 已扫描 {{ scannedCount }} 项
                    </span>
                    <span v-else-if="scanStatus === 'failed'" class="ml-2 text-xs text-red-400">计算失败：{{ scanMessage }}</span>
                    <span v-else-if="scanStatus === 'cancelled'" class="ml-2 text-xs text-text-tertiary">已取消</span>
                  </template>
                </dd>
                <template v-if="file.isDirectory && scan && scanStatus === 'completed'">
                  <dt class="text-text-tertiary">项目数</dt><dd class="text-text-primary">{{ scan.fileCount }} 个文件，{{ scan.directoryCount }} 个文件夹</dd>
                </template>
                <dt class="text-text-tertiary">位置</dt><dd class="break-all text-text-primary">{{ locationLabel }}</dd>
                <dt class="text-text-tertiary">设备</dt><dd class="text-text-primary">{{ deviceName }}</dd>
                <dt class="text-text-tertiary">修改时间</dt><dd class="text-text-primary">{{ formatDate(stats?.modifiedTime ?? file.modifiedTime) }}</dd>
                <dt v-if="!isZipEntry" class="text-text-tertiary">创建时间</dt>
                <dd v-if="!isZipEntry" class="text-text-primary">{{ formatDate(stats?.createdTime ?? file.createdTime) }}</dd>
              </template>
              <template v-else>
                <dt class="text-text-tertiary">项目</dt>
                <dd class="text-text-primary">{{ files.length }} 项（{{ selectionFileCount }} 个文件，{{ selectionDirCount }} 个文件夹）</dd>
                <dt class="text-text-tertiary">总大小</dt>
                <dd class="text-text-primary">
                  {{ formatSize(aggregateBytes) }}
                  <span v-if="scanStatus === 'scanning'" class="ml-2 text-xs text-text-tertiary">
                    正在计算… 已扫描 {{ scannedCount }} 项
                  </span>
                  <span v-else-if="scanStatus === 'failed'" class="ml-2 text-xs text-red-400">计算失败：{{ scanMessage }}</span>
                  <span v-else-if="scanStatus === 'cancelled'" class="ml-2 text-xs text-text-tertiary">已取消</span>
                </dd>
                <dt class="text-text-tertiary">设备</dt><dd class="text-text-primary">{{ deviceName }}</dd>
                <dt class="text-text-tertiary">位置</dt><dd class="break-all text-text-primary">{{ multiLocationLabel }}</dd>
              </template>
            </dl>
          </div>
        </section>

        <!-- ── 详细信息 ─────────────────────────────────────── -->
        <section>
          <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">详细信息</h4>
          <div class="rounded-lg bg-bg-tertiary/50 p-3">
            <dl class="grid grid-cols-[92px_1fr] gap-y-2 text-sm">
              <template v-if="isSingle">
                <dt class="text-text-tertiary">扩展名</dt><dd class="text-text-primary">{{ file.extension || '—' }}</dd>
                <template v-if="showPermissions">
                  <dt class="text-text-tertiary">权限</dt><dd class="font-mono text-text-primary">{{ formatPermissions(stats?.mode) }}</dd>
                </template>
                <template v-if="zipEntry">
                  <dt class="text-text-tertiary">压缩后大小</dt><dd class="text-text-primary">{{ formatSize(zipEntry.compressedSize) }}</dd>
                  <dt class="text-text-tertiary">压缩率</dt>
                  <dd class="text-text-primary">{{ zipEntry.size > 0 ? Math.round((zipEntry.compressedSize / zipEntry.size) * 100) + '%' : '—' }}</dd>
                  <dt class="text-text-tertiary">压缩方法</dt>
                  <dd class="text-text-primary">{{ zipEntry.compressionMethod === 8 ? 'Deflate' : zipEntry.compressionMethod === 0 ? 'Stored' : '未知（' + zipEntry.compressionMethod + '）' }}</dd>
                </template>
              </template>
              <template v-else>
                <dt class="text-text-tertiary">备注</dt>
                <dd class="text-text-tertiary">多选时仅显示聚合信息</dd>
              </template>
            </dl>
          </div>
        </section>

        <!-- ── 标签（仅单选） ────────────────────────────────── -->
        <section v-if="isSingle && !isZipEntry">
          <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">标签</h4>
          <form class="flex items-center gap-2" @submit.prevent="save">
            <input
              v-model="tagText"
              class="min-w-0 flex-1 rounded border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
              placeholder="work, review（逗号分隔；由 Fileman 本地存储）"
            />
            <button type="submit" class="rounded bg-accent-blue px-3 py-2 text-sm text-white transition-colors hover:bg-accent-blue/90">保存</button>
          </form>
        </section>
      </div>

      <!-- Footer -->
      <div class="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button
          v-if="scanStatus === 'scanning'"
          type="button"
          class="rounded px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover"
          @click="cancelScan"
        >
          取消计算
        </button>
        <button
          type="button"
          class="rounded bg-bg-tertiary px-4 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover"
          @click="$emit('close')"
        >
          关闭
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { FileInfo } from '@/types'
import type { FileStats } from '@shared/types'
import { useThumbnailStore } from '@/stores/thumbnail'
import { formatSize } from '@/utils/path'
import { formatPermissions } from '@/utils/permissions'
import { getFileCategory, isImageFile, needsNativeDecode } from '@/utils/fileTypes'
import { isZipVirtualPath, parseZipVirtualPath } from '@shared/zipPath'

const props = defineProps<{
  deviceId: string
  deviceType: 'local' | 'android' | 'smb' | 'ssh' | 'webdav' | 'ios'
  deviceName: string
  /** 打开弹窗时的选中快照（1..N 项；弹窗生命周期内不随后续选择变化） */
  files: FileInfo[]
}>()

const emit = defineEmits<{ close: []; saveTags: [tags: string[]] }>()

const thumbnailStore = useThumbnailStore()

// ── 基础派生 ──────────────────────────────────────────────────────────────────
const file = computed(() => props.files[0])
const isSingle = computed(() => props.files.length === 1)
const isZipEntry = computed(() => isSingle.value && isZipVirtualPath(file.value.path))
const selectionFileCount = computed(() => props.files.filter(f => !f.isDirectory).length)
const selectionDirCount = computed(() => props.files.filter(f => f.isDirectory).length)

const headerTitle = computed(() =>
  isSingle.value ? file.value.name : `${props.files.length} 个项目`
)
const headerSubtitle = computed(() =>
  isSingle.value ? file.value.path : `位于 ${multiLocationLabel.value}`
)

const CATEGORY_LABELS: Record<string, string> = {
  image: '图片', video: '视频', audio: '音频', archive: '归档文件',
  document: '文档', text: '文本', unknown: '文件',
}
const kindLabel = computed(() => {
  if (!isSingle.value) return ''
  if (file.value.isDirectory) return '文件夹'
  if (isZipEntry.value) return 'ZIP 内条目'
  return CATEGORY_LABELS[getFileCategory(file.value.extension ?? '')] ?? '文件'
})

/** POSIX 父目录（ZIP 虚拟路径直接显示完整路径） */
function parentDirectory(p: string): string {
  const i = p.lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}
const locationLabel = computed(() =>
  isZipEntry.value ? file.value.path : parentDirectory(file.value.path)
)
const multiLocationLabel = computed(() => {
  const first = props.files[0]
  return first ? (isZipVirtualPath(first.path) ? first.path : parentDirectory(first.path)) : '—'
})

// ── 异步数据 ──────────────────────────────────────────────────────────────────
const stats = ref<FileStats | null>(null)
const zipEntry = ref<{ compressedSize: number; size: number; compressionMethod: number } | null>(null)
const thumbnailSrc = ref<string | null>(null)

/** 本地/SSH 的 mode 语义可靠，SMB/WebDAV/移动设备与 ZIP 内条目不显示权限 */
const showPermissions = computed(() =>
  !isZipEntry.value && (props.deviceType === 'local' || props.deviceType === 'ssh')
)

// ── 递归目录统计（含取消） ─────────────────────────────────────────────────────
const sessionId = crypto.randomUUID()
const scan = ref<{ fileCount: number; directoryCount: number; totalBytes: number } | null>(null)
const scanStatus = ref<'idle' | 'scanning' | 'completed' | 'cancelled' | 'failed'>('idle')
const scanMessage = ref('')
const scannedCount = computed(() =>
  scan.value ? scan.value.fileCount + scan.value.directoryCount : 0
)
let activeTaskId: string | null = null
let unsubProgress: (() => void) | null = null
let disposed = false

onMounted(async () => {
  // 先订阅再发起扫描，防止首条进度早于订阅到达
  unsubProgress = window.fileman.onDirectoryStatsProgress(progress => {
    if (progress.sessionId !== sessionId) return
    activeTaskId = progress.taskId
    scan.value = {
      fileCount: progress.fileCount,
      directoryCount: progress.directoryCount,
      totalBytes: progress.totalBytes,
    }
    scanStatus.value = progress.status
    scanMessage.value = progress.message ?? ''
  })

  if (isSingle.value) {
    if (isZipEntry.value) {
      // compressedSize 被 FileList 的 zipEntriesToFileInfo 丢弃，这里重新取
      try {
        const { zipFilePath, innerPath } = parseZipVirtualPath(file.value.path)
        const parentInner = innerPath.includes('/') ? innerPath.slice(0, innerPath.lastIndexOf('/')) : ''
        const entries = await window.fileman.zip.listDirectory(zipFilePath, parentInner)
        const entry = entries.find(e => e.path === innerPath || e.path === innerPath.replace(/\/$/, ''))
        if (entry) {
          zipEntry.value = { compressedSize: entry.compressedSize, size: entry.size, compressionMethod: entry.compressionMethod }
        }
      } catch (e) {
        console.warn('[FileInfoDialog] zip entry detail failed', e)
      }
    } else {
      // 文件与文件夹都取 stats（createdTime/mode；失败降级为仅 FileInfo 字段）
      try { stats.value = await window.fileman.getStats(props.deviceId, file.value.path) } catch { /* 降级 */ }
    }
  }

  // 单选标签（Fileman 本地元数据，与设备无关）
  if (isSingle.value && !isZipEntry.value) {
    try { tagText.value = (await window.fileman.getFileMetadata(props.deviceId, file.value.path)).tags.join(', ') } catch { /* 留空 */ }
  }

  // 图片预览头部：缩略图优先，HEIC/RAW 等本机格式走原生解码兜底
  if (isSingle.value && !file.value.isDirectory && !isZipEntry.value
      && file.value.extension && isImageFile(file.value.extension)) {
    try {
      const base64 = await thumbnailStore.getThumbnail(props.deviceId, file.value, 'large')
      if (base64) {
        thumbnailSrc.value = `data:image/webp;base64,${base64}`
      } else if (needsNativeDecode(file.value.extension)) {
        const decoded = await window.fileman.decodeNativeImage(props.deviceId, file.value.path, { maxDim: 480 })
        thumbnailSrc.value = `data:${decoded.mime};base64,${decoded.buffer}`
      }
    } catch (e) {
      console.warn('[FileInfoDialog] preview load failed', e)
    }
  }

  // 选中含目录即启动递归统计（ZIP 内目录在主进程走中央目录求和，瞬时完成）
  const folderPaths = props.files.filter(f => f.isDirectory).map(f => f.path)
  if (folderPaths.length > 0) {
    scanStatus.value = 'scanning'
    try {
      const { taskId } = await window.fileman.startDirectoryStats({ sessionId, deviceId: props.deviceId, paths: folderPaths })
      activeTaskId = taskId
      // 弹窗在 invoke 在途时被关闭：结果到达后立即补一次取消
      if (disposed) void window.fileman.cancelDirectoryStats(taskId)
    } catch (e) {
      scanStatus.value = 'failed'
      scanMessage.value = e instanceof Error ? e.message : String(e)
    }
  }
})

function cancelScan() {
  if (activeTaskId) void window.fileman.cancelDirectoryStats(activeTaskId)
}

onUnmounted(() => {
  disposed = true
  unsubProgress?.()
  cancelScan()
})

// ── 多选聚合大小：非目录文件客户端即时求和 + 目录扫描实时值 ───────────────────
const aggregateBytes = computed(() =>
  props.files.filter(f => !f.isDirectory).reduce((sum, f) => sum + f.size, 0)
    + (scan.value?.totalBytes ?? 0)
)

// ── 标签（单选） ──────────────────────────────────────────────────────────────
const tagText = ref('')
function save() {
  const tags = tagText.value.split(',').map(tag => tag.trim()).filter(Boolean)
  emit('saveTags', tags)
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  const time = Date.parse(iso)
  return Number.isNaN(time) ? '—' : new Date(time).toLocaleString()
}
</script>
