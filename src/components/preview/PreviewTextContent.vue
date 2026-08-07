<template>
  <div class="h-full flex flex-col bg-bg-secondary">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <div class="flex flex-col items-center gap-2">
        <div class="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-text-secondary">Loading file...</span>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="hasError" class="flex flex-col items-center justify-center h-full text-text-tertiary p-4">
      <svg class="w-12 h-12 mb-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p class="text-sm font-medium text-text-primary mb-1">Failed to load file</p>
      <p class="text-xs text-center max-w-xs">{{ errorMessage }}</p>
    </div>

    <!-- Content Area -->
    <div v-else class="flex-1 flex flex-col overflow-hidden">

      <!-- ── Toolbar ── -->
      <div class="flex items-center justify-between px-4 py-1.5 bg-bg-tertiary border-b border-border flex-shrink-0">
        <!-- Left: language badge + stats -->
        <div class="flex items-center gap-2.5">
          <span class="text-xs px-2 py-0.5 rounded bg-bg-hover text-text-secondary font-mono">
            {{ displayLanguage }}
          </span>
          <span v-if="viewMode === 'source'" class="text-xs text-text-tertiary">
            {{ lineCount }} lines
          </span>
          <span v-else-if="viewMode === 'table'" class="text-xs text-text-tertiary">
            {{ csvRows.length }}<template v-if="csvTruncated">+</template> rows · {{ csvHeaders.length }} cols
          </span>
          <span v-else-if="viewMode === 'tree' && fileCategory === 'json'" class="text-xs text-text-tertiary">
            {{ jsonNodeCount }} nodes
          </span>
          <!-- JSON validity badge -->
          <span
            v-if="fileCategory === 'json' && jsonStatus !== null"
            class="text-xs px-1.5 py-0.5 rounded font-mono leading-none"
            :class="jsonStatus === 'valid' ? 'bg-green-500/15 text-green-500' : 'bg-red-500/15 text-red-400'"
          >{{ jsonStatus === 'valid' ? '✓ valid' : '✗ invalid JSON' }}</span>
        </div>

        <!-- Right: view-mode toggles + source-mode controls -->
        <div class="flex items-center gap-1">
          <!-- Markdown: Preview ↔ Source -->
          <div v-if="fileCategory === 'markdown'" class="flex rounded border border-border overflow-hidden mr-1">
            <button
              class="px-2.5 py-1 text-xs transition-colors"
              :class="viewMode === 'rendered' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('rendered')"
            >Preview</button>
            <button
              class="px-2.5 py-1 text-xs transition-colors border-l border-border"
              :class="viewMode === 'source' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('source')"
            >Source</button>
          </div>

          <!-- JSON: Tree ↔ Source -->
          <div v-else-if="fileCategory === 'json'" class="flex rounded border border-border overflow-hidden mr-1">
            <button
              class="px-2.5 py-1 text-xs transition-colors"
              :class="viewMode === 'tree' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('tree')"
            >Tree</button>
            <button
              class="px-2.5 py-1 text-xs transition-colors border-l border-border"
              :class="viewMode === 'source' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('source')"
            >Source</button>
          </div>

          <!-- CSV: Table ↔ Source -->
          <div v-else-if="fileCategory === 'csv'" class="flex rounded border border-border overflow-hidden mr-1">
            <button
              class="px-2.5 py-1 text-xs transition-colors"
              :class="viewMode === 'table' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('table')"
            >Table</button>
            <button
              class="px-2.5 py-1 text-xs transition-colors border-l border-border"
              :class="viewMode === 'source' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('source')"
            >Source</button>
          </div>

          <!-- Source-mode controls (word wrap + minimap) -->
          <template v-if="viewMode === 'source'">
            <button
              class="p-1.5 rounded transition-colors text-text-secondary hover:text-text-primary"
              :class="wordWrap ? 'bg-accent-blue/20 text-accent-blue' : 'hover:bg-bg-hover'"
              :title="wordWrap ? 'Disable Word Wrap' : 'Enable Word Wrap'"
              @click="toggleWordWrap"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h10a4 4 0 010 8H10m0 0l3-3m-3 3l3 3" />
              </svg>
            </button>
            <button
              class="p-1.5 rounded transition-colors text-text-secondary hover:text-text-primary"
              :class="showMinimap ? 'bg-accent-blue/20 text-accent-blue' : 'hover:bg-bg-hover'"
              title="Toggle Minimap"
              @click="toggleMinimap"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </button>
          </template>

          <!-- Filter input (source mode for all text files) -->
          <template v-if="viewMode === 'source'">
            <div class="flex items-center gap-1 ml-2">
              <div class="relative">
                <input
                  v-model="filterExpression"
                  type="text"
                  placeholder="Filter (Enter): co(error)"
                  class="w-56 px-2 py-1 text-xs rounded border bg-bg-primary text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-blue"
                  :class="filterError ? 'border-red-500' : 'border-border'"
                  @keydown="onFilterKeydown"
                />
                <span
                  v-if="filterMatchCount !== null && !filterError"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-tertiary"
                >{{ filterMatchCount }}/{{ lineCount }}</span>
              </div>
              <button
                v-if="filterExpression"
                class="p-1 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-hover"
                title="Clear filter (Esc)"
                @click="clearFilter"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </template>

          <!-- JSON tree-mode controls (expand/collapse all) -->
          <template v-if="viewMode === 'tree' && fileCategory === 'json'">
            <button
              class="p-1.5 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-hover"
              title="Expand All"
              @click="jsonTreeRef?.expandAll()"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
            <button
              class="p-1.5 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-hover"
              title="Collapse All"
              @click="jsonTreeRef?.collapseAll()"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            </button>
          </template>
        </div>
      </div>

      <!-- ── Rendered Markdown ── -->
      <div
        v-if="viewMode === 'rendered'"
        class="flex-1 overflow-auto px-8 py-6 md-rendered"
      >
        <div class="max-w-3xl mx-auto" v-html="renderedHtml"></div>
      </div>

      <!-- ── JSON Tree View (using @alenaksu/json-viewer) ── -->
      <div v-else-if="viewMode === 'tree'" class="flex-1 overflow-auto">
        <json-viewer
          v-if="parsedJsonData !== null"
          ref="jsonTreeRef"
          class="json-viewer-container"
        ></json-viewer>
        <div v-else class="flex items-center justify-center h-full text-text-tertiary">
          <p>Invalid JSON - cannot display tree view</p>
        </div>
      </div>

      <!-- ── CSV Table ── -->
      <div v-else-if="viewMode === 'table'" class="flex-1 overflow-auto relative">
        <table class="w-full text-xs border-collapse">
          <thead class="sticky top-0 z-10 bg-bg-tertiary">
            <tr>
              <th
                v-for="(header, ci) in csvHeaders"
                :key="ci"
                class="px-3 py-2 text-left font-semibold text-text-secondary border-b border-r border-border last:border-r-0 whitespace-nowrap"
              >{{ header || `Col ${ci + 1}` }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, ri) in csvRows"
              :key="ri"
              class="border-b border-border/40 hover:bg-bg-hover/50 transition-colors"
              :class="ri % 2 !== 0 ? 'bg-bg-primary/20' : ''"
            >
              <td
                v-for="(_, ci) in csvHeaders"
                :key="ci"
                class="px-3 py-1.5 text-text-primary border-r border-border/20 last:border-r-0 max-w-[200px] truncate"
                :title="row[ci] ?? ''"
              >{{ row[ci] ?? '' }}</td>
            </tr>
          </tbody>
        </table>
        <div
          v-if="csvTruncated"
          class="sticky bottom-0 text-center py-2 text-xs text-text-tertiary bg-bg-tertiary/95 border-t border-border backdrop-blur-sm"
        >
          Showing first {{ CSV_ROW_LIMIT.toLocaleString() }} of {{ totalCsvRows.toLocaleString() }} rows
        </div>
      </div>

      <!-- ── Monaco Editor (source view) ── -->
      <div v-else ref="editorContainer" class="flex-1 overflow-hidden"></div>

      <!-- ── File Info Bar ── -->
      <div class="flex-shrink-0 px-4 py-2 bg-bg-tertiary border-t border-border">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium text-text-primary">{{ file.name }}</span>
            <span class="text-xs text-text-tertiary">{{ formatSize(file.size) }}</span>
            <!-- Modified indicator -->
            <span
              v-if="isModified"
              class="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-500 font-medium"
            >Modified</span>
          </div>
          <div class="flex items-center gap-2">
            <!-- Diff button -->
            <button
              v-if="isModified"
              class="px-3 py-1 text-xs bg-bg-hover text-text-primary rounded hover:bg-bg-secondary transition-colors flex items-center gap-1.5"
              @click="showDiff"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Diff
            </button>
            <!-- Save button -->
            <button
              class="px-3 py-1 text-xs bg-accent-blue text-white rounded hover:bg-accent-blue/80 transition-colors flex items-center gap-1.5"
              :class="{ 'opacity-50 cursor-not-allowed': !isModified || isSaving }"
              :disabled="!isModified || isSaving"
              @click="saveFile"
            >
              <svg v-if="isSaving" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Save
              <span class="text-[10px] opacity-70">⌘S</span>
            </button>
            <button
              class="px-3 py-1 text-xs bg-bg-hover text-text-primary rounded hover:bg-bg-secondary transition-colors"
              @click="emit('open-in-full')"
            >
              Open in Full Viewer
            </button>
          </div>
        </div>
      </div>

      <!-- ── Diff Modal ── -->
      <div
        v-if="showDiffModal"
        class="absolute inset-0 bg-bg-primary z-40 flex flex-col"
      >
        <div class="flex items-center justify-between px-4 py-3 bg-bg-tertiary border-b border-border flex-shrink-0">
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium text-text-primary">Changes: {{ file.name }}</span>
            <span class="text-xs text-text-tertiary">Original → Modified</span>
            <span class="text-xs text-text-tertiary ml-2">(Press Esc to close)</span>
          </div>
          <button
            class="p-1.5 rounded hover:bg-bg-hover text-text-secondary"
            @click="closeDiff"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div ref="diffContainer" class="flex-1 overflow-hidden"></div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import type { FileInfo } from '@/types'
import { ComposeExpression, ComposedExpression } from '@/utils/textFilter'
import '@alenaksu/json-viewer'
import { Marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

// ── Electron freeze prevention: MonacoEnvironment BEFORE any monaco import ────
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline'
;(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker() { return new EditorWorker() }
}
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'

// ── Register Monaco languages for syntax highlighting ───────────────────────────
// These imports register the language tokenizers with Monaco
// Note: JSON is handled separately by Monaco's built-in support
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution'
import 'monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution'
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution'
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution'
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution'
import 'monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution'
import 'monaco-editor/esm/vs/basic-languages/swift/swift.contribution'
import 'monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution'
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution'
import 'monaco-editor/esm/vs/basic-languages/php/php.contribution'
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution'
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution'
import 'monaco-editor/esm/vs/basic-languages/scss/scss.contribution'
import 'monaco-editor/esm/vs/basic-languages/less/less.contribution'
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution'
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution'
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution'
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution'
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution'
import 'monaco-editor/esm/vs/basic-languages/powershell/powershell.contribution'
import 'monaco-editor/esm/vs/basic-languages/bat/bat.contribution'
import 'monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile.contribution'
import 'monaco-editor/esm/vs/basic-languages/lua/lua.contribution'
import 'monaco-editor/esm/vs/basic-languages/perl/perl.contribution'
import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution'
import 'monaco-editor/esm/vs/basic-languages/dart/dart.contribution'
import 'monaco-editor/esm/vs/basic-languages/scala/scala.contribution'
import 'monaco-editor/esm/vs/basic-languages/r/r.contribution'
import 'monaco-editor/esm/vs/basic-languages/objective-c/objective-c.contribution'
import 'monaco-editor/esm/vs/basic-languages/solidity/solidity.contribution'
import 'monaco-editor/esm/vs/basic-languages/mysql/mysql.contribution'
import 'monaco-editor/esm/vs/basic-languages/pgsql/pgsql.contribution'
import 'monaco-editor/esm/vs/basic-languages/redis/redis.contribution'
import 'monaco-editor/esm/vs/basic-languages/clojure/clojure.contribution'
import 'monaco-editor/esm/vs/basic-languages/elixir/elixir.contribution'
import 'monaco-editor/esm/vs/basic-languages/fsharp/fsharp.contribution'
import 'monaco-editor/esm/vs/basic-languages/graphql/graphql.contribution'
import 'monaco-editor/esm/vs/basic-languages/hcl/hcl.contribution'
import 'monaco-editor/esm/vs/basic-languages/protobuf/protobuf.contribution'
import 'monaco-editor/esm/vs/basic-languages/pug/pug.contribution'
import 'monaco-editor/esm/vs/basic-languages/scheme/scheme.contribution'
import 'monaco-editor/esm/vs/basic-languages/systemverilog/systemverilog.contribution'
import 'monaco-editor/esm/vs/basic-languages/julia/julia.contribution'
import 'monaco-editor/esm/vs/basic-languages/abap/abap.contribution'
import 'monaco-editor/esm/vs/basic-languages/apex/apex.contribution'
import 'monaco-editor/esm/vs/basic-languages/restructuredtext/restructuredtext.contribution'
import 'monaco-editor/esm/vs/basic-languages/cypher/cypher.contribution'
import 'monaco-editor/esm/vs/basic-languages/tcl/tcl.contribution'
import 'monaco-editor/esm/vs/basic-languages/vb/vb.contribution'
import 'monaco-editor/esm/vs/basic-languages/wgsl/wgsl.contribution'
import 'monaco-editor/esm/vs/basic-languages/redshift/redshift.contribution'
import 'monaco-editor/esm/vs/basic-languages/msdax/msdax.contribution'
import 'monaco-editor/esm/vs/basic-languages/mips/mips.contribution'
import 'monaco-editor/esm/vs/basic-languages/pascal/pascal.contribution'
import 'monaco-editor/esm/vs/basic-languages/lexon/lexon.contribution'
import 'monaco-editor/esm/vs/basic-languages/bicep/bicep.contribution'
import 'monaco-editor/esm/vs/basic-languages/cameligo/cameligo.contribution'
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController'

// ── Marked setup (singleton at module level) ──────────────────────────────────
const markedInstance = new Marked(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext'
      return hljs.highlight(code, { language }).value
    }
  })
)
markedInstance.setOptions({ gfm: true, breaks: false })

const log = (msg: string, ...args: unknown[]) => console.log(`[PreviewTextContent] ${msg}`, ...args)

// ── Constants ─────────────────────────────────────────────────────────────────
const CSV_ROW_LIMIT = 2000

// ── Props / Emits ─────────────────────────────────────────────────────────────
const props = defineProps<{
  file: FileInfo
  deviceId: string
}>()

const emit = defineEmits<{
  'open-in-full': []
}>()

// ── JSON Tree View Component Ref ──────────────────────────────────────────────
// json-viewer web component interface
interface JsonViewerElement extends HTMLElement {
  data: unknown
  expandAll: () => void
  collapseAll: () => void
}
const jsonTreeRef = ref<JsonViewerElement | null>(null)

// ── State ─────────────────────────────────────────────────────────────────────
const editorContainer = ref<HTMLElement | null>(null)
// shallowRef: prevents Vue from deeply proxying Monaco internals (causes freezes)
const editorInstance = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)

const loading = ref(true)
const hasError = ref(false)
const errorMessage = ref('')
const lineCount = ref(0)
const wordWrap = ref(false)
const showMinimap = ref(false)

type ViewMode = 'source' | 'rendered' | 'table' | 'tree'
const viewMode = ref<ViewMode>('source')

// Parsed JSON data for tree view
const parsedJsonData = shallowRef<unknown>(null)

// Prepared content passed to Monaco (may be formatted differently from raw)
const preparedContent = ref('')
// Sanitized HTML for markdown rendered view
const renderedHtml = ref('')

// CSV state
const csvHeaders = ref<string[]>([])
const csvRows = ref<string[][]>([])
const totalCsvRows = ref(0)
const csvTruncated = ref(false)

// JSON validation state
const jsonStatus = ref<'valid' | 'invalid' | null>(null)

// Filter expression state (for log files)
const filterExpression = ref('')
const filterError = ref<string | null>(null)
const compiledFilter = shallowRef<ComposedExpression | null>(null)
const filterMatchCount = ref<number | null>(null)

// ── Edit & Save State ─────────────────────────────────────────────────────────
const isModified = ref(false)
const isSaving = ref(false)
const originalContent = ref('')
const showDiffModal = ref(false)
const diffContainer = ref<HTMLElement | null>(null)
const diffEditor = shallowRef<monaco.editor.IStandaloneDiffEditor | null>(null)

// Count JSON nodes for tree view stats
const jsonNodeCount = computed(() => {
  if (!parsedJsonData.value) return 0
  let count = 0
  function countNodes(data: unknown): void {
    if (data === null || data === undefined) return
    count++
    if (Array.isArray(data)) {
      data.forEach(item => countNodes(item))
    } else if (typeof data === 'object') {
      Object.values(data as Record<string, unknown>).forEach(v => countNodes(v))
    }
  }
  countNodes(parsedJsonData.value)
  return count
})

// ── File category ──────────────────────────────────────────────────────────────
// Determines default view mode and format-specific processing.
//
//  markdown → default: rendered  (toggle: rendered ↔ source)
//  json     → default: tree      (toggle: tree ↔ source, auto-formatted, validity badge)
//  xml/svg  → default: source    (Monaco XML folding)
//  csv      → default: table     (toggle: table ↔ source)
//  log/txt  → default: source    (word wrap ON)
//  code     → default: source    (Monaco with syntax highlighting)
type FileCategory = 'markdown' | 'json' | 'xml' | 'csv' | 'log' | 'code'

const fileCategory = computed((): FileCategory => {
  const ext = (props.file.extension?.replace('.', '') || '').toLowerCase()
  const name = props.file.name.toLowerCase()
  if (['md', 'markdown'].includes(ext)) return 'markdown'
  if (['json', 'jsonc'].includes(ext)) return 'json'
  if (['xml', 'svg', 'xsl', 'xsd'].includes(ext)) return 'xml'
  if (ext === 'csv') return 'csv'
  if (['log', 'txt'].includes(ext) || name.endsWith('.log')) return 'log'
  return 'code'
})

// ── Language detection ────────────────────────────────────────────────────────
// Maps file extensions to Monaco language identifiers
// Only includes languages supported by Monaco Editor basic-languages
const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  // Web Frontend
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  vue: 'html', html: 'html', htm: 'html', xhtml: 'html', shtml: 'html',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  svelte: 'html', astro: 'html',

  // Data Formats
  json: 'json', jsonc: 'json', json5: 'json',
  xml: 'xml', svg: 'xml', xsl: 'xml', xsd: 'xml', xslt: 'xml',
  yaml: 'yaml', yml: 'yaml',
  toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', env: 'ini',
  csv: 'plaintext', tsv: 'plaintext',

  // Scripting Languages
  py: 'python', pyw: 'python', pyx: 'python', pyi: 'python',
  rb: 'ruby', rbs: 'ruby', rake: 'ruby', gemspec: 'ruby',
  php: 'php', phtml: 'php', php3: 'php', php4: 'php', php5: 'php',
  lua: 'lua',
  pl: 'perl', pm: 'perl', t: 'perl', pod: 'perl',
  r: 'r', rmd: 'markdown',
  jl: 'julia',

  // Shell Scripts
  sh: 'shell', bash: 'shell', zsh: 'shell', ksh: 'shell', fish: 'shell',
  bat: 'bat', cmd: 'bat',
  ps1: 'powershell', ps1m: 'powershell', psd1: 'powershell',

  // Systems Programming
  c: 'cpp', h: 'cpp',  // Use cpp for C as Monaco doesn't have separate C support
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hxx: 'cpp', inc: 'cpp',
  cs: 'csharp', vb: 'vb',
  java: 'java', jav: 'java',
  kt: 'kotlin', kts: 'kotlin',
  swift: 'swift',
  go: 'go',
  rs: 'rust',
  dart: 'dart',
  scala: 'scala', sc: 'scala',
  // Unsupported systems languages fallback to plaintext
  nim: 'plaintext', zig: 'plaintext', v: 'plaintext', odin: 'plaintext',

  // Functional Languages
  // OCaml, Haskell, Elm, Erlang not supported -> plaintext
  ml: 'plaintext', mli: 'plaintext',
  fs: 'fsharp', fsi: 'fsharp', fsx: 'fsharp',
  hs: 'plaintext', lhs: 'plaintext',
  elm: 'plaintext',
  clj: 'clojure', cljs: 'clojure', cljc: 'clojure',
  ex: 'elixir', exs: 'elixir',
  erl: 'plaintext', hrl: 'plaintext',
  lisp: 'plaintext', lsp: 'plaintext', cl: 'plaintext',
  scm: 'scheme', ss: 'scheme',

  // Mobile Development
  m: 'objective-c', mm: 'objective-c',
  gradle: 'plaintext',  // Groovy not in basic-languages
  storyboard: 'xml', xib: 'xml',

  // Database
  sql: 'sql', ddl: 'sql', dml: 'sql',
  prisma: 'plaintext',
  graphql: 'graphql', gql: 'graphql',
  proto: 'protobuf',

  // Markup & Documentation
  md: 'markdown', markdown: 'markdown', mdx: 'mdx',
  rst: 'restructuredtext',
  tex: 'plaintext', sty: 'plaintext',  // LaTeX not supported
  asciidoc: 'plaintext', adoc: 'plaintext',
  org: 'plaintext',

  // DevOps & Infrastructure
  dockerfile: 'dockerfile',
  dockerignore: 'plaintext',
  helm: 'yaml',
  tf: 'hcl', tfvars: 'hcl',
  hcl: 'hcl',
  nginx: 'plaintext',
  apache: 'plaintext',
  vhost: 'plaintext',

  // Config Files
  editorconfig: 'ini',
  prettierc: 'json',
  eslintrc: 'json',
  babelrc: 'json',
  tsconfig: 'json',

  // Build & Package
  makefile: 'plaintext', mk: 'plaintext',
  cmake: 'plaintext',
  bazel: 'plaintext', bzl: 'plaintext',
  groovy: 'plaintext', gvy: 'plaintext',

  // Other
  log: 'plaintext', txt: 'plaintext', text: 'plaintext',
  asm: 'plaintext', s: 'plaintext',
  wasm: 'plaintext', wat: 'plaintext',
  sol: 'solidity',
  move: 'plaintext',
  coq: 'plaintext',
  verilog: 'systemverilog', vlog: 'systemverilog',
  vhdl: 'plaintext',
}

function detectLanguage(file: FileInfo): string {
  const ext = (file.extension?.replace('.', '') || '').toLowerCase()
  const nameLower = file.name.toLowerCase()
  if (nameLower === 'dockerfile') return 'dockerfile'
  if (nameLower === 'makefile') return 'plaintext'
  if (nameLower.startsWith('.gitignore') || nameLower === '.gitattributes') return 'plaintext'
  return EXTENSION_LANGUAGE_MAP[ext] || 'plaintext'
}

const monacoLanguage = computed(() => detectLanguage(props.file))

const displayLanguage = computed(() => {
  const DISPLAY: Record<string, string> = {
    // Web
    javascript: 'JavaScript', typescript: 'TypeScript', html: 'HTML',
    css: 'CSS', scss: 'SCSS', less: 'Less',
    // Data
    json: 'JSON', xml: 'XML', yaml: 'YAML', ini: 'INI/TOML',
    // Scripting
    python: 'Python', ruby: 'Ruby', php: 'PHP', lua: 'Lua', perl: 'Perl',
    r: 'R', julia: 'Julia',
    // Shell
    shell: 'Shell', bat: 'Batch', powershell: 'PowerShell',
    // Systems
    cpp: 'C/C++', csharp: 'C#', java: 'Java',
    kotlin: 'Kotlin', swift: 'Swift', go: 'Go', rust: 'Rust', dart: 'Dart',
    scala: 'Scala',
    // Functional
    fsharp: 'F#', clojure: 'Clojure', elixir: 'Elixir', scheme: 'Scheme',
    // Mobile
    'objective-c': 'Objective-C',
    // DB & API
    sql: 'SQL', mysql: 'MySQL', pgsql: 'PostgreSQL', redis: 'Redis',
    graphql: 'GraphQL', protobuf: 'Protocol Buffers',
    // Docs
    markdown: 'Markdown', mdx: 'MDX', restructuredtext: 'reStructuredText',
    // DevOps
    dockerfile: 'Dockerfile', hcl: 'HCL (Terraform)',
    // Other
    plaintext: 'Plain Text', solidity: 'Solidity', systemverilog: 'SystemVerilog',
  }
  return DISPLAY[monacoLanguage.value] || monacoLanguage.value
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

// ── Format processors ─────────────────────────────────────────────────────────

function processJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    jsonStatus.value = 'valid'
    parsedJsonData.value = parsed
    return JSON.stringify(parsed, null, 2)
  } catch {
    jsonStatus.value = 'invalid'
    parsedJsonData.value = null
    return raw
  }
}

async function processMarkdown(raw: string): Promise<void> {
  // marked v17: parse() can return string | Promise<string>
  const html = await Promise.resolve(markedInstance.parse(raw))
  renderedHtml.value = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1','h2','h3','h4','h5','h6','p','br','hr',
      'ul','ol','li','blockquote','pre','code',
      'table','thead','tbody','tr','th','td',
      'a','strong','em','del','ins','sup','sub','span','div','img',
      'details','summary',
    ],
    ALLOWED_ATTR: ['href','title','src','alt','class','id','target','rel','open'],
    ALLOW_DATA_ATTR: false,
    FORCE_BODY: true,
  })
}

/** RFC 4180-compliant CSV parser — handles quoted fields with embedded commas/newlines */
function parseCsvText(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue }
      if (ch === '"') { inQuotes = false }
      else { field += ch }
    } else {
      if (ch === '"') { inQuotes = true }
      else if (ch === ',') { row.push(field); field = '' }
      else if (ch === '\r' && text[i + 1] === '\n') {
        row.push(field); rows.push(row); row = []; field = ''; i += 2; continue
      } else if (ch === '\n' || ch === '\r') {
        row.push(field); rows.push(row); row = []; field = ''
      } else { field += ch }
    }
    i++
  }
  if (field || row.length > 0) { row.push(field); if (row.some(c => c !== '')) rows.push(row) }
  return rows
}

function processCsv(raw: string): void {
  const rows = parseCsvText(raw)
  if (rows.length === 0) { csvHeaders.value = []; csvRows.value = []; return }
  csvHeaders.value = rows[0]
  const data = rows.slice(1).filter(r => r.length > 0)
  totalCsvRows.value = data.length
  if (data.length > CSV_ROW_LIMIT) {
    csvRows.value = data.slice(0, CSV_ROW_LIMIT)
    csvTruncated.value = true
  } else {
    csvRows.value = data
    csvTruncated.value = false
  }
}

// ── Editor lifecycle ──────────────────────────────────────────────────────────
function createEditor(content: string) {
  if (!editorContainer.value) return
  const isDark = document.documentElement.classList.contains('dark') ||
    window.matchMedia('(prefers-color-scheme: dark)').matches

  editorInstance.value = monaco.editor.create(editorContainer.value, {
    value: content,
    language: monacoLanguage.value,
    theme: isDark ? 'vs-dark' : 'vs',
    automaticLayout: true,
    minimap: { enabled: showMinimap.value },
    wordWrap: wordWrap.value ? 'on' : 'off',
    scrollBeyondLastLine: false,
    renderLineHighlight: 'line',
    lineNumbers: 'on',
    glyphMargin: false,
    folding: true,
    foldingHighlight: true,
    fontSize: 13,
    fontFamily: "JetBrains Mono, Menlo, Monaco, 'Courier New', monospace",
    smoothScrolling: false,
    hover: { enabled: false },
    quickSuggestions: false,
    parameterHints: { enabled: false },
    suggestOnTriggerCharacters: false,
    acceptSuggestionOnEnter: 'off',
    tabCompletion: 'off',
    wordBasedSuggestions: false,
    contextmenu: true,
    copyWithSyntaxHighlighting: false,
    cursorStyle: 'line',
    cursorBlinking: 'blink',
  })

  // Listen for content changes to detect modifications
  const model = editorInstance.value.getModel()
  if (model) {
    model.onDidChangeContent(() => {
      const currentValue = model.getValue()
      const wasModified = isModified.value
      isModified.value = currentValue !== originalContent.value
      if (wasModified !== isModified.value) {
        log('Modified state changed:', isModified.value)
      }
    })
  }

  // Register Cmd+S save shortcut
  editorInstance.value.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    saveFile()
  })

  lineCount.value = model?.getLineCount() ?? 0
  log(`Editor created: lang=${monacoLanguage.value} lines=${lineCount.value}`)
}

function destroyEditor() {
  if (editorInstance.value) {
    editorInstance.value.getModel()?.dispose()
    editorInstance.value.dispose()
    editorInstance.value = null
  }
}

// ── File loading ──────────────────────────────────────────────────────────────
async function loadFile() {
  loading.value = true
  hasError.value = false
  errorMessage.value = ''
  jsonStatus.value = null
  csvHeaders.value = []
  csvRows.value = []
  wordWrap.value = false
  // Reset filter state
  filterExpression.value = ''
  filterError.value = null
  compiledFilter.value = null
  filterMatchCount.value = null
  destroyEditor()

  try {
    log('Loading:', props.file.name, 'device:', props.deviceId)
    const base64 = await window.fileman.readFile(props.deviceId, props.file.path)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes)

    const category = fileCategory.value
    let editorContent = raw

    if (category === 'json') {
      editorContent = processJson(raw)
    } else if (category === 'markdown') {
      await processMarkdown(raw)
    } else if (category === 'csv') {
      processCsv(raw)
    } else if (category === 'log') {
      wordWrap.value = true
    }

    preparedContent.value = editorContent
    originalContent.value = editorContent
    isModified.value = false

    // Set initial view mode per category
    viewMode.value = category === 'markdown' ? 'rendered'
      : category === 'csv' ? 'table'
      : category === 'json' ? 'tree'
      : 'source'

    loading.value = false

    if (viewMode.value === 'source') {
      await nextTick()
      createEditor(editorContent)
    } else if (viewMode.value === 'tree' && parsedJsonData.value !== null) {
      await nextTick()
      if (jsonTreeRef.value) {
        jsonTreeRef.value.data = parsedJsonData.value
      }
    }
  } catch (err) {
    log('Error loading file:', err)
    loading.value = false
    hasError.value = true
    errorMessage.value = err instanceof Error ? err.message : 'Unknown error'
  }
}

// ── View mode switching ───────────────────────────────────────────────────────
async function setViewMode(mode: ViewMode) {
  if (mode === viewMode.value) return
  viewMode.value = mode
  if (mode === 'source') {
    await nextTick()
    createEditor(preparedContent.value)
  } else if (mode === 'tree' && parsedJsonData.value !== null) {
    destroyEditor()
    await nextTick()
    if (jsonTreeRef.value) {
      jsonTreeRef.value.data = parsedJsonData.value
    }
  } else {
    destroyEditor()
  }
}

// ── Toolbar actions ───────────────────────────────────────────────────────────
function toggleWordWrap() {
  wordWrap.value = !wordWrap.value
  editorInstance.value?.updateOptions({ wordWrap: wordWrap.value ? 'on' : 'off' })
}

function toggleMinimap() {
  showMinimap.value = !showMinimap.value
  editorInstance.value?.updateOptions({ minimap: { enabled: showMinimap.value } })
}

// ── Filter expression handlers (all source-mode text files) ─────────────────

function onFilterKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    applyFilter()
  } else if (event.key === 'Escape') {
    clearFilter()
  }
}

function applyFilter() {
  const expr = filterExpression.value.trim()
  log('applyFilter: expr="%s"', expr)

  if (!expr) {
    // No filter - show all content
    compiledFilter.value = null
    filterError.value = null
    filterMatchCount.value = null
    updateEditorContent(preparedContent.value)
    log('applyFilter: empty expression, showing all content')
    return
  }

  log('applyFilter: parsing expression...')
  const filter = ComposeExpression(expr)
  log('applyFilter: isValid=%s, error=%s', filter.isValid(), filter.error())

  if (!filter.isValid()) {
    compiledFilter.value = null
    filterError.value = filter.error()
    filterMatchCount.value = null
    log('applyFilter: parse failed: %s', filter.error())
    return
  }

  compiledFilter.value = filter
  filterError.value = null

  // Apply filter to content
  applyFilterToContent()
}

function applyFilterToContent() {
  log('applyFilterToContent: compiledFilter=%s, preparedContent.length=%d',
    compiledFilter.value ? 'exists' : 'null',
    preparedContent.value.length)

  if (!compiledFilter.value) {
    updateEditorContent(preparedContent.value)
    return
  }

  const lines = preparedContent.value.split('\n')
  log('applyFilterToContent: total lines=%d', lines.length)

  const matchingLines: string[] = []
  let matchCount = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const matches = compiledFilter.value!.match(line)
    if (matches) {
      matchingLines.push(line)
      matchCount++
      if (matchCount <= 5) {
        log('applyFilterToContent: line %d matches: %s', i + 1, line.substring(0, 100))
      }
    }
  }

  log('applyFilterToContent: matched %d / %d lines', matchCount, lines.length)
  filterMatchCount.value = matchCount
  updateEditorContent(matchingLines.join('\n'))
}

function clearFilter() {
  log('clearFilter: clearing filter')
  filterExpression.value = ''
  compiledFilter.value = null
  filterError.value = null
  filterMatchCount.value = null
  updateEditorContent(preparedContent.value)
}

function updateEditorContent(content: string) {
  log('updateEditorContent: content.length=%d, editorInstance=%s',
    content.length, editorInstance.value ? 'exists' : 'null')
  if (editorInstance.value) {
    const model = editorInstance.value.getModel()
    if (model) {
      model.setValue(content)
      lineCount.value = model.getLineCount()
      log('updateEditorContent: updated model, lineCount=%d', lineCount.value)
    } else {
      log('updateEditorContent: model is null')
    }
  } else {
    log('updateEditorContent: editorInstance is null')
  }
}

// ── Save & Diff Functions ─────────────────────────────────────────────────────
async function saveFile() {
  if (!isModified.value || isSaving.value) return

  const editor = editorInstance.value
  if (!editor) return

  isSaving.value = true
  try {
    const content = editor.getValue()
    const encoder = new TextEncoder()
    const bytes = encoder.encode(content)
    const base64 = btoa(String.fromCharCode(...bytes))

    await window.fileman.writeFile(props.deviceId, props.file.path, base64)

    // Update original content and reset modified state
    originalContent.value = content
    preparedContent.value = content
    isModified.value = false

    log('File saved successfully:', props.file.name)
  } catch (err) {
    log('Error saving file:', err)
    errorMessage.value = err instanceof Error ? err.message : 'Failed to save file'
    hasError.value = true
  } finally {
    isSaving.value = false
  }
}

function showDiff() {
  if (!isModified.value) return
  showDiffModal.value = true
  nextTick(() => {
    createDiffEditor()
  })
}

function closeDiff() {
  showDiffModal.value = false
  destroyDiffEditor()
}

// Intercept ESC in capture phase so parent (App.vue) bubble-phase handler never sees it
// when the diff modal is open. Returning `true` signals the event is consumed.
useKeyInterceptor((e: KeyboardEvent) => {
  if (e.key === 'Escape' && showDiffModal.value) {
    closeDiff()
    return true // consumed — blocks parent ESC handlers
  }
})

function createDiffEditor() {
  if (!diffContainer.value) return

  const isDark = document.documentElement.classList.contains('dark') ||
    window.matchMedia('(prefers-color-scheme: dark)').matches

  const currentContent = editorInstance.value?.getValue() || preparedContent.value

  diffEditor.value = monaco.editor.createDiffEditor(diffContainer.value, {
    theme: isDark ? 'vs-dark' : 'vs',
    automaticLayout: true,
    renderSideBySide: true,
    readOnly: true,
    fontSize: 13,
    fontFamily: "JetBrains Mono, Menlo, Monaco, 'Courier New', monospace",
  })

  const originalModel = monaco.editor.createModel(originalContent.value, monacoLanguage.value)
  const modifiedModel = monaco.editor.createModel(currentContent, monacoLanguage.value)

  diffEditor.value.setModel({
    original: originalModel,
    modified: modifiedModel
  })

  log('Diff editor created')
}

function destroyDiffEditor() {
  if (diffEditor.value) {
    const model = diffEditor.value.getModel()
    if (model) {
      model.original?.dispose()
      model.modified?.dispose()
    }
    diffEditor.value.dispose()
    diffEditor.value = null
  }
}

// ── Watchers & lifecycle ──────────────────────────────────────────────────────
watch(
  () => [props.file.path, props.deviceId] as const,
  () => { loadFile() },
  { immediate: false }
)

onMounted(() => {
  loadFile()
})
onUnmounted(() => {
  destroyEditor()
  destroyDiffEditor()
})
</script>

<style scoped>
/* ── Markdown rendered view ───────────────────────────────────────────────── */
.md-rendered { color: var(--text-primary, #e2e2e2); }

.md-rendered :deep(h1),
.md-rendered :deep(h2),
.md-rendered :deep(h3),
.md-rendered :deep(h4),
.md-rendered :deep(h5),
.md-rendered :deep(h6) {
  color: var(--text-primary);
  font-weight: 600;
  line-height: 1.3;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}
.md-rendered :deep(h1) { font-size: 1.75rem; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; margin-top: 0; }
.md-rendered :deep(h2) { font-size: 1.4rem;  border-bottom: 1px solid var(--border); padding-bottom: 0.2em; }
.md-rendered :deep(h3) { font-size: 1.15rem; }
.md-rendered :deep(h4) { font-size: 1rem; }

.md-rendered :deep(p) {
  color: var(--text-primary);
  line-height: 1.75;
  margin-bottom: 1em;
}

.md-rendered :deep(a) {
  color: var(--accent-blue, #4fa3e0);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.md-rendered :deep(strong) { font-weight: 600; color: var(--text-primary); }
.md-rendered :deep(em) { font-style: italic; }
.md-rendered :deep(del) { text-decoration: line-through; opacity: 0.6; }

.md-rendered :deep(blockquote) {
  border-left: 3px solid var(--accent-blue, #4fa3e0);
  margin: 1.2em 0;
  padding: 0.6em 1em;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border-radius: 0 4px 4px 0;
}
.md-rendered :deep(blockquote p) { margin-bottom: 0; }

.md-rendered :deep(ul),
.md-rendered :deep(ol) {
  color: var(--text-primary);
  padding-left: 1.6em;
  margin-bottom: 1em;
}
.md-rendered :deep(ul)  { list-style-type: disc; }
.md-rendered :deep(ol)  { list-style-type: decimal; }
.md-rendered :deep(li)  { line-height: 1.7; margin-bottom: 0.2em; }
.md-rendered :deep(li > ul),
.md-rendered :deep(li > ol) { margin-bottom: 0; }

.md-rendered :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 1.5em 0;
}

/* Inline code */
.md-rendered :deep(:not(pre) > code) {
  font-family: "JetBrains Mono", Menlo, Monaco, "Courier New", monospace;
  font-size: 0.82em;
  background: var(--bg-hover);
  color: var(--text-primary);
  padding: 0.15em 0.4em;
  border-radius: 3px;
  border: 1px solid var(--border);
  white-space: nowrap;
}

/* Code blocks */
.md-rendered :deep(pre) {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1em 1.2em;
  overflow-x: auto;
  margin: 1em 0;
  line-height: 1.6;
}
.md-rendered :deep(pre code) {
  font-family: "JetBrains Mono", Menlo, Monaco, "Courier New", monospace;
  font-size: 0.82rem;
  background: none;
  border: none;
  padding: 0;
  border-radius: 0;
  white-space: pre;
}

/* Tables */
.md-rendered :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 0.875rem;
}
.md-rendered :deep(th) {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-weight: 600;
  padding: 0.5em 0.8em;
  border: 1px solid var(--border);
  text-align: left;
}
.md-rendered :deep(td) {
  padding: 0.45em 0.8em;
  border: 1px solid var(--border);
  color: var(--text-primary);
}
.md-rendered :deep(tr:nth-child(even) td) {
  background: var(--bg-tertiary);
}

.md-rendered :deep(img) {
  max-width: 100%;
  border-radius: 4px;
  display: block;
  margin: 0.5em 0;
}

.md-rendered :deep(details) {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.5em 0.8em;
  margin: 0.8em 0;
}
.md-rendered :deep(summary) {
  cursor: pointer;
  font-weight: 500;
  color: var(--text-secondary);
  user-select: none;
}

/* ── highlight.js token colors (Material-Dark palette, dark-mode friendly) ── */
.md-rendered :deep(.hljs-keyword),
.md-rendered :deep(.hljs-selector-tag),
.md-rendered :deep(.hljs-built_in)       { color: #c792ea; }
.md-rendered :deep(.hljs-string),
.md-rendered :deep(.hljs-attr)           { color: #c3e88d; }
.md-rendered :deep(.hljs-number),
.md-rendered :deep(.hljs-literal)        { color: #f78c6c; }
.md-rendered :deep(.hljs-comment),
.md-rendered :deep(.hljs-quote)          { color: #697098; font-style: italic; }
.md-rendered :deep(.hljs-title),
.md-rendered :deep(.hljs-section)        { color: #82aaff; }
.md-rendered :deep(.hljs-function),
.md-rendered :deep(.hljs-class)          { color: #ffcb6b; }
.md-rendered :deep(.hljs-tag)            { color: #f07178; }
.md-rendered :deep(.hljs-name)           { color: #f07178; }
.md-rendered :deep(.hljs-attribute)      { color: #ffcb6b; }
.md-rendered :deep(.hljs-type)           { color: #decb6b; }
.md-rendered :deep(.hljs-symbol),
.md-rendered :deep(.hljs-bullet)         { color: #89ddff; }
.md-rendered :deep(.hljs-meta)           { color: #89ddff; font-style: italic; }
.md-rendered :deep(.hljs-deletion)       { color: #f07178; background: rgba(240,113,120,0.12); }
.md-rendered :deep(.hljs-addition)       { color: #c3e88d; background: rgba(195,232,141,0.12); }

/* ── JSON Viewer (theme-aware) ─────────────────────────────────────────────────── */
/* Web Component styles - use element selector for proper CSS variable inheritance */
json-viewer.json-viewer-container {
  display: block;
  height: 100%;
  overflow: auto;
  background: var(--bg-secondary);
  padding: 16px;
  --background-color: var(--bg-secondary);
  --color: var(--text-primary);
  --font-family: "JetBrains Mono", Menlo, Monaco, "Courier New", monospace;
  --font-size: 13px;
  --line-height: 1.6;
  --indent-size: 20px;
  --indentguide-size: 1px;
  --indentguide-style: solid;
  --indentguide-color: var(--border);
  --indentguide-color-active: var(--text-tertiary);
  --string-color: #22863a;
  --number-color: #b08800;
  --boolean-color: #0066cc;
  --null-color: #6f42c1;
  --property-color: #005cc5;
  --preview-color: #6a737d;
  --highlight-color: #c92a2a;
  --outline-color: var(--border);
  --outline-width: 1px;
  --outline-style: dotted;
}

/* Dark mode overrides */
:root.dark json-viewer.json-viewer-container,
.dark json-viewer.json-viewer-container {
  --string-color: #a3eea0;
  --number-color: #d19a66;
  --boolean-color: #4ba7ef;
  --null-color: #df9cf3;
  --property-color: #6fb3d2;
  --preview-color: #deae8f;
  --highlight-color: #c92a2a;
}
</style>

<!-- Global styles for Web Component (json-viewer uses Shadow DOM) -->
<style>
json-viewer {
  --background-color: var(--bg-secondary);
  --color: var(--text-primary);
  --font-family: "JetBrains Mono", Menlo, Monaco, "Courier New", monospace;
  --font-size: 13px;
  --line-height: 1.6;
  --indent-size: 20px;
  --indentguide-size: 1px;
  --indentguide-style: solid;
  --indentguide-color: var(--border);
  --indentguide-color-active: var(--text-tertiary);
  /* Light mode colors (high contrast) */
  --string-color: #22863a;
  --number-color: #b08800;
  --boolean-color: #0066cc;
  --null-color: #6f42c1;
  --property-color: #005cc5;
  --preview-color: #6a737d;
  --highlight-color: #c92a2a;
  --outline-color: var(--border);
  --outline-width: 1px;
  --outline-style: dotted;
}

/* Dark mode colors */
:root.dark json-viewer,
.dark json-viewer {
  --string-color: #a3eea0;
  --number-color: #d19a66;
  --boolean-color: #4ba7ef;
  --null-color: #df9cf3;
  --property-color: #6fb3d2;
  --preview-color: #deae8f;
  --highlight-color: #c92a2a;
}

json-viewer::part(property) {
  padding-left: var(--indent-size);
}

json-viewer::part(object) {
  margin-left: var(--indent-size);
}
</style>
