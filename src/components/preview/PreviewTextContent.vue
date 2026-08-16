<template>
  <div class="finder-preview h-full flex flex-col bg-bg-secondary">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <div class="flex flex-col items-center gap-2">
        <div class="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-text-secondary">{{ $t('preview.text.loading') }}</span>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="hasError" class="flex flex-col items-center justify-center h-full text-text-tertiary p-4">
      <svg class="w-12 h-12 mb-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p class="text-sm font-medium text-text-primary mb-1">{{ $t('preview.text.loadFailed') }}</p>
      <p class="text-xs text-center max-w-xs">{{ errorMessage }}</p>
    </div>

    <!-- Content Area -->
    <div v-else class="flex-1 flex flex-col overflow-hidden">

      <!-- 大文件截断横幅 -->
      <div
        v-if="truncated"
        class="flex-shrink-0 px-3 py-1 text-xs text-text-tertiary bg-bg-hover border-b border-border"
      >
        {{ $t('preview.text.truncatedBanner', { size: formatSizeText(props.file.size), limit: TEXT_PREVIEW_BYTE_CAP / 1024 / 1024 }) }}
      </div>

      <!-- ── Toolbar ── -->
      <div class="finder-preview-toolbar flex items-center justify-between border-b border-border flex-shrink-0">
        <!-- Left: language badge + stats -->
        <div class="flex items-center gap-2.5">
          <span class="finder-preview-badge">
            {{ displayLanguage }}
          </span>
          <span v-if="viewMode === 'source'" class="text-xs text-text-tertiary">
            {{ $t('preview.text.linesCount', lineCount) }}
          </span>
          <span v-else-if="viewMode === 'table'" class="text-xs text-text-tertiary">
            {{ $t('preview.text.csvRowsCols', { rows: csvRows.length + (csvTruncated ? '+' : ''), cols: csvHeaders.length }) }}
          </span>
          <span v-else-if="viewMode === 'tree' && fileCategory === 'json'" class="text-xs text-text-tertiary">
            {{ $t('preview.json.nodeCount', jsonNodeCount) }}
          </span>
          <!-- JSON validity badge -->
          <span
            v-if="fileCategory === 'json' && jsonStatus !== null"
            class="text-xs px-1.5 py-0.5 rounded font-mono leading-none"
            :class="jsonStatus === 'valid' ? 'bg-green-500/15 text-green-500' : 'bg-red-500/15 text-red-400'"
          >{{ jsonStatus === 'valid' ? $t('preview.json.valid') : $t('preview.json.invalid') }}</span>
        </div>

        <!-- Right: view-mode toggles + source-mode controls -->
        <div class="flex items-center gap-1">
          <!-- Markdown: Preview ↔ Source -->
          <div v-if="fileCategory === 'markdown'" class="flex rounded border border-border overflow-hidden mr-1">
            <button
              class="px-2.5 py-1 text-xs transition-colors"
              :class="viewMode === 'rendered' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('rendered')"
            >{{ $t('preview.markdown.previewMode') }}</button>
            <button
              class="px-2.5 py-1 text-xs transition-colors border-l border-border"
              :class="viewMode === 'source' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('source')"
            >{{ $t('preview.markdown.sourceMode') }}</button>
          </div>

          <!-- JSON: Tree ↔ Source -->
          <div v-else-if="fileCategory === 'json'" class="flex rounded border border-border overflow-hidden mr-1">
            <button
              class="px-2.5 py-1 text-xs transition-colors"
              :class="viewMode === 'tree' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('tree')"
            >{{ $t('preview.json.treeMode') }}</button>
            <button
              class="px-2.5 py-1 text-xs transition-colors border-l border-border"
              :class="viewMode === 'source' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('source')"
            >{{ $t('preview.json.sourceMode') }}</button>
          </div>

          <!-- JSON 工具：格式化 / 路径查询 / 复制 TS interfaces -->
          <template v-if="fileCategory === 'json' && jsonStatus === 'valid'">
            <button
              v-if="viewMode === 'source'"
              class="px-2 py-1 text-xs rounded text-text-secondary hover:bg-bg-hover border border-border"
              :title="$t('preview.json.formatJsonTip')"
              @click="formatJsonSource"
            >{{ $t('preview.json.formatJson') }}</button>
            <button
              class="px-2 py-1 text-xs rounded text-text-secondary hover:bg-bg-hover border border-border"
              :title="$t('preview.json.copyTsTip')"
              @click="copyTsInterfaces"
            >{{ $t('preview.json.copyTs') }}</button>
            <div v-if="viewMode === 'tree'" class="flex items-center gap-1">
              <input
                v-model="jsonPathInput"
                type="text"
                class="w-36 px-2 py-1 text-[11px] font-mono rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent-blue"
                placeholder="$.items[0].id"
                spellcheck="false"
                @keydown.enter="applyJsonPath"
              >
              <button
                class="px-1.5 py-1 text-[11px] rounded text-text-secondary hover:bg-bg-hover border border-border"
                :title="$t('preview.json.runPathQueryTip')"
                @click="applyJsonPath"
              >→</button>
            </div>
          </template>

          <!-- CSV: Table ↔ Source -->
          <div v-else-if="fileCategory === 'csv'" class="flex rounded border border-border overflow-hidden mr-1">
            <button
              class="px-2.5 py-1 text-xs transition-colors"
              :class="viewMode === 'table' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('table')"
            >{{ $t('preview.text.tableMode') }}</button>
            <button
              class="px-2.5 py-1 text-xs transition-colors border-l border-border"
              :class="viewMode === 'source' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('source')"
            >{{ $t('preview.json.sourceMode') }}</button>
          </div>

          <!-- Source-mode controls (word wrap + minimap) -->
          <template v-if="viewMode === 'source'">
            <button
              class="finder-icon-button"
              :class="{ 'is-active': wordWrap }"
              :title="wordWrap ? $t('preview.text.wordWrapDisable') : $t('preview.text.wordWrapEnable')"
              @click="toggleWordWrap"
            >
              <IconfontIcon name="code" />
            </button>
            <button
              class="finder-icon-button"
              :class="{ 'is-active': showMinimap }"
              :title="$t('preview.text.minimapTip')"
              @click="toggleMinimap"
            >
              <IconfontIcon name="document" />
            </button>
          </template>

          <!-- Log analysis toolbar: expression filter + color scheme (source mode) -->
          <template v-if="viewMode === 'source'">
            <LogAnalysisToolbar :vm="logAnalysis" @open-scheme-editor="schemeEditorVisible = true" />
          </template>

          <!-- JSON tree-mode controls (expand/collapse all) -->
          <template v-if="viewMode === 'tree' && fileCategory === 'json'">
            <button
              class="p-1.5 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-hover"
              :title="$t('preview.common.expandAll')"
              @click="jsonTreeRef?.expandAll()"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
            <button
              class="p-1.5 rounded transition-colors text-text-secondary hover:text-text-primary hover:bg-bg-hover"
              :title="$t('preview.common.collapseAll')"
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
          <p>{{ $t('preview.json.treeUnavailable') }}</p>
        </div>
      </div>

      <!-- ── CSV Table ── -->
      <!-- JSON 路径查询结果 -->
      <div
        v-if="viewMode === 'tree' && jsonPathResult !== null"
        class="mx-4 my-2 rounded border border-border bg-bg-primary flex-shrink-0"
      >
        <div class="flex items-center justify-between px-3 py-1.5 border-b border-border">
          <span class="text-[11px] font-mono text-text-secondary">{{ jsonPathInput }}</span>
          <button class="text-[11px] text-text-tertiary hover:text-text-primary" @click="jsonPathResult = null">✕</button>
        </div>
        <pre class="px-3 py-2 text-[11px] font-mono text-text-primary overflow-auto max-h-48">{{ jsonPathResult }}</pre>
      </div>

      <div v-else-if="viewMode === 'table'" class="flex-1 overflow-auto relative">
        <table class="w-full text-xs border-collapse">
          <thead class="sticky top-0 z-10 bg-bg-tertiary">
            <tr>
              <th
                v-for="(header, ci) in csvHeaders"
                :key="ci"
                class="px-3 py-2 text-left font-semibold text-text-secondary border-b border-r border-border last:border-r-0 whitespace-nowrap cursor-pointer select-none hover:text-text-primary"
                :title="csvSortColumn === ci ? $t('preview.text.sortColumnTipActive') : $t('preview.text.sortColumnTip')"
                @click="sortCsvBy(ci)"
              >{{ header || $t('preview.text.colLabel', { index: ci + 1 }) }}{{ csvSortIndicator(ci) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, ri) in sortedCsvRows"
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
          {{ $t('preview.text.showingRows', { shown: CSV_ROW_LIMIT.toLocaleString(), total: totalCsvRows.toLocaleString() }) }}
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
            >{{ $t('preview.text.modifiedBadge') }}</span>
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
              {{ $t('preview.text.diffLabel') }}
            </button>
            <!-- Save button (disabled while a filtered view is active) -->
            <button
              class="px-3 py-1 text-xs bg-accent-blue text-white rounded hover:bg-accent-blue/80 transition-colors flex items-center gap-1.5"
              :class="{ 'opacity-50 cursor-not-allowed': !isModified || isSaving || logAnalysis.isViewTransformed.value }"
              :disabled="!isModified || isSaving || logAnalysis.isViewTransformed.value"
              :title="logAnalysis.isViewTransformed.value ? $t('preview.text.saveBlockedTip') : $t('preview.text.save')"
              @click="saveFile"
            >
              <svg v-if="isSaving" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              {{ $t('preview.text.save') }}
              <span class="text-[10px] opacity-70">⌘S</span>
            </button>
          </div>
        </div>
      </div>

      <!-- ── Diff Modal ── -->
      <div
        v-if="showDiffModal"
        class="absolute inset-0 bg-bg-primary z-40 flex flex-col"
      >        <div class="flex items-center justify-between px-4 py-3 bg-bg-tertiary border-b border-border flex-shrink-0">
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium text-text-primary">{{ $t('preview.text.changesTitle', { name: file.name }) }}</span>
            <span class="text-xs text-text-tertiary">{{ $t('preview.text.originalToModified') }}</span>
            <span class="text-xs text-text-tertiary ml-2">{{ $t('preview.text.escToClose') }}</span>
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

      <!-- ── Color Scheme Editor Dialog ── -->
      <SchemeEditorDialog
        v-if="schemeEditorVisible"
        @close="schemeEditorVisible = false"
      />

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { t } from '@/i18n'
import { useKeyInterceptor } from '@/composables/useKeyInterceptor'
import type { FileInfo } from '@/types'
import IconfontIcon from './IconfontIcon.vue'
import { useLogAnalysis } from '@/components/preview/composables/useLogAnalysis'
import LogAnalysisToolbar from '@/components/preview/logview/LogAnalysisToolbar.vue'
import { queryJson } from '@/utils/jsonQuery'
import { jsonToInterfaces } from '@/utils/jsonToTs'
import { copyToClipboard } from '@/utils/clipboard'
import { getLanguageForFile } from '@shared/fileKinds'
import SchemeEditorDialog from '@/components/preview/logview/SchemeEditorDialog.vue'
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
  /** 初始定位行号（grep 命中跳入；仅首次创建编辑器时消费一次）。 */
  initialLine?: number
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
// CSV 列排序（数值感知：全数字列按数值比较，否则 localeCompare）
const csvSortColumn = ref<number | null>(null)
const csvSortDirection = ref<1 | -1>(1)

function sortCsvBy(column: number): void {
  if (csvSortColumn.value === column) {
    if (csvSortDirection.value === 1) csvSortDirection.value = -1
    else { csvSortColumn.value = null; csvSortDirection.value = 1 }
  } else {
    csvSortColumn.value = column
    csvSortDirection.value = 1
  }
}

const sortedCsvRows = computed(() => {
  const column = csvSortColumn.value
  if (column === null) return csvRows.value
  const direction = csvSortDirection.value
  const numeric = csvRows.value.every(row => row[column] === undefined || row[column] === '' || !Number.isNaN(Number(row[column])))
  return [...csvRows.value].sort((a, b) => {
    const av = a[column] ?? ''
    const bv = b[column] ?? ''
    const result = numeric
      ? (Number(av || 0) - Number(bv || 0))
      : av.localeCompare(bv, undefined, { numeric: true })
    return result * direction
  })
})

function csvSortIndicator(column: number): string {
  if (csvSortColumn.value !== column) return ''
  return csvSortDirection.value === 1 ? ' ↑' : ' ↓'
}

// JSON validation state
const jsonStatus = ref<'valid' | 'invalid' | null>(null)

// ── Log analysis (expression filter + color scheme) ──────────────────────────
const schemeEditorVisible = ref(false)
const logAnalysis = useLogAnalysis({
  getEditor: () => editorInstance.value,
  getLines: () => preparedContent.value.split('\n'),
  getOriginalContent: () => preparedContent.value,
  getExportTarget: () => ({ deviceId: props.deviceId, path: props.file.path }),
  canWrite: () => true // adapters expose writeFile; per-device failures surface on export
})

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
// 单一事实源：shared/fileKinds.ts 注册表（扩展名 + 无扩展名/点文件名规则）。
// 语言 id 仅使用 Monaco basic-languages 实际注册过的子集。
const monacoLanguage = computed(() => getLanguageForFile(props.file.name, props.file.extension ?? ''))

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
/** 分隔符自动检测：首行引号外各候选出现次数最多者胜（, ; \t |）。 */
function detectCsvDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let bestCount = -1
  let inQuotes = false
  const counts = new Map<string, number>()
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && (candidates as string[]).includes(ch)) {
      counts.set(ch, (counts.get(ch) ?? 0) + 1)
    }
  }
  for (const [delimiter, count] of counts) {
    if (count > bestCount) { best = delimiter; bestCount = count }
  }
  return best
}

function parseCsvText(text: string, delimiter = ','): string[][] {
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
      else if (ch === delimiter) { row.push(field); field = '' }
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

// ── JSON 增强：格式化 / 路径查询 / 复制 TS interfaces ──
const jsonPathInput = ref('')
const jsonPathResult = ref<string | null>(null)

function formatJsonSource(): void {
  const editor = editorInstance.value
  if (!editor || logAnalysis.isViewTransformed.value) return
  try {
    const parsed = JSON.parse(editor.getValue())
    editor.setValue(JSON.stringify(parsed, null, 2))
  } catch {
    // jsonStatus 已标红；此处静默（格式化仅对合法 JSON 有意义）
  }
}

async function copyTsInterfaces(): Promise<void> {
  if (parsedJsonData.value === null) return
  const text = jsonToInterfaces(parsedJsonData.value)
  if (!text) return
  await copyToClipboard(text)
}

function applyJsonPath(): void {
  if (parsedJsonData.value === null) return
  const result = queryJson(parsedJsonData.value, jsonPathInput.value)
  jsonPathResult.value = result.ok
    ? JSON.stringify(result.value, null, 2)
    : `✗ ${result.error ?? t('preview.json.pathQueryFailed')}`
}

function processCsv(raw: string): void {
  const rows = parseCsvText(raw, detectCsvDelimiter(raw))
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

  // grep 命中跳入：一次性定位到 initialLine（reveal + 选中整行 + 聚焦）
  if (props.initialLine && props.initialLine > 0) {
    const lineNumber = props.initialLine
    const lineCount = editorInstance.value.getModel()?.getLineCount() ?? 0
    const target = Math.min(lineNumber, Math.max(lineCount, 1))
    editorInstance.value.revealLineInCenter(target)
    editorInstance.value.setSelection({ startLineNumber: target, startColumn: 1, endLineNumber: target, endColumn: 1 })
    editorInstance.value.focus()
  }

  // Listen for content changes to detect modifications
  const model = editorInstance.value.getModel()
  if (model) {
    model.onDidChangeContent(() => {
      // Filtered/coloring view transforms content programmatically — never
      // counts as a user modification (PRD QA-3)
      if (logAnalysis.isViewTransformed.value) return
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

  // Lazy viewport coloring on scroll
  editorInstance.value.onDidScrollChange(() => {
    logAnalysis.notifyViewportChanged()
  })

  lineCount.value = model?.getLineCount() ?? 0
  log(`Editor created: lang=${monacoLanguage.value} lines=${lineCount.value}`)
  logAnalysis.onEditorReady()
}

function destroyEditor() {
  if (editorInstance.value) {
    editorInstance.value.getModel()?.dispose()
    editorInstance.value.dispose()
    editorInstance.value = null
  }
}

// ── File loading ──────────────────────────────────────────────────────────────
/** 文本预览载入上限；超过则只读前 8MB 并显示截断横幅。 */
const TEXT_PREVIEW_BYTE_CAP = 8 * 1024 * 1024
const truncated = ref(false)

function formatSizeText(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

async function loadFile() {
  loading.value = true
  hasError.value = false
  errorMessage.value = ''
  jsonStatus.value = null
  csvHeaders.value = []
  csvRows.value = []
  wordWrap.value = false
  // Reset log analysis session (filter state, hit navigation)
  logAnalysis.reset()
  destroyEditor()

  try {
    log('Loading:', props.file.name, 'device:', props.deviceId)
    let base64: string
    if (props.file.size > TEXT_PREVIEW_BYTE_CAP) {
      // 大文件截断：Monaco 整模型渲染几十 MB 会拖垮渲染进程
      const chunk = await window.fileman.readChunk(props.deviceId, props.file.path, 0, TEXT_PREVIEW_BYTE_CAP)
      base64 = chunk.base64
      truncated.value = true
    } else {
      base64 = await window.fileman.readFile(props.deviceId, props.file.path)
      truncated.value = false
    }
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
    errorMessage.value = err instanceof Error ? err.message : t('preview.common.unknownError')
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

// ── Log analysis wiring ───────────────────────────────────────────────────────
// Filtering/coloring transforms the editor content; while transformed the
// source file must stay untouchable (read-only + save disabled, PRD QA-3),
// and modification bookkeeping is suppressed so the filtered view never
// registers as "Modified".


// ── Save & Diff Functions ─────────────────────────────────────────────────────

// ── Save & Diff Functions ─────────────────────────────────────────────────────
async function saveFile() {
  if (!isModified.value || isSaving.value) return
  // Never save while a filtered view is showing — that would overwrite the
  // source file with the filtered subset (PRD QA-3)
  if (logAnalysis.isViewTransformed.value) {
    log('saveFile blocked: filtered view is active')
    return
  }

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
    errorMessage.value = err instanceof Error ? err.message : t('preview.text.saveFailed')
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
  if (e.key === 'Escape' && schemeEditorVisible.value) {
    schemeEditorVisible.value = false
    return true
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
  logAnalysis.dispose()
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
