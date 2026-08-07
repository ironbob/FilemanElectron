<template>
  <div class="h-full flex flex-col bg-bg-secondary">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <div class="flex flex-col items-center gap-2">
        <div class="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-text-secondary">{{ loadingProgress }}</span>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="hasError" class="flex flex-col items-center justify-center h-full text-text-tertiary p-4">
      <svg class="w-12 h-12 mb-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p class="text-sm font-medium text-text-primary mb-1">Failed to read archive</p>
      <p class="text-xs text-center max-w-xs">{{ errorMessage }}</p>
    </div>

    <!-- Content Area -->
    <div v-else class="flex-1 flex flex-col overflow-hidden">
      <!-- Toolbar -->
      <div class="flex items-center justify-between px-4 py-1.5 bg-bg-tertiary border-b border-border flex-shrink-0">
        <div class="flex items-center gap-2.5">
          <span class="text-xs px-2 py-0.5 rounded bg-bg-hover text-text-secondary font-mono">
            ZIP
          </span>
          <span class="text-xs text-text-tertiary">
            {{ fileCount }} items · {{ formatSize(totalSize) }}
          </span>
        </div>
        <div class="flex items-center gap-1">
          <button
            class="p-1.5 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-hover"
            title="Expand All"
            @click="expandAll"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
          <button
            class="p-1.5 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-hover"
            title="Collapse All"
            @click="collapseAll"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          </button>
          <div class="relative ml-2">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search..."
              class="w-40 px-2 py-1 text-xs bg-bg-primary border border-border rounded focus:outline-none focus:border-accent-blue text-text-primary placeholder-text-tertiary"
            />
            <svg class="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      <!-- Tree View -->
      <div ref="treeContainer" class="flex-1 overflow-auto p-2">
        <ZipTreeNode
          v-for="node in filteredRootNodes"
          :key="node.path"
          :node="node"
          :expanded-keys="expandedKeys"
          :search-query="searchQuery"
          @toggle="toggleNode"
        />
      </div>

      <!-- File Info Bar -->
      <div class="flex-shrink-0 px-4 py-2 bg-bg-tertiary border-t border-border">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium text-text-primary">{{ file.name }}</span>
            <span class="text-xs text-text-tertiary">{{ formatSize(file.size) }}</span>
          </div>
          <button
            class="px-3 py-1 text-xs bg-accent-blue text-white rounded hover:bg-accent-blue/80 transition-colors"
            @click="emit('open-in-full')"
          >
            Open in Full Viewer
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, shallowRef } from 'vue'
import type { FileInfo } from '@/types'
import { unzip } from 'fflate'
import ZipTreeNode from './ZipTreeNode.vue'

const log = (msg: string, ...args: unknown[]) => console.log(`[PreviewZipContent] ${msg}`, ...args)

// Props / Emits
const props = defineProps<{
  file: FileInfo
  deviceId: string
}>()

const emit = defineEmits<{
  'open-in-full': []
}>()

// Types
interface ZipNode {
  name: string
  path: string
  isDirectory: boolean
  size: number
  compressedSize: number
  children: Map<string, ZipNode>
}

// State
const loading = ref(true)
const loadingProgress = ref('Reading archive...')
const hasError = ref(false)
const errorMessage = ref('')
const rootNodes = shallowRef<ZipNode[]>([])
const expandedKeys = ref<Set<string>>(new Set())
const searchQuery = ref('')
const fileCount = ref(0)
const totalSize = ref(0)

// Helper functions
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

// Build tree structure from flat entries
function buildTree(entries: Record<string, { size: number; compressedSize?: number }>): ZipNode[] {
  const root: ZipNode = {
    name: '',
    path: '',
    isDirectory: true,
    size: 0,
    compressedSize: 0,
    children: new Map()
  }

  let count = 0
  let total = 0

  for (const [path, info] of Object.entries(entries)) {
    const parts = path.split('/').filter(Boolean)
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const isDir = path.endsWith('/') || !isLast

      if (!current.children.has(part)) {
        const nodePath = parts.slice(0, i + 1).join('/')
        current.children.set(part, {
          name: part,
          path: nodePath,
          isDirectory: isDir,
          size: isDir ? 0 : info.size,
          compressedSize: info.compressedSize ?? 0,
          children: new Map()
        })
        if (!isDir) {
          count++
          total += info.size
        }
      }
      current = current.children.get(part)!
    }
  }

  fileCount.value = count
  totalSize.value = total

  // Convert root children to sorted array
  return sortNodes(Array.from(root.children.values()))
}

function sortNodes(nodes: ZipNode[]): ZipNode[] {
  // Sort: directories first, then files, alphabetically within each group
  return nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
}

// Filter tree by search query
function filterNodes(nodes: ZipNode[], query: string): ZipNode[] {
  if (!query) return nodes

  const lowerQuery = query.toLowerCase()
  const result: ZipNode[] = []

  for (const node of nodes) {
    if (node.name.toLowerCase().includes(lowerQuery)) {
      result.push(node)
    } else if (node.children.size > 0) {
      const filteredChildren = filterNodes(Array.from(node.children.values()), query)
      if (filteredChildren.length > 0) {
        // Create a copy with filtered children
        const filteredNode: ZipNode = {
          ...node,
          children: new Map(filteredChildren.map(c => [c.name, c]))
        }
        result.push(filteredNode)
      }
    }
  }

  return sortNodes(result)
}

const filteredRootNodes = computed(() => {
  return filterNodes(rootNodes.value, searchQuery.value)
})

// Tree operations
function toggleNode(path: string) {
  if (expandedKeys.value.has(path)) {
    expandedKeys.value.delete(path)
  } else {
    expandedKeys.value.add(path)
  }
  // Force reactivity update
  expandedKeys.value = new Set(expandedKeys.value)
}

function expandAll() {
  const allPaths = new Set<string>()
  function collectPaths(nodes: ZipNode[]) {
    for (const node of nodes) {
      if (node.isDirectory && node.children.size > 0) {
        allPaths.add(node.path)
        collectNodes(Array.from(node.children.values()))
      }
    }
  }
  function collectNodes(nodes: ZipNode[]) {
    for (const node of nodes) {
      if (node.isDirectory && node.children.size > 0) {
        allPaths.add(node.path)
        collectNodes(Array.from(node.children.values()))
      }
    }
  }
  collectPaths(rootNodes.value)
  expandedKeys.value = allPaths
}

function collapseAll() {
  expandedKeys.value = new Set()
}

// Decode filename with proper encoding detection
function decodeFilename(bytes: Uint8Array, generalBitFlag: number): string {
  // Bit 11: Language encoding flag (EFS) - if set, filename is UTF-8
  const isUtf8 = (generalBitFlag & 0x800) !== 0

  if (isUtf8) {
    // UTF-8 encoded
    return new TextDecoder('utf-8').decode(bytes)
  }

  // Try UTF-8 first, if it fails or produces replacement chars, try GBK
  const utf8Decoder = new TextDecoder('utf-8', { fatal: false })
  const utf8Result = utf8Decoder.decode(bytes)

  // Check if UTF-8 decoding produced replacement characters
  const hasReplacementChars = utf8Result.includes('\uFFFD')

  if (!hasReplacementChars) {
    // Check if the result looks like valid UTF-8 (no unexpected byte sequences)
    // Try re-encoding to see if it round-trips correctly
    try {
      const reencoded = new TextEncoder().encode(utf8Result)
      if (reencoded.length === bytes.length) {
        return utf8Result
      }
    } catch {
      // Fall through to GBK
    }
  }

  // Try GBK/GB18030 for Chinese filenames
  try {
    const gbkDecoder = new TextDecoder('gbk', { fatal: false })
    const gbkResult = gbkDecoder.decode(bytes)
    // Only use GBK result if it doesn't have replacement chars
    if (!gbkResult.includes('\uFFFD')) {
      return gbkResult
    }
  } catch {
    // GBK not supported, fall back to UTF-8 result
  }

  return utf8Result
}

// Parse ZIP file headers to extract filenames with correct encoding
function parseZipFilenames(bytes: Uint8Array): Map<string, { size: number; compressedSize: number }> {
  const entries = new Map<string, { size: number; compressedSize: number }>()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  let offset = 0
  const LOCAL_FILE_HEADER_SIG = 0x04034b50

  while (offset < bytes.length - 4) {
    // Look for local file header signature
    if (view.getUint32(offset, true) !== LOCAL_FILE_HEADER_SIG) {
      offset++
      continue
    }

    // Found a local file header
    // Offset 4: version needed (2 bytes)
    // Offset 6: general purpose bit flag (2 bytes)
    const generalBitFlag = view.getUint16(offset + 6, true)

    // Offset 8: compression method (2 bytes)
    // Offset 10: last mod time (2 bytes)
    // Offset 12: last mod date (2 bytes)
    // Offset 14: CRC-32 (4 bytes)
    // Offset 18: compressed size (4 bytes)
    const compressedSize = view.getUint32(offset + 18, true)

    // Offset 22: uncompressed size (4 bytes)
    const uncompressedSize = view.getUint32(offset + 22, true)

    // Offset 26: filename length (2 bytes)
    const filenameLength = view.getUint16(offset + 26, true)

    // Offset 28: extra field length (2 bytes)
    const extraFieldLength = view.getUint16(offset + 28, true)

    // Offset 30: filename (variable)
    const filenameBytes = bytes.slice(offset + 30, offset + 30 + filenameLength)
    const filename = decodeFilename(filenameBytes, generalBitFlag)

    if (filename) {
      entries.set(filename, {
        size: uncompressedSize,
        compressedSize: compressedSize
      })
    }

    // Move to next entry: header (30) + filename + extra field + compressed data
    // For entries with data descriptor or unknown size, we need to scan for next signature
    let dataOffset = offset + 30 + filenameLength + extraFieldLength

    // If size is unknown (0xFFFFFFFF or 0 in some cases), look for next header
    // But typically we can use the compressed size
    if (compressedSize === 0xFFFFFFFF) {
      // Zip64 - scan for next header
      let nextOffset = dataOffset
      while (nextOffset < bytes.length - 4) {
        const sig = view.getUint32(nextOffset, true)
        if (sig === LOCAL_FILE_HEADER_SIG || sig === 0x02014b50) { // local header or central directory
          break
        }
        nextOffset++
      }
      offset = nextOffset
    } else {
      offset = dataOffset + compressedSize
    }
  }

  return entries
}

// Load ZIP file
async function loadFile() {
  loading.value = true
  hasError.value = false
  errorMessage.value = ''
  rootNodes.value = []
  expandedKeys.value = new Set()
  searchQuery.value = ''

  try {
    log('Loading ZIP:', props.file.name, 'device:', props.deviceId)
    loadingProgress.value = 'Reading file...'

    // Read file as ArrayBuffer
    const base64 = await window.fileman.readFile(props.deviceId, props.file.path)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }

    loadingProgress.value = 'Parsing archive...'

    // Parse ZIP headers to get filenames with correct encoding
    const parsedEntries = parseZipFilenames(bytes)

    // Use fflate to get actual file sizes (more accurate)
    const fflateEntries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(bytes, (err, data) => {
        if (err) {
          reject(new Error(`Failed to parse ZIP: ${err.message}`))
          return
        }
        resolve(data)
      })
    })

    // Combine: use parsed filenames (with correct encoding) and fflate sizes
    const entries: Record<string, { size: number; compressedSize?: number }> = {}

    // Map fflate entries by trying both original and decoded names
    for (const [rawPath, fileData] of Object.entries(fflateEntries)) {
      // Check if we have a correctly decoded version
      let bestPath = rawPath

      // Try to find a matching entry from our parsed headers
      for (const [parsedPath, info] of parsedEntries) {
        // Compare sizes to match entries
        if (info.size === fileData.byteLength || rawPath === parsedPath) {
          bestPath = parsedPath
          break
        }
      }

      entries[bestPath] = {
        size: fileData.byteLength
      }
    }

    // Add any entries from parsed headers that weren't in fflate output
    // (this handles directories and empty files)
    for (const [parsedPath, info] of parsedEntries) {
      if (!entries[parsedPath]) {
        entries[parsedPath] = {
          size: info.size,
          compressedSize: info.compressedSize
        }
      }
    }

    loadingProgress.value = 'Building tree...'
    rootNodes.value = buildTree(entries)

    // Auto-expand first level
    const firstLevelPaths = new Set<string>()
    for (const node of rootNodes.value) {
      if (node.isDirectory) {
        firstLevelPaths.add(node.path)
      }
    }
    expandedKeys.value = firstLevelPaths

    loading.value = false
    log('ZIP loaded:', fileCount.value, 'items')
  } catch (err) {
    log('Error loading ZIP:', err)
    loading.value = false
    hasError.value = true
    errorMessage.value = err instanceof Error ? err.message : 'Unknown error'
  }
}

// Watchers & lifecycle
watch(
  () => [props.file.path, props.deviceId] as const,
  () => { loadFile() },
  { immediate: false }
)

onMounted(() => { loadFile() })
</script>
