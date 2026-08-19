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

      <!-- 未保存关闭确认条（tabs 关闭被守卫阻止后就地呈现，三键决策；仿 hex） -->
      <div
        v-if="closeConfirm"
        class="flex items-center gap-2 flex-shrink-0 px-3 py-1.5 text-xs border-b border-border bg-bg-toolbar"
        role="alertdialog"
        :aria-label="$t('preview.text.unsavedAria')"
      >
        <span class="flex-shrink-0">{{ $t('preview.text.unsavedPrompt') }}</span>
        <div class="flex-1" />
        <button
          class="px-2 py-0.5 rounded text-white bg-accent-blue hover:bg-accent-blue-hover disabled:opacity-50"
          :disabled="isSaving"
          @click="saveAndClose"
        >{{ $t('preview.text.saveAndClose') }}</button>
        <button
          class="px-2 py-0.5 rounded text-text-primary hover:bg-bg-hover"
          @click="discardAndClose"
        >{{ $t('preview.text.discard') }}</button>
        <button
          class="px-2 py-0.5 rounded text-text-secondary hover:bg-bg-hover"
          @click="closeConfirm = false"
        >{{ $t('common.cancel') }}</button>
      </div>

      <!-- ── Finder 式三段工具栏（重设计 2026-08-17；2026-08-19 Quick Look 化：
           搜索默认收纳/⌘F 展开，编辑+保存上移，元信息单行低层级） ── -->
      <div class="flex flex-col flex-shrink-0">
        <TextPreviewToolbar
          ref="toolbarRef"
          :vm="logAnalysis"
          :meta-detail="metaInfo"
          :quick-look="quickLook"
          :ql-info="qlInfo"
          :ql-controls="quickLookControls"
          :show-search="viewMode === 'source'"
          :show-source-tools="viewMode === 'source'"
          :word-wrap-on="wordWrap"
          :has-selection="hasSelection"
          :syntax-label="syntaxLabel"
          :syntax-override="syntaxOverride"
          :syntax-languages="SYNTAX_LANGUAGES"
          :font-size="fontSize"
          :show-line-numbers="showLineNumbers"
          :show-minimap="showMinimap"
          :editing="editing"
          :can-edit="editBlockedReason === null"
          :edit-blocked-reason="editBlockedReason"
          :is-modified="isModified"
          :is-saving="isSaving"
          :save-blocked-reason="saveBlockedReason"
          encoding="UTF-8"
          @toggle-wrap="toggleWordWrap"
          @set-syntax="setSyntaxOverride"
          @copy="copyContent"
          @export="onExportMenu"
          @set-font-size="setFontSize"
          @toggle-line-numbers="toggleLineNumbers"
          @toggle-minimap="toggleMinimap"
          @jump-to-line="openJumpPanel"
          @open-scheme-editor="schemeEditorVisible = true"
          @toggle-edit="toggleEditing"
          @save="saveFile"
          @show-diff="showDiff"
        >
        <template #left-extra>
          <!-- Markdown: Preview ↔ Source -->
          <div v-if="fileCategory === 'markdown'" class="finder-control-group">
            <button
              class="px-2.5 py-1 text-xs transition-colors rounded"
              :class="viewMode === 'rendered' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('rendered')"
            >{{ $t('preview.markdown.previewMode') }}</button>
            <button
              class="px-2.5 py-1 text-xs transition-colors rounded"
              :class="viewMode === 'source' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('source')"
            >{{ $t('preview.markdown.sourceMode') }}</button>
          </div>

          <!-- JSON: Tree ↔ Source -->
          <div v-else-if="fileCategory === 'json'" class="finder-control-group">
            <button
              class="px-2.5 py-1 text-xs transition-colors rounded"
              :class="viewMode === 'tree' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('tree')"
            >{{ $t('preview.json.treeMode') }}</button>
            <button
              class="px-2.5 py-1 text-xs transition-colors rounded"
              :class="viewMode === 'source' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('source')"
            >{{ $t('preview.json.sourceMode') }}</button>
          </div>

          <!-- CSV: Table ↔ Source -->
          <div v-else-if="fileCategory === 'csv'" class="finder-control-group">
            <button
              class="px-2.5 py-1 text-xs transition-colors rounded"
              :class="viewMode === 'table' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('table')"
            >{{ $t('preview.text.tableMode') }}</button>
            <button
              class="px-2.5 py-1 text-xs transition-colors rounded"
              :class="viewMode === 'source' ? 'bg-accent-blue text-white' : 'text-text-secondary hover:bg-bg-hover'"
              @click="setViewMode('source')"
            >{{ $t('preview.json.sourceMode') }}</button>
          </div>

          <!-- JSON 工具：格式化 / 路径查询 / 复制 TS interfaces / 树折叠 -->
          <template v-if="fileCategory === 'json' && jsonStatus === 'valid'">
            <span class="finder-toolbar-divider"></span>
            <button
              v-if="viewMode === 'source'"
              class="h-7 px-2.5 flex items-center bg-bg-secondary/50 border border-border/50 rounded-md text-xs text-text-secondary hover:border-border hover:text-text-primary transition-colors"
              :title="$t('preview.json.formatJsonTip')"
              @click="formatJsonSource"
            >{{ $t('preview.json.formatJson') }}</button>
            <button
              class="h-7 px-2.5 flex items-center bg-bg-secondary/50 border border-border/50 rounded-md text-xs text-text-secondary hover:border-border hover:text-text-primary transition-colors"
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
            <template v-if="viewMode === 'tree'">
              <button
                class="finder-icon-button"
                :title="$t('preview.common.expandAll')"
                @click="jsonTreeRef?.expandAll()"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
              <button
                class="finder-icon-button"
                :title="$t('preview.common.collapseAll')"
                @click="jsonTreeRef?.collapseAll()"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                </svg>
              </button>
            </template>
          </template>

          <!-- JSON validity badge -->
          <span
            v-if="fileCategory === 'json' && jsonStatus !== null"
            class="text-xs px-1.5 py-0.5 rounded font-mono leading-none"
            :class="jsonStatus === 'valid' ? 'bg-green-500/15 text-green-500' : 'bg-red-500/15 text-red-400'"
          >{{ jsonStatus === 'valid' ? $t('preview.json.valid') : $t('preview.json.invalid') }}</span>
        </template>
      </TextPreviewToolbar>

        <!-- ── 过滤状态条（仅搜索激活时） ── -->
        <TextFilterStatusBar
          v-if="viewMode === 'source' && logAnalysis.hasResult.value"
          :vm="logAnalysis"
          :partial-loaded="!isFullyLoaded"
        />
      </div>

      <!-- ── Rendered Markdown ── -->
      <!-- @dragstart.prevent：从已有选区内起拖时浏览器会转为「拖拽所选文本」
           （HTML5 DnD），本应用没有文本放置目标，落空即清空选区——表现为
           「想扩选却把选区拖没了」。阻断后拖拽始终是重新选择，复制走 ⌘C。 -->
      <div
        v-if="viewMode === 'rendered'"
        class="flex-1 overflow-auto px-8 py-6 md-rendered"
        @dragstart.prevent
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
      <div v-else class="flex-1 overflow-hidden relative">
        <!-- 空文件：完整窗口态（不缩成矮条）；进入编辑后让位给编辑器 -->
        <div
          v-if="isEmptyFile && !editing"
          class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 select-none"
          data-testid="text-empty-state"
        >
          <svg class="w-10 h-10 mb-1 opacity-40" style="color: var(--finder-secondary-label)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p class="text-sm font-medium text-text-primary">{{ $t('preview.text.emptyFile') }}</p>
          <p class="text-xs text-text-tertiary">{{ $t('preview.text.emptyFileHint') }}</p>
        </div>
        <div ref="editorContainer" class="absolute inset-0" :class="{ 'text-editor-readonly': editorReadOnly }"></div>

        <!-- 0 匹配空态（非错误样式） -->
        <div
          v-if="logAnalysis.hasResult.value && logAnalysis.matchCount.value === 0"
          class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 pointer-events-auto"
          data-testid="text-no-match"
        >
          <p class="text-sm" style="color: var(--finder-secondary-label)">
            {{ $t('preview.text.noMatchTitle', { query: logAnalysis.expression.value }) }}
          </p>
          <button class="edit-secondary-btn" @click="toolbarRef?.openFindOptions()">
            {{ $t('preview.text.adjustFindOptions') }}
          </button>
        </div>

        <!-- 跳转到行（⌘L，行内浮层非模态） -->
        <div v-if="jumpVisible" class="text-jump-panel" data-testid="text-jump-panel">
          <span class="text-xs" style="color: var(--finder-secondary-label)">{{ $t('preview.text.jumpToLineTip') }}</span>
          <input
            ref="jumpInput"
            v-model="jumpInputValue"
            type="text"
            inputmode="numeric"
            :placeholder="$t('preview.text.jumpPlaceholder', { max: jumpMaxLine })"
            @keydown.enter.prevent="doJumpToLine"
            @keydown.esc.stop.prevent="jumpVisible = false"
          >
          <span v-if="jumpError" class="jump-error">{{ jumpError }}</span>
          <button class="edit-secondary-btn !h-6 !px-3" @click="doJumpToLine">{{ $t('preview.text.jumpGo') }}</button>
        </div>
      </div>

      <!-- ── 分片加载脚注（大文件渐进加载；未全量 = 只读 + 禁保存）──
           原「文件信息栏」已删（2026-08-19）：文件名/大小与工具栏元信息重复，
           保存/Diff 上移工具栏，底部仅留轻量状态（此脚注 + 过滤状态条）。 -->
      <div
        v-if="!isFullyLoaded && !loading"
        class="text-load-footer flex items-center gap-3 flex-shrink-0"
        data-testid="text-load-footer"
      >
        <span>{{ $t('preview.text.loadedProgress', { loaded: formatSize(loadedBytes), size: formatSize(props.file.size) }) }}</span>
        <span class="flex-1"></span>
        <button
          class="edit-secondary-btn !h-5 !px-2.5 !text-xs"
          :disabled="loadingMore || loadedBytes >= file.size || loadedBytes >= TEXT_ABSOLUTE_CAP"
          @click="extendLoaded(TEXT_CHUNK_BYTES)"
        >{{ $t('preview.text.loadMoreChunk') }}</button>
        <button
          class="edit-secondary-btn !h-5 !px-2.5 !text-xs"
          :disabled="loadingMore || loadedBytes >= file.size || loadedBytes >= TEXT_ABSOLUTE_CAP"
          @click="extendLoaded('all')"
        >{{ $t('preview.text.loadAll') }}</button>
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
import { useTabsStore } from '@/stores/tabs'
import type { FileInfo } from '@/types'
import { useLogAnalysis } from '@/components/preview/composables/useLogAnalysis'
import type { QuickLookControls } from '@/types/preview'
import TextPreviewToolbar from '@/components/preview/textview/TextPreviewToolbar.vue'
import TextFilterStatusBar from '@/components/preview/textview/TextFilterStatusBar.vue'
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
// NOTE: findController (Monaco 内置查找) 已按重设计移除 —— ⌘F/⌘G/⇧⌘G 统一走
// 自定义搜索框（docs/superpowers/specs/2026-08-17-text-preview-finder-redesign.md 决策②）

// ── Quick Look 阅读面主题（2026-08-19）───────────────────────────────────────
// 透明编辑器底（容器材质/画布透出，三区同属一张窗口面）+ 低对比灰色行号，
// 去行高亮描边——只读预览默认无 IDE 装饰；语法 token 色继承 vs / vs-dark。
monaco.editor.defineTheme('fma-text', {
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#00000000',
    'editorLineNumber.foreground': '#8E8E93',
    'editorLineNumber.activeForeground': '#6E6E73',
    'editor.lineHighlightBorder': '#00000000',
    'editor.lineHighlightBackground': '#00000000',
  },
})
monaco.editor.defineTheme('fma-text-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#00000000',
    'editorLineNumber.foreground': '#5B5B62',
    'editorLineNumber.activeForeground': '#A1A1A6',
    'editor.lineHighlightBorder': '#00000000',
    'editor.lineHighlightBackground': '#00000000',
  },
})

/** App 主题（data-theme on .finder-shell）优先，系统偏好兜底 */
function monacoThemeName(): 'fma-text' | 'fma-text-dark' {
  const theme = document.querySelector('.finder-shell')?.getAttribute('data-theme')
  if (theme === 'light') return 'fma-text'
  if (theme === 'dark') return 'fma-text-dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'fma-text-dark' : 'fma-text'
}

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

/** 大文件渐进加载：首片 2MB；绝对上限 64MB（未全量 = 只读 + 禁保存，防截断写回） */
const TEXT_CHUNK_BYTES = 2 * 1024 * 1024
const TEXT_ABSOLUTE_CAP = 64 * 1024 * 1024

/** Monaco 语言显示名（语法菜单 + 类型徽标共用；仅收录已注册 basic-languages） */
const LANGUAGE_DISPLAY: Record<string, string> = {
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

/** 语法菜单清单（自动检测项由工具栏另行渲染） */
const SYNTAX_LANGUAGES = Object.entries(LANGUAGE_DISPLAY).map(([id, label]) => ({ id, label }))

// ── Props / Emits ─────────────────────────────────────────────────────────────
const props = defineProps<{
  file: FileInfo
  deviceId: string
  /** 预览会话 id（关闭守卫/脏探针注册键；由 PreviewContentRouter 传入）。 */
  sessionId?: string
  /** 初始定位行号（grep 命中跳入；仅首次创建编辑器时消费一次）。 */
  initialLine?: number
  /** Quick Look 浮层模式：材质窗口内 chrome 透明、工具栏元信息收纳（头部已示）。 */
  quickLook?: boolean
  /** Quick Look 步进/关闭控件（单行合并后经工具栏右端胶囊呈现）。 */
  quickLookControls?: QuickLookControls
}>()

const tabsStore = useTabsStore()

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

// ── 编辑模式（2026-08-19 Finder Quick Look 化）───────────────────────────────
// 默认只读预览（无光标/无行高亮的干净阅读面）；工具栏「编辑」显式进入可写状态，
// Esc 退出编辑态（修改保留，⌘S 仍可保存）。分片未全量/过滤视图期间强制只读。
const editing = ref(false)

// ── 阅读区设置（⋯ 菜单 / ⌘ 快捷键驱动；会话级，不持久化） ────────────────────
const fontSize = ref(14)                    // 设计默认 14（12–18，⌘±0）
const showLineNumbers = ref(true)
const syntaxOverride = ref<string | null>(null)
const hasSelection = ref(false)

// ── 跳转到行（⌘L） ────────────────────────────────────────────────────────────
const jumpVisible = ref(false)
const jumpInputValue = ref('')
const jumpError = ref<string | null>(null)
const jumpInput = ref<HTMLInputElement | null>(null)

// ── 大文件渐进加载状态 ────────────────────────────────────────────────────────
const isFullyLoaded = ref(true)
const loadedBytes = ref(0)
const loadingMore = ref(false)
/** 全文总行数（分片扩展/过滤视图下与模型行数解耦） */
const fullLineCount = ref(0)

const toolbarRef = ref<InstanceType<typeof TextPreviewToolbar> | null>(null)

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

// 视图形态变化 → 同步编辑器只读态（编辑开关 / 分片未全量 / 过滤视图变换）。
// （须在 logAnalysis 之后注册：watch 注册即求值源，提前会触发 TDZ。）
const editorReadOnly = computed(() => !editing.value || !isFullyLoaded.value || logAnalysis.isViewTransformed.value)
watch(editorReadOnly, (readOnly) => {
  editorInstance.value?.updateOptions({ readOnly })
})

/** 空文件（source 视图且无内容）：完整窗口态而非矮条；进入编辑后隐藏。 */
const isEmptyFile = computed(() =>
  !loading.value && !hasError.value && viewMode.value === 'source' && preparedContent.value === ''
)

/** 编辑入口：进入时聚焦编辑器（空文件态同时让位）；退出时修改保留（⌘S 仍可存）。 */
function toggleEditing(): void {
  editing.value = !editing.value
  if (editing.value) {
    editorInstance.value?.focus()
  }
}

/** 保存按钮 title：被阻断原因优先，否则「保存 (⌘S)」 */
const saveBlockedReason = computed(() => {
  if (logAnalysis.isViewTransformed.value) return t('preview.text.saveBlockedTip')
  if (!isFullyLoaded.value) return t('preview.text.saveBlockedPartialTip')
  return null
})

/** 编辑入口被阻断原因（分片未全量 / 过滤视图）；null = 可进入编辑 */
const editBlockedReason = computed(() => {
  if (!isFullyLoaded.value) return t('preview.text.editBlockedTip')
  if (logAnalysis.isViewTransformed.value) return t('preview.text.editBlockedFilteredTip')
  return null
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

/** 手动语法覆盖优先（会话级），否则自动检测 */
const effectiveLanguage = computed(() => syntaxOverride.value ?? monacoLanguage.value)

const displayLanguage = computed(() => LANGUAGE_DISPLAY[monacoLanguage.value] || monacoLanguage.value)

/** 语法菜单当前值（纯文本本地化，其余用语言显示名） */
const syntaxLabel = computed(() => {
  const lang = effectiveLanguage.value
  if (lang === 'plaintext') return t('preview.text.syntaxPlain')
  return LANGUAGE_DISPLAY[lang] || lang
})

// ── 工具栏左段元信息 ──────────────────────────────────────────────────────────
const metaDetail = computed(() => {
  if (viewMode.value === 'source') {
    return t('preview.text.metaLinesSize', { n: fullLineCount.value || lineCount.value, size: formatSize(props.file.size) })
  }
  if (viewMode.value === 'table') {
    return t('preview.text.csvRowsCols', { rows: csvRows.value.length + (csvTruncated.value ? '+' : ''), cols: csvHeaders.value.length })
  }
  if (viewMode.value === 'tree' && fileCategory.value === 'json') {
    return t('preview.json.nodeCount', jsonNodeCount.value)
  }
  return null
})

/** 单行低层级元信息：类型 · 统计（如 "Plain Text · 54 行 · 2.1 KB"）。
 *  Quick Look 模式整体隐藏——改为左段文件名 + "大小 · i / n"（见 qlInfo）。 */
const metaInfo = computed(() => {
  if (props.quickLook) return null
  const parts = [displayLanguage.value, metaDetail.value].filter((s): s is string => !!s)
  return parts.length > 0 ? parts.join(' · ') : null
})

/** Quick Look 单行合并（2026-08-19）：工具栏左段文件信息（名 + 大小 · 序号） */
const qlInfo = computed(() => {
  if (!props.quickLook) return null
  const parts = [formatSize(props.file.size)]
  const controls = props.quickLookControls
  if (controls && controls.total > 1) parts.push(`${controls.index + 1} / ${controls.total}`)
  return { name: props.file.name, meta: parts.join(' · ') }
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

  editorInstance.value = monaco.editor.create(editorContainer.value, {
    value: content,
    language: effectiveLanguage.value,
    theme: monacoThemeName(),
    automaticLayout: true,
    minimap: { enabled: showMinimap.value },
    wordWrap: wordWrap.value ? 'on' : 'off',
    scrollBeyondLastLine: false,
    // Quick Look 阅读面：无行高亮（不渲染表格感）；行号对比度由主题降灰
    renderLineHighlight: 'none',
    lineNumbers: showLineNumbers.value ? 'on' : 'off',
    glyphMargin: false,
    folding: true,
    foldingHighlight: true,
    // 顶部对齐 + 24px 上下留白（内容少时不压缩、不拉伸行高）
    padding: { top: 24, bottom: 24 },
    overviewRulerLanes: 0,
    // 设计默认：SF Mono 栈 · 14px · 行高 ≈ 字号×1.6（22–24px 区间）
    fontSize: fontSize.value,
    lineHeight: Math.round(fontSize.value * 1.6),
    fontFamily: "'SF Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, 'Courier New', monospace",
    // 默认只读预览（编辑开关/分片未全量/过滤视图 → editorReadOnly 收口）
    readOnly: editorReadOnly.value,
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
    const modelLineCount = editorInstance.value.getModel()?.getLineCount() ?? 0
    const target = Math.min(lineNumber, Math.max(modelLineCount, 1))
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

  // Register editor-scoped shortcuts (window-level fallbacks live in the
  // useKeyInterceptor below — they cover focus outside the editor)
  editorInstance.value.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    saveFile()
  })
  editorInstance.value.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
    toolbarRef.value?.focusSearch()
  })
  editorInstance.value.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => {
    logAnalysis.navigateHit(1)
  })
  editorInstance.value.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => {
    logAnalysis.navigateHit(-1)
  })
  editorInstance.value.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, () => {
    openJumpPanel()
  })
  editorInstance.value.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal, () => {
    setFontSize(fontSize.value + 1)
  })
  editorInstance.value.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus, () => {
    setFontSize(fontSize.value - 1)
  })
  editorInstance.value.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0, () => {
    setFontSize(14)
  })

  // A 视图点击路由：gap 省略块 / 匹配行 → 定位到 B 全文视图
  editorInstance.value.onMouseDown(e => {
    logAnalysis.handleEditorMouseDown(e.target.position?.lineNumber)
  })

  // 选区跟踪（复制/导出菜单的上下文项）
  editorInstance.value.onDidChangeCursorSelection(e => {
    hasSelection.value = !e.selection.isEmpty()
  })

  // Lazy viewport coloring on scroll
  editorInstance.value.onDidScrollChange(() => {
    logAnalysis.notifyViewportChanged()
  })

  lineCount.value = model?.getLineCount() ?? 0
  log(`Editor created: lang=${effectiveLanguage.value} lines=${lineCount.value}`)
  logAnalysis.onEditorReady()
}

function destroyEditor() {
  if (editorInstance.value) {
    editorInstance.value.getModel()?.dispose()
    editorInstance.value.dispose()
    editorInstance.value = null
  }
}

// ── File loading（渐进分片：首片 2MB，脚注续载，未全量只读） ────────────────────
function base64ToText(base64: string): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

/** 首次载入：小文件整读；大文件首片 2MB（readChunk，避免整读卡顿） */
async function fetchInitialText(): Promise<string> {
  if (props.file.size <= TEXT_CHUNK_BYTES) {
    loadedBytes.value = props.file.size
    isFullyLoaded.value = true
    return base64ToText(await window.fileman.readFile(props.deviceId, props.file.path))
  }
  const end = Math.min(props.file.size, TEXT_CHUNK_BYTES, TEXT_ABSOLUTE_CAP)
  loadedBytes.value = end
  isFullyLoaded.value = end >= props.file.size
  const chunk = await window.fileman.readChunk(props.deviceId, props.file.path, 0, end)
  return base64ToText(chunk.base64)
}

/**
 * 应用已解码文本（首载 initial=true / 续载 extend）：类别处理 + 状态落位。
 * 续载时保持用户当前 viewMode 与滚动位置；过滤激活则重跑过滤扩大范围。
 */
async function applyLoadedText(raw: string, opts: { initial: boolean }): Promise<void> {
  const category = fileCategory.value
  let editorContent = raw
  wordWrap.value = category === 'log'

  if (category === 'json') {
    editorContent = processJson(raw)
  } else if (category === 'markdown') {
    await processMarkdown(raw)
  } else if (category === 'csv') {
    processCsv(raw)
  }

  preparedContent.value = editorContent
  originalContent.value = editorContent
  fullLineCount.value = editorContent.split('\n').length

  if (opts.initial) {
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
    return
  }

  // ── 续载：内容扩展（分片期间只读 ⇒ 无编辑可被覆盖） ──
  isModified.value = false
  if (viewMode.value === 'source') {
    const editor = editorInstance.value
    if (logAnalysis.hasResult.value) {
      // 过滤激活：扩大已加载范围后重跑（状态条会追加「仅已加载范围」标注）
      await logAnalysis.applyFilter(false)
    } else if (editor) {
      const scrollTop = editor.getScrollTop()
      const model = editor.getModel()
      if (model) model.setValue(editorContent)
      editor.setScrollTop(scrollTop)
      lineCount.value = model?.getLineCount() ?? 0
    }
  } else if (viewMode.value === 'tree' && parsedJsonData.value !== null) {
    await nextTick()
    if (jsonTreeRef.value) {
      jsonTreeRef.value.data = parsedJsonData.value
    }
  }
}

/** 续载更多（+2MB 或全部）；从 0 重读到新边界（规避 UTF-8 多字节被分片截断） */
async function extendLoaded(target: number | 'all'): Promise<void> {
  if (loadingMore.value || isFullyLoaded.value || loading.value) return
  loadingMore.value = true
  try {
    const end = target === 'all'
      ? Math.min(props.file.size, TEXT_ABSOLUTE_CAP)
      : Math.min(props.file.size, loadedBytes.value + target, TEXT_ABSOLUTE_CAP)
    if (end <= loadedBytes.value) return
    const chunk = await window.fileman.readChunk(props.deviceId, props.file.path, 0, end)
    loadedBytes.value = end
    isFullyLoaded.value = end >= props.file.size
    await applyLoadedText(base64ToText(chunk.base64), { initial: false })
    log('extendLoaded: now %d bytes, fullyLoaded=%s', end, isFullyLoaded.value)
  } catch (err) {
    log('Error extending file:', err)
    errorMessage.value = err instanceof Error ? err.message : t('preview.common.unknownError')
  } finally {
    loadingMore.value = false
  }
}

async function loadFile() {
  loading.value = true
  hasError.value = false
  errorMessage.value = ''
  jsonStatus.value = null
  csvHeaders.value = []
  csvRows.value = []
  wordWrap.value = false
  editing.value = false
  // Reset log analysis session (filter state, hit navigation)
  logAnalysis.reset()
  destroyEditor()

  try {
    log('Loading:', props.file.name, 'device:', props.deviceId)
    const raw = await fetchInitialText()
    await applyLoadedText(raw, { initial: true })
  } catch (err) {
    log('Error loading file:', err)
    loading.value = false
    hasError.value = true
    errorMessage.value = err instanceof Error ? err.message : t('preview.common.unknownError')
  }
}

// 只读总闸已上移至 editorReadOnly（2026-08-19）：编辑开关 OR 过滤视图 OR 未全量 ⇒ 只读。
// （filterView.restore 会无条件解锁，editorReadOnly watch 是唯一收口。）

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

function toggleLineNumbers() {
  showLineNumbers.value = !showLineNumbers.value
  // 过滤视图下行号由 filterView 的回调管理，仅在全文态切开关
  if (!logAnalysis.isViewTransformed.value) {
    editorInstance.value?.updateOptions({ lineNumbers: showLineNumbers.value ? 'on' : 'off' })
  }
}

function setFontSize(size: number) {
  const clamped = Math.min(18, Math.max(12, Math.round(size)))
  if (clamped === fontSize.value) return
  fontSize.value = clamped
  editorInstance.value?.updateOptions({ fontSize: clamped, lineHeight: Math.round(clamped * 1.6) })
}

function setSyntaxOverride(id: string | null) {
  syntaxOverride.value = id
  const model = editorInstance.value?.getModel()
  if (model) monaco.editor.setModelLanguage(model, id ?? monacoLanguage.value)
}

// ── 复制 / 导出 ───────────────────────────────────────────────────────────────
async function copyContent(): Promise<void> {
  const editor = editorInstance.value
  const selection = editor?.getSelection()
  if (editor && selection && !selection.isEmpty()) {
    const text = editor.getModel()?.getValueInRange(selection) ?? ''
    if (text !== '') {
      await copyToClipboard(text)
      return
    }
  }
  await copyToClipboard(preparedContent.value)
}

function onExportMenu(kind: 'full' | 'matches' | 'selection'): void {
  if (kind === 'matches') {
    void logAnalysis.exportFiltered()
    return
  }
  const editor = editorInstance.value
  const selection = editor?.getSelection()
  const text = kind === 'selection' && editor && selection && !selection.isEmpty()
    ? (editor.getModel()?.getValueInRange(selection) ?? '')
    : preparedContent.value
  const suffix = kind === 'selection' ? '.selection' : '.copy'
  void writeExportFile(text, suffix)
}

/** 导出副本：<去扩展名基名><suffix><扩展名>，冲突递增 .2/.3…（不覆盖） */
async function writeExportFile(text: string, suffix: string): Promise<void> {
  if (text === '') return
  const path = props.file.path
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const dot = path.lastIndexOf('.')
  const hasExt = dot > slash
  const base = hasExt ? path.slice(0, dot) : path
  const ext = hasExt ? path.slice(dot) : '.txt'

  let candidate = `${base}${suffix}${ext}`
  for (let n = 2; await window.fileman.exists(props.deviceId, candidate); n++) {
    candidate = `${base}${suffix}.${n}${ext}`
  }

  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  await window.fileman.writeFile(props.deviceId, candidate, btoa(binary))
  log('Exported to:', candidate)
}

// ── 跳转到行（⌘L 行内浮层） ────────────────────────────────────────────────────
const jumpMaxLine = computed(() => {
  if (logAnalysis.hasResult.value) return Math.max(fullLineCount.value, 1)
  return editorInstance.value?.getModel()?.getLineCount() ?? Math.max(fullLineCount.value, 1)
})

function openJumpPanel(): void {
  if (viewMode.value !== 'source') return
  jumpError.value = null
  jumpVisible.value = true
  void nextTick(() => jumpInput.value?.focus())
}

let pulseCollection: monaco.editor.IEditorDecorationsCollection | null = null
let pulseTimer: ReturnType<typeof setTimeout> | null = null

/** 定位脉冲：目标行 0.8s 高亮（fma-locate-pulse 自带 reduced-motion 降级） */
function pulseLine(lineNumber: number): void {
  const editor = editorInstance.value
  if (editor === null) return
  pulseCollection?.clear()
  pulseCollection = editor.createDecorationsCollection([{
    range: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 },
    options: { isWholeLine: true, className: 'fma-locate-pulse' }
  }])
  if (pulseTimer !== null) clearTimeout(pulseTimer)
  pulseTimer = setTimeout(() => {
    pulseCollection?.clear()
    pulseTimer = null
  }, 900)
}

function doJumpToLine(): void {
  const n = Number.parseInt(jumpInputValue.value, 10)
  const max = jumpMaxLine.value
  if (!Number.isInteger(n) || n < 1 || n > max) {
    jumpError.value = t('preview.text.jumpInvalid', { max })
    return
  }
  jumpVisible.value = false
  if (logAnalysis.hasResult.value) {
    // 搜索激活：切到 B 全文高亮视图并定位
    logAnalysis.locateInFullView(n)
    return
  }
  const editor = editorInstance.value
  if (editor) {
    editor.revealLineInCenter(n)
    pulseLine(n)
  }
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

// ── 未保存关闭守卫 + 脏探针（此前未保存修改在关标签时静默丢失） ────────────────

const closeConfirm = ref(false)
/** 放弃修改后置真：守卫放行一次，完成关闭。 */
const closeArmed = ref(false)
let unregisterTextGuard: (() => void) | null = null
let unregisterTextProbe: (() => void) | null = null

if (props.sessionId) {
  onMounted(() => {
    unregisterTextGuard = tabsStore.registerCloseGuard(props.sessionId!, () => {
      if (closeArmed.value || !isModified.value) return true
      closeConfirm.value = true // 阻止关闭，就地请求用户决策
      return false
    })
    unregisterTextProbe = tabsStore.registerDirtyProbe(props.sessionId!, () => isModified.value)
  })
  onUnmounted(() => {
    unregisterTextGuard?.()
    unregisterTextProbe?.()
    unregisterTextGuard = null
    unregisterTextProbe = null
  })
}

/** 确认条：保存并关闭（saveFile 成功会复位 isModified）。 */
async function saveAndClose(): Promise<void> {
  await saveFile()
  if (!isModified.value) {
    closeConfirm.value = false
    if (props.sessionId) tabsStore.closePreviewSession(props.sessionId)
  }
  // 保存失败/被过滤视图阻断：确认条保留，原因已由错误态/日志呈现
}

/** 确认条：放弃修改并关闭。 */
function discardAndClose(): void {
  closeArmed.value = true
  closeConfirm.value = false
  if (props.sessionId) tabsStore.closePreviewSession(props.sessionId)
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

// Intercept keys in capture phase so parent (App.vue) bubble-phase handlers never
// see them. Returning `true` signals the event is consumed.
// Esc 链（LIFO 内本组件优先于 App）：diff 弹窗 → 方案编辑器 → 跳转浮层 → 清除搜索。
useKeyInterceptor((e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (showDiffModal.value) {
      closeDiff()
      return true // consumed — blocks parent ESC handlers
    }
    if (schemeEditorVisible.value) {
      schemeEditorVisible.value = false
      return true
    }
    if (jumpVisible.value) {
      jumpVisible.value = false
      return true
    }
    if (toolbarRef.value?.handleEscape()) {
      // 工具栏菜单/窄窗搜索浮层 → 先收起
      return true
    }
    if (logAnalysis.hasResult.value || logAnalysis.expression.value !== '') {
      // 两段式 Esc：清除查询并立即恢复全文（搜索框随之收纳）
      logAnalysis.clearFilter()
      toolbarRef.value?.collapseSearch()
      return true
    }
    if (editing.value) {
      // 退出编辑态（修改保留，⌘S 仍可保存）
      editing.value = false
      return true
    }
    return undefined
  }

  // ⌘F / ⌘G / ⇧⌘G / ⌘L / ⌘±0 —— 编辑器外的全局兜底（编辑器内由 addCommand 接管；
  // capture 拦截先于 Monaco 键绑定服务，两条路径行为一致）
  if ((e.metaKey || e.ctrlKey) && viewMode.value === 'source' && !showDiffModal.value && !schemeEditorVisible.value) {
    const key = e.key.toLowerCase()
    if (key === 'f') {
      toolbarRef.value?.focusSearch()
      return true
    }
    if (key === 'g') {
      logAnalysis.navigateHit(e.shiftKey ? -1 : 1)
      return true
    }
    if (key === 'l') {
      openJumpPanel()
      return true
    }
    if (key === '+' || key === '=') {
      setFontSize(fontSize.value + 1)
      return true
    }
    if (key === '-') {
      setFontSize(fontSize.value - 1)
      return true
    }
    if (key === '0') {
      setFontSize(14)
      return true
    }
  }
  return undefined
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
