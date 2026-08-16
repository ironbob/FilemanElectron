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
                <InfoRow label="种类" :value="kindLabel" />
                <!-- 大小：文件夹实时累计，进度/失败说明只作展示不进复制内容 -->
                <InfoRow label="大小" :copy-value="singleSizeCopy">
                  <span class="min-w-0 flex-1 break-all">
                    {{ !file.isDirectory ? formatSize(file.size) : scan ? formatSize(scan.totalBytes) : '—' }}
                  </span>
                  <span v-if="file.isDirectory && scanStatus === 'scanning'" class="ml-2 flex-shrink-0 text-xs text-text-tertiary">
                    正在计算… 已扫描 {{ scannedCount }} 项
                  </span>
                  <span v-else-if="file.isDirectory && scanStatus === 'failed'" class="ml-2 flex-shrink-0 text-xs text-red-400">
                    计算失败：{{ scanMessage }}
                  </span>
                  <span v-else-if="file.isDirectory && scanStatus === 'cancelled'" class="ml-2 flex-shrink-0 text-xs text-text-tertiary">已取消</span>
                </InfoRow>
                <InfoRow label="项目数" :value="itemCountLabel" />
                <InfoRow label="位置" :value="locationLabel" />
                <InfoRow label="设备" :value="deviceName" />
                <InfoRow label="修改时间" :value="modifiedLabel" />
                <InfoRow v-if="!isZipEntry" label="创建时间" :value="createdLabel" />
              </template>
              <template v-else>
                <InfoRow label="项目" :value="selectionLabel" />
                <InfoRow label="总大小" :copy-value="formatSize(aggregateBytes)">
                  <span class="min-w-0 flex-1 break-all">{{ formatSize(aggregateBytes) }}</span>
                  <span v-if="scanStatus === 'scanning'" class="ml-2 flex-shrink-0 text-xs text-text-tertiary">
                    正在计算… 已扫描 {{ scannedCount }} 项
                  </span>
                  <span v-else-if="scanStatus === 'failed'" class="ml-2 flex-shrink-0 text-xs text-red-400">计算失败：{{ scanMessage }}</span>
                  <span v-else-if="scanStatus === 'cancelled'" class="ml-2 flex-shrink-0 text-xs text-text-tertiary">已取消</span>
                </InfoRow>
                <InfoRow label="设备" :value="deviceName" />
                <InfoRow label="位置" :value="multiLocationLabel" />
              </template>
            </dl>
          </div>
        </section>

        <!-- ── 详细信息 ─────────────────────────────────────── -->
        <section v-if="isSingle && (file.extension || showPermissions || zipEntry)">
          <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">详细信息</h4>
          <div class="rounded-lg bg-bg-tertiary/50 p-3">
            <dl class="grid grid-cols-[92px_1fr] gap-y-2 text-sm">
              <template v-if="isSingle">
                <InfoRow label="扩展名" :value="file.extension" />
                <InfoRow v-if="showPermissions" label="权限" mono :value="stats?.mode != null ? formatPermissions(stats.mode) : undefined" />
                <InfoRow v-if="file?.isSymlink" label="符号链接" mono :value="file.symlinkTarget ?? '（目标不可读）'" />
                <InfoRow v-if="canChmod && stats?.mode != null && !chmodEditing" label="修改权限">
                  <button
                    class="text-xs px-1.5 py-0.5 rounded border border-border text-text-secondary hover:bg-bg-hover"
                    @click.prevent="startChmodEdit"
                  >编辑…</button>
                </InfoRow>
                <template v-if="zipEntry">
                  <InfoRow label="压缩后大小" :value="formatSize(zipEntry.compressedSize)" />
                  <InfoRow label="压缩率" :value="ratioLabel" />
                  <InfoRow label="压缩方法" :value="compressionLabel" />
                </template>
              </template>
            </dl>
          </div>
        </section>

        <!-- ── chmod 编辑（canChmod 且单选非 ZIP） ─────────────── -->
        <section v-if="chmodEditing" class="rounded-lg border border-accent-blue/40 p-3 space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-accent-blue">修改权限</h4>
            <span class="text-[11px] text-text-tertiary font-mono">{{ chmodOctal }}</span>
          </div>
          <!-- rwx 复选格：owner / group / other 三行 -->
          <div class="grid grid-cols-[64px_repeat(3,48px)] gap-y-1.5 items-center text-xs">
            <span class="text-text-tertiary"></span>
            <span class="text-center text-text-tertiary">读 r</span>
            <span class="text-center text-text-tertiary">写 w</span>
            <span class="text-center text-text-tertiary">执行 x</span>
            <template v-for="{ label, role } in chmodRoles" :key="role">
              <span class="text-text-secondary">{{ label }}</span>
              <div v-for="bit in (['r', 'w', 'x'] as const)" :key="bit" class="flex justify-center">
                <input
                  type="checkbox"
                  class="accent-blue-500"
                  :checked="chmodBits[role][bit]"
                  @change="chmodBits[role][bit] = ($event.target as HTMLInputElement).checked"
                >
              </div>
            </template>
          </div>
          <!-- 八进制输入 + 递归（目录） -->
          <div class="flex items-center gap-3 text-xs">
            <label class="flex items-center gap-1.5 text-text-secondary">
              八进制
              <input
                :value="chmodOctal"
                type="text"
                class="w-16 px-2 py-1 font-mono rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent-blue"
                maxlength="4"
                @change="applyOctalInput(($event.target as HTMLInputElement).value)"
              >
            </label>
            <label v-if="file?.isDirectory" class="flex items-center gap-1.5 text-text-secondary cursor-pointer">
              <input v-model="chmodRecursive" type="checkbox" class="accent-blue-500">
              递归应用到目录内容
            </label>
            <span v-if="chmodError" class="text-accent-red">{{ chmodError }}</span>
          </div>
          <div class="flex justify-end gap-2">
            <button class="px-2.5 py-1 text-xs rounded border border-border text-text-secondary hover:bg-bg-hover" @click.prevent="chmodEditing = false">取消</button>
            <button
              class="px-2.5 py-1 text-xs rounded bg-accent-blue text-white hover:bg-accent-blue/90 disabled:opacity-40"
              :disabled="chmodError !== null"
              @click.prevent="applyChmod"
            >应用</button>
          </div>
        </section>

        <!-- ── 媒体（单选且识别到媒体元数据时显示） ────────────── -->
        <section v-if="isSingle && mediaRows.length > 0">
          <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">媒体</h4>
          <div class="rounded-lg bg-bg-tertiary/50 p-3">
            <dl class="grid grid-cols-[92px_1fr] gap-y-2 text-sm">
              <InfoRow v-for="row in mediaRows" :key="row.label" :label="row.label" :value="row.value" :copy-value="row.copyValue" />
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
      <div class="flex flex-shrink-0 items-center justify-between border-t border-border px-5 py-3">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          @click="copyAll"
        >
          <svg v-if="!copiedAll" class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <svg v-else class="h-3.5 w-3.5 text-accent-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          {{ copiedAll ? '已复制' : '复制全部' }}
        </button>
        <div class="flex items-center gap-2">
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import exifr from 'exifr'
import type { FileInfo } from '@/types'
import { getMimeType } from '@/types/preview'
import type { FileStats, MediaInfoSummary } from '@shared/types'
import { useThumbnailStore } from '@/stores/thumbnail'
import { formatSize } from '@/utils/path'
import { formatPermissions, parseOctalPermissions } from '@/utils/permissions'
import type { DeviceCapabilities } from '@shared/types'
import { getFileCategory, isImageFile, needsNativeDecode } from '@/utils/fileTypes'
import { isZipVirtualPath, parseZipVirtualPath } from '@shared/zipPath'
import { copyToClipboard } from '@/utils/clipboard'
import InfoRow from '@/components/InfoRow.vue'

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
  return first ? (isZipVirtualPath(first.path) ? first.path : parentDirectory(first.path)) : ''
})

const modifiedLabel = computed(() => formatDate(stats.value?.modifiedTime ?? file.value.modifiedTime))
const createdLabel = computed(() => formatDate(stats.value?.createdTime ?? file.value.createdTime))
const itemCountLabel = computed(() =>
  file.value.isDirectory && scan.value && scanStatus.value === 'completed'
    ? `${scan.value.fileCount} 个文件，${scan.value.directoryCount} 个文件夹`
    : undefined
)
const selectionLabel = computed(() =>
  `${props.files.length} 项（${selectionFileCount.value} 个文件，${selectionDirCount.value} 个文件夹）`
)
const ratioLabel = computed(() =>
  zipEntry.value && zipEntry.value.size > 0
    ? `${Math.round((zipEntry.value.compressedSize / zipEntry.value.size) * 100)}%`
    : undefined
)
const compressionLabel = computed(() => {
  if (!zipEntry.value) return undefined
  const method = zipEntry.value.compressionMethod
  return method === 8 ? 'Deflate' : method === 0 ? 'Stored' : `未知（${method}）`
})

// ── 异步数据 ──────────────────────────────────────────────────────────────────
const stats = ref<FileStats | null>(null)

// ── chmod 编辑（M5；canChmod 门控 + 本地/SSH 权限语义可靠条件）──
const chmodEditing = ref(false)
const chmodRecursive = ref(false)
const chmodError = ref<string | null>(null)
const chmodBits = reactive({
  owner: { r: false, w: false, x: false },
  group: { r: false, w: false, x: false },
  other: { r: false, w: false, x: false }
})

const chmodRoles: Array<{ label: string; role: keyof typeof chmodBits }> = [
  { label: '所有者', role: 'owner' },
  { label: '组', role: 'group' },
  { label: '其他', role: 'other' }
]

const deviceCapabilities = ref<DeviceCapabilities | null>(null)

const canChmod = computed(() => {
  if (!showPermissions.value || isZipEntry.value) return false
  // 能力未知（未加载）按支持处理——应用失败在错误位呈现
  return deviceCapabilities.value?.canChmod !== false
})

const chmodOctal = computed(() => {
  const digit = (bits: { r: boolean; w: boolean; x: boolean }) =>
    (bits.r ? 4 : 0) + (bits.w ? 2 : 0) + (bits.x ? 1 : 0)
  return `${digit(chmodBits.owner)}${digit(chmodBits.group)}${digit(chmodBits.other)}`
})

function startChmodEdit(): void {
  const mode = stats.value?.mode
  if (mode == null) return
  chmodBits.owner.r = !!(mode & 0o400); chmodBits.owner.w = !!(mode & 0o200); chmodBits.owner.x = !!(mode & 0o100)
  chmodBits.group.r = !!(mode & 0o040); chmodBits.group.w = !!(mode & 0o020); chmodBits.group.x = !!(mode & 0o010)
  chmodBits.other.r = !!(mode & 0o004); chmodBits.other.w = !!(mode & 0o002); chmodBits.other.x = !!(mode & 0o001)
  chmodRecursive.value = false
  chmodError.value = null
  chmodEditing.value = true
}

/** 八进制输入回填复选格（"755"/"0644"）。 */
function applyOctalInput(text: string): void {
  const mode = parseOctalPermissions(text)
  if (mode === null) {
    chmodError.value = '八进制应为 3-4 位（如 755 / 0644）'
    return
  }
  chmodError.value = null
  chmodBits.owner.r = !!(mode & 0o400); chmodBits.owner.w = !!(mode & 0o200); chmodBits.owner.x = !!(mode & 0o100)
  chmodBits.group.r = !!(mode & 0o040); chmodBits.group.w = !!(mode & 0o020); chmodBits.group.x = !!(mode & 0o010)
  chmodBits.other.r = !!(mode & 0o004); chmodBits.other.w = !!(mode & 0o002); chmodBits.other.x = !!(mode & 0o001)
}

async function applyChmod(): Promise<void> {
  if (!file.value) return
  const mode = parseOctalPermissions(chmodOctal.value)
  if (mode === null) return
  try {
    await window.fileman.chmod(props.deviceId, file.value.path, mode, chmodRecursive.value && file.value.isDirectory)
    chmodEditing.value = false
    // 重取 stats 刷新显示
    try { stats.value = await window.fileman.getStats(props.deviceId, file.value.path) } catch { /* 保持旧值 */ }
  } catch (error) {
    chmodError.value = error instanceof Error ? error.message : String(error)
  }
}
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
  // 设备能力（chmod 编辑门控；失败保持 null=按支持处理）
  try { deviceCapabilities.value = await window.fileman.getDeviceCapabilities(props.deviceId) } catch { /* 能力未知 */ }
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

  // ── 媒体元数据（单选、非目录、非 ZIP 内条目） ──────────────────────────────
  if (isSingle.value && !file.value.isDirectory && !isZipEntry.value && file.value.extension) {
    const category = getFileCategory(file.value.extension)
    if (category === 'video' || category === 'audio') {
      try { media.value = await window.fileman.getMediaInfo(props.deviceId, file.value.path) } catch { /* 非媒体/失败 → 隐藏媒体区 */ }
    } else if (category === 'image') {
      try { await loadImageMeta() } catch (e) { console.warn('[FileInfoDialog] image meta failed', e) }
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

/** 单选「大小」行的复制内容（不含进度说明；未扫描完的目录复制当前累计值） */
const singleSizeCopy = computed(() =>
  !file.value.isDirectory
    ? formatSize(file.value.size)
    : scan.value ? formatSize(scan.value.totalBytes) : undefined
)

// ── 媒体元数据 ────────────────────────────────────────────────────────────────
// 音视频：主进程 MediaInfoLib WASM（本期仅本地，远程返回 null → 隐藏媒体区）
const media = ref<MediaInfoSummary | null>(null)
// 图片：渲染端解码取尺寸 + exifr 解析 EXIF（所有设备；图片文件体积可控）
const imageMeta = ref<{
  width?: number
  height?: number
  camera?: string
  takenAt?: string
  iso?: number
  fNumber?: number
  exposure?: string
  focalLength?: number
} | null>(null)

/** 媒体区行（v-for 渲染 + 复制全部共用） */
const mediaRows = computed(() => {
  const rows: Array<{ label: string; value: string; copyValue?: string }> = []
  const m = media.value
  if (m) {
    if (m.format) rows.push({ label: '格式', value: m.format })
    if (m.durationSeconds) rows.push({ label: '时长', value: formatDuration(m.durationSeconds) })
    const v = m.video
    if (v) {
      if (v.width && v.height) rows.push({ label: '分辨率', value: `${v.width} × ${v.height}`, copyValue: `${v.width}x${v.height}` })
      if (v.frameRate) rows.push({ label: '帧率', value: `${v.frameRate} fps` })
      if (v.codec) rows.push({ label: '视频编码', value: v.bitDepth ? `${v.codec}（${v.bitDepth}-bit）` : v.codec, copyValue: v.codec })
      if (v.bitrate) rows.push({ label: '视频码率', value: formatBitrate(v.bitrate) })
    }
    const a = m.audio
    if (a) {
      if (a.codec) rows.push({ label: '音频编码', value: a.codec })
      if (a.sampleRate) rows.push({ label: '采样率', value: `${(a.sampleRate / 1000).toFixed(1).replace(/\.0$/, '')} kHz` })
      if (a.channels) rows.push({ label: '声道', value: `${a.channels} 声道` })
      if (a.bitrate) rows.push({ label: '音频码率', value: formatBitrate(a.bitrate) })
    }
    if (m.overallBitrate) rows.push({ label: '总码率', value: formatBitrate(m.overallBitrate) })
  }
  const im = imageMeta.value
  if (im) {
    if (im.width && im.height) {
      const mp = ((im.width * im.height) / 1e6).toFixed(1)
      rows.push({ label: '尺寸', value: `${im.width} × ${im.height}（${mp} MP）`, copyValue: `${im.width}x${im.height}` })
    }
    if (im.camera) rows.push({ label: '相机', value: im.camera })
    if (im.takenAt) rows.push({ label: '拍摄时间', value: im.takenAt })
    if (im.iso) rows.push({ label: 'ISO', value: String(im.iso) })
    if (im.fNumber) rows.push({ label: '光圈', value: `f/${im.fNumber}` })
    if (im.exposure) rows.push({ label: '快门', value: im.exposure })
    if (im.focalLength) rows.push({ label: '焦距', value: `${im.focalLength} mm` })
  }
  return rows
})

/** 图片元数据：Image 元素取尺寸 + exifr 解析拍摄参数 */
async function loadImageMeta(): Promise<void> {
  const f = file.value
  const base64 = await window.fileman.readFile(props.deviceId, f.path)
  const bytes = base64ToArrayBuffer(base64)

  // 尺寸：blob → Image 解码（HEIC 等 Chromium 不能解码的格式会失败，仅降级为 EXIF）
  try {
    const blob = new Blob([bytes], { type: getMimeType(f.extension ?? '') })
    const url = URL.createObjectURL(blob)
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('decode failed'))
        img.src = url
      })
      imageMeta.value = { ...imageMeta.value, width: img.naturalWidth, height: img.naturalHeight }
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch { /* HEIC/RAW：尺寸未知，继续解析 EXIF */ }

  try {
    const data = await exifr.parse(bytes)
    if (data) {
      const exposure = typeof data.ExposureTime === 'number' && data.ExposureTime > 0
        ? (data.ExposureTime < 1 ? `1/${Math.round(1 / data.ExposureTime)} s` : `${data.ExposureTime} s`)
        : undefined
      imageMeta.value = {
        ...imageMeta.value,
        camera: [data.Make, data.Model].filter(Boolean).join(' ').trim() || undefined,
        takenAt: data.DateTimeOriginal instanceof Date ? data.DateTimeOriginal.toLocaleString() : undefined,
        iso: typeof data.ISO === 'number' ? data.ISO : undefined,
        fNumber: typeof data.FNumber === 'number' ? data.FNumber : undefined,
        exposure,
        focalLength: typeof data.FocalLength === 'number' ? data.FocalLength : undefined,
      }
    }
  } catch { /* 无 EXIF（PNG/SVG 等）→ 仅尺寸 */ }

  if (!imageMeta.value || Object.keys(imageMeta.value).length === 0) imageMeta.value = null
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

// ── 复制全部 ──────────────────────────────────────────────────────────────────
const copiedAll = ref(false)
let copiedAllTimer: ReturnType<typeof setTimeout> | null = null

/** 当前弹窗所有可见信息 → 「标签: 值」纯文本 */
function buildSummaryText(): string {
  const lines: string[] = []
  if (isSingle.value) {
    lines.push(`名称: ${file.value.name}`)
    lines.push(`路径: ${file.value.path}`)
    lines.push(`种类: ${kindLabel.value}`)
    if (singleSizeCopy.value) lines.push(`大小: ${singleSizeCopy.value}`)
    if (itemCountLabel.value) lines.push(`项目数: ${itemCountLabel.value}`)
    lines.push(`位置: ${locationLabel.value}`)
    lines.push(`设备: ${props.deviceName}`)
    if (modifiedLabel.value) lines.push(`修改时间: ${modifiedLabel.value}`)
    if (!isZipEntry.value && createdLabel.value) lines.push(`创建时间: ${createdLabel.value}`)
    if (file.value.extension) lines.push(`扩展名: ${file.value.extension}`)
    if (showPermissions.value && stats.value?.mode != null) lines.push(`权限: ${formatPermissions(stats.value.mode)}`)
    if (zipEntry.value) {
      lines.push(`压缩后大小: ${formatSize(zipEntry.value.compressedSize)}`)
      if (ratioLabel.value) lines.push(`压缩率: ${ratioLabel.value}`)
      if (compressionLabel.value) lines.push(`压缩方法: ${compressionLabel.value}`)
    }
  } else {
    lines.push(`项目: ${selectionLabel.value}`)
    lines.push(`总大小: ${formatSize(aggregateBytes.value)}`)
    lines.push(`设备: ${props.deviceName}`)
    if (multiLocationLabel.value) lines.push(`位置: ${multiLocationLabel.value}`)
  }
  for (const row of mediaRows.value) lines.push(`${row.label}: ${row.value}`)
  if (isSingle.value && !isZipEntry.value && tagText.value.trim()) lines.push(`标签: ${tagText.value}`)
  return lines.join('\n')
}

async function copyAll() {
  if (await copyToClipboard(buildSummaryText())) {
    copiedAll.value = true
    if (copiedAllTimer) clearTimeout(copiedAllTimer)
    copiedAllTimer = setTimeout(() => { copiedAll.value = false }, 1500)
  }
}

onUnmounted(() => { if (copiedAllTimer) clearTimeout(copiedAllTimer) })

// ── 标签（单选） ──────────────────────────────────────────────────────────────
const tagText = ref('')
function save() {
  const tags = tagText.value.split(',').map(tag => tag.trim()).filter(Boolean)
  emit('saveTags', tags)
}

/** 秒 → h:mm:ss / m:ss */
function formatDuration(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** bps → Mbps / kbps */
function formatBitrate(bps: number): string {
  return bps >= 1e6 ? `${(bps / 1e6).toFixed(2)} Mbps` : `${Math.round(bps / 1e3)} kbps`
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  const time = Date.parse(iso)
  return Number.isNaN(time) ? '' : new Date(time).toLocaleString()
}
</script>
