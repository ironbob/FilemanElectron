<template>
  <div class="select-none">
    <!-- Node Row -->
    <div
      class="flex items-center gap-1 px-2 py-1 rounded transition-colors group"
      :class="[
        isMatched ? 'bg-accent-blue/20' : 'hover:bg-bg-hover',
        node.isDirectory ? 'cursor-default' : 'cursor-pointer'
      ]"
      :style="{ paddingLeft: `${depth * 16 + 8}px` }"
      @click="handleClick"
    >
      <!-- Expand/Collapse Arrow -->
      <span
        v-if="node.isDirectory && node.children.size > 0"
        class="w-4 h-4 flex items-center justify-center text-text-tertiary transition-transform duration-150"
        :class="isExpanded ? 'rotate-90' : ''"
        @click.stop="emit('toggle', node.path)"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </span>
      <span v-else class="w-4 h-4"></span>

      <!-- Icon -->
      <span class="w-4 h-4 flex-shrink-0">
        <!-- Folder Icon -->
        <svg v-if="node.isDirectory" class="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
        <!-- File Icon based on extension -->
        <svg v-else-if="isImage" class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <svg v-else-if="isCode" class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        <svg v-else-if="isArchive" class="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
        <svg v-else-if="isDocument" class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <svg v-else class="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </span>

      <!-- Name -->
      <span
        class="flex-1 text-sm truncate"
        :class="node.isDirectory ? 'text-text-primary font-medium' : 'text-text-secondary'"
      >
        {{ node.name }}
      </span>

      <!-- Size (for files) -->
      <span
        v-if="!node.isDirectory"
        class="text-xs text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {{ formatSize(node.size) }}
      </span>
    </div>

    <!-- Children -->
    <div v-if="node.isDirectory && isExpanded" class="relative">
      <!-- Indentation line -->
      <div
        class="absolute top-0 bottom-0 w-px bg-border"
        :style="{ left: `${depth * 16 + 16}px` }"
      ></div>
      <!-- Child nodes -->
      <ZipTreeNode
        v-for="child in sortedChildren"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :expanded-keys="expandedKeys"
        :search-query="searchQuery"
        @toggle="(path: string) => emit('toggle', path)"
        @select="(node: ZipNode) => emit('select', node)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export interface ZipNode {
  name: string
  path: string
  isDirectory: boolean
  size: number
  compressedSize: number
  children: Map<string, ZipNode>
}

const props = defineProps<{
  node: ZipNode
  depth?: number
  expandedKeys: Set<string>
  searchQuery?: string
}>()

const emit = defineEmits<{
  toggle: [path: string]
  select: [node: ZipNode]
}>()

const depth = computed(() => props.depth ?? 0)
const isExpanded = computed(() => props.expandedKeys.has(props.node.path))

const isMatched = computed(() => {
  if (!props.searchQuery) return false
  return props.node.name.toLowerCase().includes(props.searchQuery.toLowerCase())
})

// Sort children: directories first, then files
const sortedChildren = computed(() => {
  const children = Array.from(props.node.children.values())
  return children.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
})

// File type detection
const extension = computed(() => {
  if (props.node.isDirectory) return ''
  const parts = props.node.name.split('.')
  return parts.length > 1 ? parts.pop()!.toLowerCase() : ''
})

const isImage = computed(() => {
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'heic']
  return imageExts.includes(extension.value)
})

const isCode = computed(() => {
  const codeExts = ['js', 'jsx', 'ts', 'tsx', 'vue', 'html', 'css', 'scss', 'sass', 'json', 'xml',
    'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh', 'bash', 'zsh', 'sql', 'php', 'rb',
    'swift', 'kt', 'scala', 'lua', 'yaml', 'yml', 'md', 'markdown']
  return codeExts.includes(extension.value)
})

const isArchive = computed(() => {
  const archiveExts = ['zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz']
  return archiveExts.includes(extension.value)
})

const isDocument = computed(() => {
  const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf']
  return docExts.includes(extension.value)
})

// Helpers
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

function handleClick() {
  if (props.node.isDirectory && props.node.children.size > 0) {
    emit('toggle', props.node.path)
  } else if (!props.node.isDirectory) {
    // 文件节点：上抛 select 由父级打开二次预览（虚拟路径走统一预览管道）
    emit('select', props.node)
  }
}
</script>
