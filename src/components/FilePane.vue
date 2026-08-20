<template>
  <div
    v-if="pane"
    class="finder-pane file-pane h-full flex flex-col overflow-hidden bg-bg-primary"
    @mousedown.capture="handlePaneMouseDown"
    @dragenter.prevent="handleDragEnter"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <!-- Toolbar -->
    <!-- container-type 只放在工具栏容器上：若放在 .file-pane 上，containment 会让
         pane 成为 position:fixed 后代（右键菜单、模态弹窗）的包含块，
         导致 fixed 定位相对 pane 而非视口，菜单位置随侧边栏宽度偏移 -->
    <div class="file-pane-toolbar-container">
      <!-- 工具栏条透明：导航/标题/视图/排序/操作/搜索各自成为独立浮动胶囊
           （.finder-toolbar-capsule），分组感由胶囊材质+阴影+留白承担 -->
      <div class="finder-pane-toolbar file-pane-toolbar min-w-0 flex items-center">
      <!-- 导航胶囊：后退/前进/上级直达（最近访问与前往文件夹已在全局菜单与 ⌘⇧P，
           不在工具栏重复） -->
      <FinderToolbarGroup capsule class="file-pane-toolbar-nav flex-shrink-0">
        <FinderToolbarButton
          variant="pill"
          :disabled="pane.historyIndex <= 0"
          @click="tabsStore.goBack(paneId)"
          :label="$t('filePane.toolbar.goBack')"
        >
          <FinderIcon name="arrowLeft" />
        </FinderToolbarButton>
        <FinderToolbarButton
          variant="pill"
          :disabled="pane.historyIndex >= pane.history.length - 1"
          @click="tabsStore.goForward(paneId)"
          :label="$t('filePane.toolbar.goForward')"
        >
          <FinderIcon name="arrowRight" />
        </FinderToolbarButton>
        <FinderToolbarButton
          variant="pill"
          @click="tabsStore.goUp(paneId)"
          :label="$t('filePane.toolbar.goUp')"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
        </FinderToolbarButton>
      </FinderToolbarGroup>

      <!-- 当前位置：浏览态 = 低对比父级分段 + 当前目录名主标题（无边框无底色，
           完整路径经标题 tooltip / 分段点击 / 尾部铅笔进入输入态）；
           输入态 = 轻量输入材质（粘贴路径回车前往） -->
      <div class="file-pane-toolbar-breadcrumb min-w-0 flex-1 flex items-center px-1">
        <div
          ref="breadcrumbPillRef"
          class="file-pane-toolbar-breadcrumb-content relative min-w-0 w-full flex items-center gap-1 px-2 py-1 transition-shadow"
          :class="breadcrumbEditing ? ['finder-path-field-editing', breadcrumbError ? 'is-error' : ''] : []"
        >
          <!-- 浏览态：长路径中段折叠成 …（Finder 式），首尾段与尾部按钮常驻可见 -->
          <template v-if="!breadcrumbEditing">
            <div ref="breadcrumbMeasureRef" class="min-w-0 flex-1 flex items-center gap-1 overflow-hidden">
              <!-- ZIP badge shown when browsing inside an archive -->
              <span
                v-if="isInsideZip"
                class="flex-shrink-0 text-[10px] font-bold px-1 py-0.5 rounded bg-accent-orange/20 text-accent-orange dark:text-orange-300 border border-accent-orange/30 mr-1"
              >ZIP</span>
              <!-- Git 分支 chip（本地仓库目录，只读） -->
              <span
                v-if="gitBranchInfo"
                class="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent-indigo/15 text-accent-indigo border border-accent-indigo/30 mr-1 max-w-40 truncate"
                :title="gitBranchInfo.title"
              >
                <svg class="w-2.5 h-2.5 inline-block mr-0.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 3v12m0 0a3 3 0 100 6 3 3 0 000-6zm12-6a3 3 0 100-6 3 3 0 000 6zm0 0a9 9 0 01-9 9" />
                </svg>{{ gitBranchInfo.label }}
              </span>
              <template v-for="item in visibleBreadcrumb" :key="item.key">
                <button
                  v-if="item.kind === 'seg'"
                  class="max-w-32 truncate transition-colors font-medium flex-shrink-0"
                  :class="[
                    isZipBoundarySegment(item.index)
                      ? 'text-orange-400 hover:text-orange-300 text-[13px]'
                      : item.index === pathSegments.length - 1
                        ? 'text-text-primary text-[15px] font-semibold'
                        : 'text-text-secondary hover:text-accent-blue text-[13px]'
                  ]"
                  :title="item.index === pathSegments.length - 1 ? pane.path : item.label"
                  @click="navigateToSegment(item.index)"
                >
                  {{ item.label }}
                </button>
                <!-- 中段折叠省略号：点开隐藏层级菜单（.stop 防开菜单的冒泡 click 立即关掉它） -->
                <button
                  v-else
                  class="flex-shrink-0 px-1 text-[13px] font-medium leading-none text-text-secondary hover:text-text-primary"
                  :title="$t('filePane.toolbar.hiddenPathSegments')"
                  :aria-label="$t('filePane.toolbar.hiddenPathSegments')"
                  aria-haspopup="menu"
                  :aria-expanded="breadcrumbMenu.visible"
                  @click.stop="openBreadcrumbEllipsisMenu"
                >…</button>
                <span v-if="item.showSeparator" class="text-text-tertiary mx-0.5 flex-shrink-0">/</span>
              </template>
            </div>
            <!-- 尾部按钮：切换为路径输入框 -->
            <button
              class="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-bg-hover"
              :title="$t('filePane.toolbar.editPath')"
              :aria-label="$t('filePane.toolbar.editPath')"
              @click="startBreadcrumbEdit"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 20h4L19 9a2.5 2.5 0 10-3.5-3.5L4 16.5V20z"/></svg>
            </button>
          </template>
          <!-- 输入态：粘贴地址回车前往（先校验有效性，失败红框+气泡提示） -->
          <template v-else>
            <input
              ref="breadcrumbInputRef"
              v-model="breadcrumbInput"
              class="min-w-0 flex-1 bg-transparent text-[13px] font-mono text-text-primary outline-none"
              :placeholder="$t('filePane.toolbar.editPathPlaceholder')"
              spellcheck="false"
              @keydown.enter="onBreadcrumbEnter"
              @keydown.escape.stop.prevent="cancelBreadcrumbEdit"
              @blur="onBreadcrumbInputBlur"
            />
            <!-- mousedown.prevent：避免点击瞬间失焦触发「失焦即放弃」 -->
            <button
              class="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:text-accent-blue hover:bg-bg-hover"
              :title="$t('filePane.goToDialog.go')"
              :aria-label="$t('filePane.goToDialog.go')"
              @mousedown.prevent
              @click="commitBreadcrumbEdit"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m0 0l-6-6m6 6l-6 6"/></svg>
            </button>
            <div
              v-if="breadcrumbError"
              class="breadcrumb-path-error absolute left-0 top-full mt-1 z-50 max-w-full px-2.5 py-1 text-xs text-accent-red"
              role="alert"
            >{{ breadcrumbError }}</div>
          </template>
        </div>
      </div>

      <!-- 视图胶囊：列表/图标/分栏（激活态为 Finder 式浅灰）+ 双面板切换 -->
      <FinderToolbarGroup capsule class="file-pane-toolbar-view flex-shrink-0">
        <FinderToolbarButton
          v-for="mode in viewModes"
          :key="mode.value"
          variant="segment"
          :active="pane.viewMode === mode.value"
          :label="mode.value === 'grid' ? $t('filePane.view.gridHint', { label: mode.label }) : mode.label"
          @click="tabsStore.setViewMode(paneId, mode.value)"
          @contextmenu.prevent="onViewButtonContextMenu(mode.value, $event)"
        >
          <component :is="mode.icon" class="w-3.5 h-3.5" />
        </FinderToolbarButton>
        <!-- Dual Pane Toggle：开启=克隆当前路径出第二面板；已开启=点击收起 -->
        <FinderToolbarButton
          variant="segment"
          class="file-pane-toolbar-split flex-shrink-0"
          :active-quiet="isDualPane"
          :label="isDualPane ? $t('filePane.toolbar.closeDualPane') : $t('filePane.toolbar.openDualPane')"
          @click="toggleDualPane"
        >
          <DualPaneIcon class="w-4 h-4" />
        </FinderToolbarButton>
      </FinderToolbarGroup>

      <!-- 排序胶囊：当前排序字段文字 + 下拉菜单（字段/方向/文件夹置顶） -->
      <FinderToolbarGroup capsule class="file-pane-toolbar-sort flex-shrink-0">
        <FinderToolbarButton
          variant="pill"
          :open="sortMenu.visible"
          :label="$t('filePane.toolbar.sortMenu')"
          aria-haspopup="menu"
          :aria-expanded="sortMenu.visible"
          @click.stop="toggleSortMenu"
        >
          <FinderIcon name="arrowUpDown" />
          <span class="file-pane-toolbar-sort-label">{{ sortFieldLabel }}</span>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:10px;height:10px"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 9l6 6 6-6"/></svg>
        </FinderToolbarButton>
      </FinderToolbarGroup>

      <!-- 操作胶囊：分享/标签常用直达 + 更多菜单收纳低频操作 -->
      <FinderToolbarGroup capsule class="file-pane-toolbar-actions flex-shrink-0">
        <FinderToolbarButton
          variant="pill"
          class="file-pane-toolbar-share"
          :label="$t('filePane.toolbar.copyCurrentPath')"
          @click="copyCurrentPath"
        >
          <FinderIcon name="share" />
        </FinderToolbarButton>
        <FinderToolbarButton
          variant="pill"
          class="file-pane-toolbar-tags"
          :disabled="!pane?.selectedFiles.length"
          :label="$t('filePane.toolbar.editTags')"
          @click="editSelectedTags"
        >
          <FinderIcon name="tags" />
        </FinderToolbarButton>
        <FinderToolbarButton
          variant="pill"
          :open="actionsMenu.visible"
          :label="$t('filePane.toolbar.moreActions')"
          aria-haspopup="menu"
          :aria-expanded="actionsMenu.visible"
          @click.stop="toggleActionsMenu"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-width="2.5" d="M5 12h.01M12 12h.01M19 12h.01"/></svg>
        </FinderToolbarButton>
      </FinderToolbarGroup>

      <!-- 搜索胶囊（右侧宽胶囊，聚焦克制的系统蓝焦点环；含历史下拉） -->
      <div ref="searchBoxRef" class="file-pane-toolbar-search relative flex-shrink-0">
        <FinderSearchField
          ref="searchInputRef"
          v-model="searchQuery"
          capsule
          class="file-pane-toolbar-search-field"
          :placeholder="$t('filePane.toolbar.searchPlaceholder')"
          @focus="searchHistoryOpen = true"
          @blur="searchHistoryOpen = false"
          @enter="commitSearch"
          @escape="clearSearch"
        >
          <template #leading>
            <FinderIcon name="search" />
          </template>
          <template #trailing>
            <button
              v-if="searchQuery"
              class="flex h-4 w-4 items-center justify-center rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-hover"
              :title="$t('filePane.toolbar.clearSearch')"
              :aria-label="$t('filePane.toolbar.clearSearch')"
              @mousedown.prevent
              @click="clearSearch"
            >
              <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </template>
        </FinderSearchField>
        <div
          v-if="searchHistoryOpen && filteredSearchHistory.length > 0"
          class="search-history-menu absolute right-0 top-10 z-50 max-h-64 w-64 overflow-y-auto py-1.5"
          role="menu"
          :aria-label="$t('filePane.toolbar.searchHistory')"
        >
          <div class="flex items-center justify-between px-3 py-1">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">{{ $t('filePane.toolbar.history') }}</span>
            <button
              class="text-[10px] text-text-secondary hover:text-accent-red"
              :title="$t('filePane.toolbar.clearHistory')"
              @mousedown.prevent="browserStore.clearSearchHistory()"
            >{{ $t('filePane.toolbar.clear') }}</button>
          </div>
          <button
            v-for="item in filteredSearchHistory"
            :key="item"
            class="group flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent-blue"
            role="menuitem"
            @mousedown.prevent="applySearchHistory(item)"
          >
            <svg class="w-3.5 h-3.5 flex-shrink-0 text-text-tertiary group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span class="truncate text-[13px] text-text-primary group-hover:text-white">{{ item }}</span>
          </button>
        </div>
      </div>
      </div>
    </div>

    <!-- Main Content Area with File List and Inline Preview -->
    <div class="flex-1 flex overflow-hidden relative">
      <!-- 拖拽「落区」高亮：内容区圆角薄纱 + 内侧描边，与文件夹行高亮同一视觉语言；
           纯浮层（pointer-events-none），不参与布局、不拦截拖拽事件 -->
      <Transition name="drop-zone-fade">
        <div v-if="isDropTarget" class="pane-drop-zone pointer-events-none absolute inset-1.5 z-[5] rounded-xl"></div>
      </Transition>
      <!-- File List -->
      <FileList
        :key="directoryLoadKey"
        class="flex-1 min-w-0"
        :pane-id="paneId"
        :device-id="pane.deviceId"
        :path="pane.path"
        :view-mode="pane.viewMode"
        :grid-size="pane.gridSize"
        :selected-files="pane.selectedFiles"
        :reveal-path="revealArrivedPath"
        :search-query="searchQuery"
        :recursive-search="browserState.recursiveSearch"
        :sort="browserState.sort"
        @select="handleSelect"
        @navigate="handleNavigate"
        @preview="handlePreview"
        @operation="handleOperation"
        @loaded="handleFilesLoaded"
        @sort="browserStore.setSort(paneId, $event)"
      />

      <!-- Inline Preview Panel：开启时始终显示，选中文件夹时展示文件夹信息 -->
      <template v-if="inlinePreviewEnabled">
        <!-- Resize Handle -->
        <div
          class="w-1 bg-border hover:bg-accent-blue cursor-col-resize flex-shrink-0 transition-colors"
          :class="{ 'bg-accent-blue': isResizing }"
          @mousedown="startResize"
        ></div>
        <InlinePreview
          :file="inlinePreviewFile"
          :device-id="pane.deviceId"
          class="border-l border-border flex-shrink-0"
          :style="{ width: previewWidth + 'px' }"
          @close="closeInlinePreview"
        />
      </template>
    </div>

    <!-- Grid Size Menu (right-click on grid view button)：复用 NSMenu（§11），
         当前规格以 check 图标落在图标列（radio 语义），键盘 ↑↓/Enter/Esc 免费获得 -->
    <FinderContextMenu
      v-if="gridSizeMenu.visible"
      :items="gridSizeMenuItems"
      :x="gridSizeMenu.x"
      :y="gridSizeMenu.y"
      @select="onGridSizeMenuSelect"
      @close="closeGridSizeMenu"
    />

    <!-- Breadcrumb collapsed-segments menu：fixed 浮层须置于工具栏容器之外
         （container-type 的 containment 会劫持 fixed 后代的定位基准） -->
    <FinderContextMenu
      v-if="breadcrumbMenu.visible"
      :items="hiddenBreadcrumbSegments"
      :x="breadcrumbMenu.x"
      :y="breadcrumbMenu.y"
      @select="onBreadcrumbMenuSelect"
      @close="breadcrumbMenu.visible = false"
    />

    <!-- 排序菜单、操作更多菜单：fixed NSMenu 浮层须置于工具栏容器之外
         （container-type 的 containment 会劫持 fixed 后代的定位基准） -->
    <FinderContextMenu
      v-if="sortMenu.visible"
      :items="sortMenuItems"
      :x="sortMenu.x"
      :y="sortMenu.y"
      @select="onSortMenuSelect"
      @close="sortMenu.visible = false"
    />
    <FinderContextMenu
      v-if="actionsMenu.visible"
      :items="actionsMenuItems"
      :x="actionsMenu.x"
      :y="actionsMenu.y"
      @select="onActionsMenuSelect"
      @close="actionsMenu.visible = false"
    />

    <!-- Operation Dialog -->
    <div v-if="createDialog.visible" class="fixed inset-0 z-modal flex items-center justify-center bg-black/50 animate-fade-in" @click.self="closeCreateDialog">
      <form class="finder-sheet p-4" :class="createDialog.source === 'clipboard' ? 'w-96' : 'w-80'" role="dialog" :aria-label="createDialog.kind === 'file' ? $t('filePane.createDialog.fileAria') : $t('filePane.createDialog.folderAria')" @submit.prevent="confirmCreateDialog">
        <h3 class="mb-1 text-lg font-medium text-text-primary">{{ createDialog.source === 'clipboard' ? $t('filePane.createDialog.clipboardTitle') : (createDialog.kind === 'file' ? $t('filePane.toolbar.newFile') : $t('filePane.toolbar.newFolder')) }}</h3>
        <p class="mb-4 text-sm text-text-tertiary">{{ $t('filePane.createDialog.createdIn', { path: pane?.path || '/' }) }}</p>
        <!-- 剪贴板内容预览：文本前 200 字符（截断加 …）/ 320px 缩略图 -->
        <pre v-if="createDialog.source === 'clipboard' && createDialog.clipKind === 'text'" class="mb-3 max-h-28 overflow-hidden whitespace-pre-wrap break-all rounded border border-border bg-bg-tertiary px-2 py-1.5 font-mono text-xs leading-relaxed text-text-secondary">{{ createDialog.previewText }}<span v-if="createDialog.previewTruncated" class="text-text-tertiary">…</span></pre>
        <img v-else-if="createDialog.source === 'clipboard' && createDialog.previewDataUrl" :src="createDialog.previewDataUrl" :alt="$t('filePane.createDialog.clipboardTitle')" class="mb-3 max-h-40 rounded border border-border bg-bg-tertiary object-contain" />
        <input ref="createNameInputRef" v-model="createDialog.name" class="h-9 w-full rounded border border-border bg-bg-tertiary px-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none" :placeholder="createDialog.kind === 'file' ? 'example.txt' : $t('filePane.createDialog.folderPlaceholder')" @input="createDialog.error = ''" @keydown.escape.prevent="closeCreateDialog" />
        <p v-if="createDialog.error" class="mt-2 text-xs text-accent-red">{{ createDialog.error }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="finder-btn-secondary" @click="closeCreateDialog">{{ $t('common.cancel') }}</button>
          <button type="submit" class="finder-btn-primary">{{ $t('filePane.createDialog.create') }}</button>
        </div>
      </form>
    </div>
    <!-- Go to Folder Dialog (⇧⌘G) -->
    <div v-if="goToDialog.visible" class="fixed inset-0 z-modal flex items-center justify-center bg-black/50 animate-fade-in" @click.self="closeGoToDialog">
      <form class="finder-sheet w-96 p-4" role="dialog" :aria-label="$t('filePane.goToDialog.title')" @submit.prevent="confirmGoToDialog">
        <h3 class="mb-1 text-lg font-medium text-text-primary">{{ $t('filePane.goToDialog.title') }}</h3>
        <p class="mb-4 text-sm text-text-tertiary">{{ $t('filePane.goToDialog.desc', { device: currentDeviceName || $t('filePane.goToDialog.thisDevice') }) }}</p>
        <input ref="goToNameInputRef" v-model="goToDialog.path" class="h-9 w-full rounded border border-border bg-bg-tertiary px-2 font-mono text-sm text-text-primary focus:border-accent-blue focus:outline-none" placeholder="/usr/local" @input="goToDialog.error = ''" @keydown.escape.prevent="closeGoToDialog" />
        <p v-if="goToDialog.error" class="mt-2 text-xs text-accent-red">{{ goToDialog.error }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="finder-btn-secondary" @click="closeGoToDialog">{{ $t('common.cancel') }}</button>
          <button type="submit" class="finder-btn-primary">{{ $t('filePane.goToDialog.go') }}</button>
        </div>
      </form>
    </div>
    <RenameDialog
      v-if="renameDialog.visible"
      :file-path="renameDialog.filePath"
      @close="renameDialog.visible = false"
      @confirm="doRename"
    />
    <BatchRenameDialog
      v-if="batchRenameDialog.visible"
      :files="batchRenameDialog.files"
      @close="batchRenameDialog.visible = false"
      @confirm="confirmBatchRename"
    />
    <ImageConvertDialog
      v-if="imageConvertDialog.visible"
      :files="imageConvertDialog.files"
      @close="imageConvertDialog.visible = false"
      @confirm="confirmImageConvert"
    />
    <Archive7zDialog
      v-if="archive7zDialog.visible"
      :default-name="archive7zDialog.defaultName"
      @close="archive7zDialog.visible = false"
      @confirm="confirmArchive7z"
    />
    <!-- 解压加密档密码框：错密码/缺密码时出现，确定后带密码重试 -->
    <div v-if="extractPasswordDialog.visible" class="fixed inset-0 z-[80] flex items-center justify-center bg-black/45" @click.self="extractPasswordDialog.visible = false">
      <form class="finder-sheet w-[380px] flex flex-col p-5" @submit.prevent="confirmExtractPassword">
        <h2 class="text-base font-semibold">{{ t('filePane.extractPasswordTitle', { name: extractPasswordDialog.baseName }) }}</h2>
        <p v-if="extractPasswordDialog.wrongPassword" class="mt-1 text-xs text-accent-red">{{ t('filePane.extractWrongPassword') }}</p>
        <input
          ref="extractPasswordInputRef"
          v-model="extractPasswordDialog.password"
          type="password"
          class="mt-3 rounded border border-border bg-bg-primary px-2 py-1.5 text-sm"
          autocomplete="off"
          spellcheck="false"
        >
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="finder-btn-secondary" @click="extractPasswordDialog.visible = false">{{ t('common.cancel') }}</button>
          <button type="submit" class="finder-btn-primary" :disabled="!extractPasswordDialog.password">{{ t('filePane.extractPasswordConfirm') }}</button>
        </div>
      </form>
    </div>
    <ChecksumDialog
      v-if="checksumDialog.visible"
      :items="checksumDialog.items"
      :algo="checksumDialog.algo"
      @close="checksumDialog.visible = false"
    />
    <SymlinkDialog
      v-if="symlinkDialog.visible"
      :device-id="pane?.deviceId || 'local'"
      :dir-path="pane?.path || '/'"
      @close="symlinkDialog.visible = false"
      @confirm="refreshCurrentDirectory(); symlinkDialog.visible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, h, type Component, watch, onMounted, onUnmounted, nextTick } from 'vue'
import FinderIcon from './FinderIcon.vue'
import FinderToolbarButton from './toolbar/FinderToolbarButton.vue'
import FinderToolbarGroup from './toolbar/FinderToolbarGroup.vue'
import FinderSearchField from './toolbar/FinderSearchField.vue'
import FinderContextMenu, { type FinderMenuItem } from '@/components/menu/FinderContextMenu.vue'
import { useAppDragSuspend } from '@/composables/useAppDragSuspend'
import { useTabsStore } from '@/stores/tabs'
import { useGitStatusStore } from '@/stores/gitStatus'
import { usePreviewStore } from '@/stores/preview'
import { useFileOperationsStore } from '@/stores/fileOperations'
import { useClipboardStore } from '@/stores/clipboard'
import { useDevicesStore } from '@/stores/devices'
import { useFileBrowserStore } from '@/stores/fileBrowser'
import { useFavoritesStore } from '@/stores/favorites'
import FileList from './FileList.vue'
import InlinePreview from './preview/InlinePreview.vue'
import { DualPaneIcon } from './icons/sidebarIcons'
import RenameDialog from './dialogs/RenameDialog.vue'
import BatchRenameDialog from './dialogs/BatchRenameDialog.vue'
import ChecksumDialog from './dialogs/ChecksumDialog.vue'
import ImageConvertDialog from './dialogs/ImageConvertDialog.vue'
import Archive7zDialog from './dialogs/Archive7zDialog.vue'
import SymlinkDialog from './dialogs/SymlinkDialog.vue'
import { parentDirectoryOf } from '@/utils/dragTransfer'
import { hideDropHint } from '@/utils/dropHint'
import { useDragSessionStore } from '@/stores/dragSession'
import { useClipboardContentStore } from '@/stores/clipboardContent'
import { t } from '@/i18n'
import { isZipVirtualPath, parseZipVirtualPath, joinZipPath, zipBreadcrumbSegments } from '@shared/zipPath'
import type { FileInfo } from '@/types'
import type { ChecksumAlgo, ChecksumItem, ImageConvertSpec } from '@shared/types'
import type { BatchRenameItem } from '@/types/fileBrowser'
import type { FileOperationTask } from '@/types/fileOperation'

const log = console

const props = defineProps<{
  paneId: string
}>()

const tabsStore = useTabsStore()
const gitStatusStore = useGitStatusStore()
const previewStore = usePreviewStore()
const fileOpsStore = useFileOperationsStore()
const clipboardStore = useClipboardStore()
const devicesStore = useDevicesStore()
const browserStore = useFileBrowserStore()
const favoritesStore = useFavoritesStore()
const dragSessionStore = useDragSessionStore()
const clipboardContentStore = useClipboardContentStore()

const pane = computed(() => tabsStore.findPane(props.paneId))
const browserState = computed(() => browserStore.stateFor(props.paneId))
const currentDevice = computed(() => devicesStore.devices.find(device => device.id === pane.value?.deviceId))
const currentDeviceName = computed(() => currentDevice.value?.name || pane.value?.deviceId || t('devices.localName'))
const canCaptureScreenshot = computed(() => ['android', 'ohos', 'ios'].includes(currentDevice.value?.type ?? ''))

// 本面板所属标签是否已开启双面板（按 paneId 反查所属标签，不依赖「只渲染活动标签」的现状）
const ownerTab = computed(() => tabsStore.tabs.find(tab => tab.panes.some(p => p.id === props.paneId)))
const isDualPane = computed(() => (ownerTab.value?.panes.length ?? 0) === 2)

/** 工具栏双面板切换：开=以本面板当前路径克隆出第二面板；关=收起第二面板。 */
function toggleDualPane() {
  tabsStore.toggleActiveSplit(props.paneId)
}

const searchQuery = ref('')
// ── 搜索历史下拉 ─────────────────────────────────────────────────────────────
const searchHistoryOpen = ref(false)
const searchBoxRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<InstanceType<typeof FinderSearchField> | null>(null)
const filteredSearchHistory = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return browserStore.searchHistory
  return browserStore.searchHistory.filter(h => h.toLowerCase().includes(q))
})
function commitSearch() {
  browserStore.rememberSearch(searchQuery.value)
  searchHistoryOpen.value = false
}
function clearSearch() {
  searchQuery.value = ''
  searchHistoryOpen.value = false
}
function applySearchHistory(item: string) {
  searchQuery.value = item
  browserStore.rememberSearch(item)
  searchHistoryOpen.value = false
  searchInputRef.value?.focus()
}
function closeSearchHistoryOnOutsideClick(event: MouseEvent) {
  if (!searchHistoryOpen.value) return
  const target = event.target
  if (!(target instanceof Node) || !searchBoxRef.value?.contains(target)) {
    searchHistoryOpen.value = false
  }
}

// ── 工具栏 NSMenu 菜单（FinderContextMenu 浮层）：排序 / 操作更多 ──────────
// 定位与外点关闭沿用面包屑 … 菜单的宿主契约（document click 冒泡 + 菜单根自带
// @click.stop；右键别处捕获阶段先行关闭）；组件内部自管标题栏拖拽区放行。
const sortMenu = reactive({ visible: false, x: 0, y: 0 })
const actionsMenu = reactive({ visible: false, x: 0, y: 0 })

// 搜索历史下拉（自定义浮层，非 FinderContextMenu）打开期间放行标题栏拖拽区
useAppDragSuspend(() => searchHistoryOpen.value)
const loadedFiles = ref<FileInfo[]>([])
const directoryLoadKey = ref(0)
const createNameInputRef = ref<HTMLInputElement | null>(null)
const createDialog = reactive({
  visible: false,
  kind: 'file' as 'file' | 'folder',
  /** manual=普通新建（空文件/文件夹）；clipboard=从剪贴板新建（带内容预览与直写）。 */
  source: 'manual' as 'manual' | 'clipboard',
  name: '',
  error: '',
  // source='clipboard' 的预览数据（探针快照，打开对话框时冻结）
  clipKind: 'text' as 'text' | 'image',
  previewText: '',
  previewTruncated: false,
  previewDataUrl: ''
})
// ⇧⌘G 前往文件夹对话框
const goToNameInputRef = ref<HTMLInputElement | null>(null)
const goToDialog = reactive({
  visible: false,
  path: '',
  error: ''
})
const pendingDirectoryRefreshes = new Set<string>()
/** 本面板 cmd+V 排队的 copy/move 任务：完成后把落地文件设为选中（Finder 语义）。 */
const pasteOriginatedTaskIds = new Set<string>()
/** cmd+V 落地后的一次性揭示目标：随刷新重挂的 FileList 加载成功后滚动定位。 */
const revealArrivedPath = ref<string | null>(null)
let stopFileOperationUpdates: (() => void) | null = null

log.info('[FinderFilePane] initialized', { paneId: props.paneId })

// Inline preview state
const inlinePreviewFile = ref<FileInfo | null>(null)
const inlinePreviewEnabled = ref(false)
const previewWidth = ref(400) // Default preview width
const isResizing = ref(false)
const isDropTarget = ref(false)
let dragDepth = 0

function activatePane() {
  tabsStore.setActivePane(props.paneId)
}

function handlePaneMouseDown() {
  activatePane()
}

function handleDragEnter(event: DragEvent) {
  // 原生拖拽（local 文件走 startNativeDrag）没有 application/json 类型，
  // 以 dragSession 识别应用内拖拽，保证高亮环对所有内部拖拽生效
  const isInternalDrag =
    !!event.dataTransfer?.types.includes('application/json') || dragSessionStore.isActive
  if (!isInternalDrag && !(event.dataTransfer?.types.includes('Files'))) return
  if (dragDepth === 0) {
    log.info('[DnD][FilePane] dragenter', {
      paneId: props.paneId,
      isInternalDrag,
      sessionActive: dragSessionStore.isActive,
      types: event.dataTransfer ? [...event.dataTransfer.types] : []
    })
  }
  dragDepth += 1
  isDropTarget.value = true
}

function handleDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) {
    isDropTarget.value = false
    hideDropHint()
  }
}

function toggleInlinePreview() {
  inlinePreviewEnabled.value = !inlinePreviewEnabled.value
  if (!inlinePreviewEnabled.value) {
    inlinePreviewFile.value = null
    previewStore.clearInlinePreview()
  } else {
    // When enabling, immediately show preview for current selection if any（含文件夹）
    const selectedFiles = pane.value?.selectedFiles || []
    if (selectedFiles.length === 1) {
      const file = loadedFiles.value.find(f => f.path === selectedFiles[0])
      if (file) {
        inlinePreviewFile.value = file
        previewStore.setInlinePreview(file, pane.value?.deviceId || 'local')
      }
    }
  }
}

const renameDialog = reactive({
  visible: false,
  filePath: ''
})
const batchRenameDialog = reactive<{ visible: boolean; files: Array<{ path: string; name: string; isDirectory: boolean }> }>({ visible: false, files: [] })
const imageConvertDialog = reactive<{ visible: boolean; files: Array<{ path: string; name: string; isDirectory: boolean }> }>({ visible: false, files: [] })
const archive7zDialog = reactive<{ visible: boolean; defaultName: string }>({ visible: false, defaultName: 'Archive' })
/** 7Z 对话框打开瞬间的选中快照（confirm 时使用，避免弹窗期间选择变化）。 */
let lastArchive7zFiles: string[] = []
const extractPasswordDialog = reactive({
  visible: false,
  password: '',
  /** 错密码重试标记（区别于首次索密） */
  wrongPassword: false,
  baseName: '',
  deviceId: 'local',
  archivePath: '',
  targetDirectory: ''
})
const extractPasswordInputRef = ref<HTMLInputElement | null>(null)
const checksumDialog = reactive<{ visible: boolean; items: ChecksumItem[]; algo: ChecksumAlgo }>({ visible: false, items: [], algo: 'sha256' })
const symlinkDialog = reactive({ visible: false })

const pathSegments = computed(() => {
  if (!pane.value) return []
  // ZIP 虚拟路径与普通路径统一经 @shared/zipPath 计算（单一事实源）。
  return zipBreadcrumbSegments(pane.value.path)
})

/** True when the current pane is browsing inside a ZIP archive. */
const isInsideZip = computed(() => isZipVirtualPath(pane.value?.path ?? ''))

/** Git 分支 chip 文案（本地仓库目录才有；ahead/behind 附在 title）。 */
const gitBranchInfo = computed<{ label: string; title: string } | null>(() => {
  if (!pane.value || pane.value.deviceId !== 'local') return null
  const status = gitStatusStore.statusFor(pane.value.deviceId, pane.value.path)
  if (!status?.isRepo || !status.branch) return null
  const arrows = [
    status.ahead ? `↑${status.ahead}` : '',
    status.behind ? `↓${status.behind}` : ''
  ].filter(Boolean).join(' ')
  return {
    label: arrows ? `${status.branch} ${arrows}` : status.branch,
    title: arrows
      ? t('filePane.gitChipTitle', { repoRoot: status.repoRoot ?? '', arrows })
      : t('filePane.gitChipTitlePlain', { repoRoot: status.repoRoot ?? '' })
  }
})

/**
 * 宿主集成（Finder/Terminal）是否可用：仅本地设备、且不在 ZIP 虚拟路径内。
 * 远程设备与 ZIP 内部路径在本机无 Finder/Terminal 对应实体（与 FileList 同名门控一致）。
 */
const isHostShellAvailable = computed(() => pane.value?.deviceId === 'local' && !isInsideZip.value)

/** 工具栏按钮：在 Finder 中定位当前目录（主进程 shell.showItemInFolder 选中该目录于其父窗口）。 */
function revealCurrentFolderInFinder() {
  if (!isHostShellAvailable.value) return
  const currentPath = pane.value?.path
  if (currentPath) {
    window.fileman.showInFolder(currentPath).catch(err => {
      console.error('[FilePane] showInFolder failed for', currentPath, err)
    })
  }
}

/**
 * Returns true for the breadcrumb segment index that corresponds to the ZIP
 * file itself (the boundary between filesystem and archive internals).
 */
function isZipBoundarySegment(index: number): boolean {
  if (!isZipVirtualPath(pane.value?.path ?? '')) return false
  const fsSegmentCount = parseZipVirtualPath(pane.value!.path).zipFilePath.split('/').filter(Boolean).length
  // The ZIP file is the last filesystem segment
  return index === fsSegmentCount - 1
}

// View mode icons as components
const ListIcon: Component = {
  render() {
    return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M4 6h16M4 10h16M4 14h16M4 18h16' })
    ])
  }
}

const GridIcon: Component = {
  render() {
    return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' })
    ])
  }
}

const ColumnsIcon: Component = {
  render() {
    return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2' })
    ])
  }
}

// 标签经 t() 取词：必须包在 computed 里随语言切换重算（禁止 setup 级常量存 t() 结果）
const viewModes = computed(() => [
  { value: 'list' as const, icon: ListIcon, label: t('filePane.view.list') },
  { value: 'grid' as const, icon: GridIcon, label: t('filePane.view.grid') },
  { value: 'columns' as const, icon: ColumnsIcon, label: t('filePane.view.columns') }
])

// ── 网格规格（大/中/小）：右击网格按钮弹出选择 ────────────────────────────────
const gridSizeOptions = computed(() => [
  { value: 'xlarge' as const, label: t('filePane.gridSize.xlarge') },
  { value: 'large' as const, label: t('filePane.gridSize.large') },
  { value: 'medium' as const, label: t('filePane.gridSize.medium') },
  { value: 'small' as const, label: t('filePane.gridSize.small') }
])
const gridSizeMenu = reactive({ visible: false, x: 0, y: 0 })
const activeGridSize = computed(() => pane.value?.gridSize ?? 'large')

/** NSMenu items：当前规格带 check 图标（radio 语义，与 Finder「图标大小」一致）。 */
const gridSizeMenuItems = computed<FinderMenuItem[]>(() =>
  gridSizeOptions.value.map(opt => ({
    label: opt.label,
    action: opt.value,
    icon: activeGridSize.value === opt.value ? 'check' : undefined
  }))
)

function onViewButtonContextMenu(value: string, e: MouseEvent) {
  // 仅网格按钮响应右键 → 弹出规格菜单
  if (value !== 'grid') return
  gridSizeMenu.x = e.clientX
  gridSizeMenu.y = e.clientY
  gridSizeMenu.visible = true
}
function closeGridSizeMenu() {
  gridSizeMenu.visible = false
}
function onGridSizeMenuSelect(action: string) {
  chooseGridSize(action as 'xlarge' | 'large' | 'medium' | 'small')
}
function chooseGridSize(size: 'xlarge' | 'large' | 'medium' | 'small') {
  tabsStore.setGridSize(props.paneId, size)
  // 选择规格即进入网格视图，让所选大/中/小立即生效
  if (pane.value?.viewMode !== 'grid') {
    tabsStore.setViewMode(props.paneId, 'grid')
  }
  closeGridSizeMenu()
}

function navigateToSegment(index: number) {
  if (!pane.value) return
  const path = pane.value.path

  // Virtual ZIP path: "<zipFilePath>::<innerPath>"（解析统一在 @shared/zipPath）
  if (isZipVirtualPath(path)) {
    const { zipFilePath, innerPath } = parseZipVirtualPath(path)
    const fsSegments  = zipFilePath.split('/').filter(Boolean)
    const innerSegs   = innerPath ? innerPath.split('/').filter(Boolean) : []

    if (index < fsSegments.length - 1) {
      // Navigate to a filesystem ancestor (exit the ZIP entirely)
      const newPath = '/' + fsSegments.slice(0, index + 1).join('/')
      tabsStore.navigatePane(props.paneId, newPath)
    } else if (index === fsSegments.length - 1) {
      // Click on the ZIP file itself → show ZIP root
      tabsStore.navigatePane(props.paneId, joinZipPath(zipFilePath, ''))
    } else {
      // Navigate within the ZIP
      const innerIdx  = index - fsSegments.length
      const newInner  = innerSegs.slice(0, innerIdx + 1).join('/')
      tabsStore.navigatePane(props.paneId, joinZipPath(zipFilePath, newInner))
    }
    return
  }

  const segments = pathSegments.value.slice(0, index + 1)
  const newPath = '/' + segments.join('/')
  tabsStore.navigatePane(props.paneId, newPath)
}

// ── 面包屑长路径折叠（Finder 式：中段折成 …，首尾段常驻可见） ──────────────────
// 折叠量按实测宽度自适应：子元素全部 flex-shrink-0，overflow-hidden 下
// scrollWidth 如实反映内容总宽，溢出则逐级把中间段折进 …。
const breadcrumbCollapseCount = ref(0)
const breadcrumbMeasureRef = ref<HTMLElement | null>(null) // 内层 overflow-hidden 容器（测量对象）
const breadcrumbPillRef = ref<HTMLElement | null>(null)    // 带边框 pill（RO 目标，跨浏览⇄编辑态存活）
const breadcrumbMenu = reactive({ visible: false, x: 0, y: 0 })
let breadcrumbObserver: ResizeObserver | null = null
let breadcrumbAdjustToken = 0

/** 最多可折叠的中间段数：始终保留首段与末段。 */
const maxBreadcrumbCollapse = computed(() => Math.max(0, pathSegments.value.length - 2))

interface BreadcrumbItem {
  key: string
  kind: 'seg' | 'ellipsis'
  label: string
  /** 原始分段索引（… 为 -1）；navigateToSegment / isZipBoundarySegment 直接消费 */
  index: number
  showSeparator: boolean
}

/** 渲染用分段序列：c=0 全显；c>0 为 seg0 + … + seg[c+1..]，呈 `Users / … / a / b`。 */
const visibleBreadcrumb = computed<BreadcrumbItem[]>(() => {
  const segs = pathSegments.value
  if (segs.length === 0) return []
  const c = Math.min(breadcrumbCollapseCount.value, maxBreadcrumbCollapse.value)
  const items: BreadcrumbItem[] = [
    { key: 's0', kind: 'seg', label: segs[0], index: 0, showSeparator: c > 0 || segs.length > 1 }
  ]
  if (c > 0) {
    items.push({ key: 'ellipsis', kind: 'ellipsis', label: '…', index: -1, showSeparator: true })
    for (let i = c + 1; i < segs.length; i++) {
      items.push({ key: `s${i}`, kind: 'seg', label: segs[i], index: i, showSeparator: i < segs.length - 1 })
    }
  } else {
    for (let i = 1; i < segs.length; i++) {
      items.push({ key: `s${i}`, kind: 'seg', label: segs[i], index: i, showSeparator: i < segs.length - 1 })
    }
  }
  return items
})

/** … 菜单项：被折叠的中间段（ZIP 边界段用 zip 图标保持辨识）+ 尾部「在终端中打开」。 */
const hiddenBreadcrumbSegments = computed<FinderMenuItem[]>(() => {
  const c = Math.min(breadcrumbCollapseCount.value, maxBreadcrumbCollapse.value)
  const items: FinderMenuItem[] = pathSegments.value.slice(1, c + 1).map((label, i) => ({
    label,
    action: String(i + 1),
    icon: isZipBoundarySegment(i + 1) ? 'zip' : 'folder'
  }))
  // 宿主集成：在终端打开当前目录（与 FileList 右键菜单同门控同链路，仅本地、非 ZIP）
  if (isHostShellAvailable.value) {
    items.push({ label: '---', action: '__divider__' })
    items.push({ label: t('fileList.menu.openInTerminal'), action: 'open-in-terminal', icon: 'terminal' })
  }
  return items
})

/** 实测自适应折叠：溢出逐级 +1；空闲超过 48px（滞回防抖）才 -1，展开过头则回退。 */
async function adjustBreadcrumbCollapse() {
  const token = ++breadcrumbAdjustToken
  let guard = 0
  const maxIter = pathSegments.value.length + 4
  // 路径变短后 c 可能残留越界，先钳回上限
  breadcrumbCollapseCount.value = Math.min(breadcrumbCollapseCount.value, maxBreadcrumbCollapse.value)
  await nextTick()
  if (token !== breadcrumbAdjustToken) return

  // 收缩：放得下即停；到折叠上限仍溢出则交由 overflow-hidden 兜底
  while (guard++ < maxIter) {
    const el = breadcrumbMeasureRef.value
    if (!el || breadcrumbEditing.value || el.clientWidth === 0) return
    if (el.scrollWidth <= el.clientWidth + 1) break
    if (breadcrumbCollapseCount.value >= maxBreadcrumbCollapse.value) break
    breadcrumbCollapseCount.value++
    await nextTick()
    if (token !== breadcrumbAdjustToken) return
  }
  // 展开滞回：多出 48px 才展开一级；展开后若溢出则回退并停（避免临界抖动）
  while (guard++ < maxIter && breadcrumbCollapseCount.value > 0) {
    const el = breadcrumbMeasureRef.value
    if (!el || breadcrumbEditing.value || el.clientWidth === 0) return
    if (el.clientWidth - el.scrollWidth <= 48) break
    breadcrumbCollapseCount.value--
    await nextTick()
    if (token !== breadcrumbAdjustToken) return
    const after = breadcrumbMeasureRef.value
    if (after && after.scrollWidth > after.clientWidth + 1) {
      breadcrumbCollapseCount.value++
      await nextTick()
      break
    }
  }
}

/** 幂等挂载 ResizeObserver（onMounted 时 pill 可能尚未就绪，watch 里重试）；observe 即触发首调。 */
function ensureBreadcrumbObserver() {
  if (breadcrumbObserver || !breadcrumbPillRef.value) return
  breadcrumbObserver = new ResizeObserver(() => void adjustBreadcrumbCollapse())
  breadcrumbObserver.observe(breadcrumbPillRef.value)
}

// ── … 菜单开合（宿主契约同 FileList 右键菜单：document click 冒泡关闭 + 菜单根自带 @click.stop） ──
function openBreadcrumbEllipsisMenu(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  breadcrumbMenu.x = rect.left
  breadcrumbMenu.y = rect.bottom + 4
  breadcrumbMenu.visible = true
}

function onBreadcrumbMenuSelect(action: string) {
  breadcrumbMenu.visible = false
  if (action === 'open-in-terminal') {
    // 折叠段 action 均为纯数字，此项是唯一字符串项
    const dir = pane.value?.path
    if (dir) {
      window.fileman.openInTerminal(dir).catch(err => {
        console.error('[FilePane] openInTerminal failed for', dir, err)
      })
    }
    return
  }
  navigateToSegment(Number(action))
}

/** 点外部 / 右键别处时关闭 … 菜单（contextmenu 用捕获：FileList 的菜单互斥句柄是模块局部的，互相不知情）。 */
function closeBreadcrumbMenu() {
  breadcrumbMenu.visible = false
}

function closeSortMenu() {
  sortMenu.visible = false
}

function closeActionsMenu() {
  actionsMenu.visible = false
}

function handleSelect(files: string[]) {
  tabsStore.setSelectedFiles(props.paneId, files)

  if (!inlinePreviewEnabled.value) return

  // Show inline preview for single selection when enabled（文件夹也显示，展示其信息）
  if (files.length === 1) {
    const selectedPath = files[0]
    const file = loadedFiles.value.find(f => f.path === selectedPath)
    if (file) {
      inlinePreviewFile.value = file
      previewStore.setInlinePreview(file, pane.value?.deviceId || 'local')
    } else {
      inlinePreviewFile.value = null
      previewStore.clearInlinePreview()
    }
  } else {
    inlinePreviewFile.value = null
    previewStore.clearInlinePreview()
  }
}

function handleNavigate(path: string) {
  tabsStore.navigatePane(props.paneId, path)
  if (pane.value) browserStore.rememberLocation(pane.value.deviceId, path)
  // Close inline preview when navigating
  inlinePreviewFile.value = null
  previewStore.clearInlinePreview()
}

// ── 排序菜单：字段（名称/修改日期/大小/种类）+ 方向 + 文件夹置顶 ─────────────
// 与 FileList 列头排序同一份 browserState.sort，两条入口改的是同一状态。
const SORT_FIELD_KEYS: Array<{ field: 'name' | 'modifiedTime' | 'size' | 'extension'; key: string }> = [
  { field: 'name', key: 'name' },
  { field: 'modifiedTime', key: 'dateModified' },
  { field: 'size', key: 'size' },
  { field: 'extension', key: 'kind' }
]

/** 当前排序字段的菜单文案（胶囊上弱一级显示） */
const sortFieldLabel = computed(() => {
  const match = SORT_FIELD_KEYS.find(f => f.field === browserState.value.sort.field)
  return match ? t(`fileList.columns.${match.key}`) : ''
})

const sortMenuItems = computed<FinderMenuItem[]>(() => {
  const sort = browserState.value.sort
  return [
    ...SORT_FIELD_KEYS.map(f => ({
      label: t(`fileList.columns.${f.key}`),
      action: `sort-field:${f.field}`,
      icon: sort.field === f.field ? 'check' : undefined
    })),
    { label: '', action: '__divider__' },
    { label: t('filePane.toolbar.sortAscending'), action: 'sort-dir:asc', icon: sort.direction === 'asc' ? 'check' : undefined },
    { label: t('filePane.toolbar.sortDescending'), action: 'sort-dir:desc', icon: sort.direction === 'desc' ? 'check' : undefined },
    { label: '', action: '__divider__' },
    { label: t('filePane.toolbar.foldersFirst'), action: 'sort-folders', icon: sort.foldersFirst ? 'check' : undefined }
  ]
})

function toggleSortMenu(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  sortMenu.x = rect.left
  sortMenu.y = rect.bottom + 4
  sortMenu.visible = !sortMenu.visible
}

function onSortMenuSelect(action: string) {
  sortMenu.visible = false
  const sort = browserState.value.sort
  if (action.startsWith('sort-field:')) {
    const field = action.slice('sort-field:'.length) as typeof sort.field
    browserStore.setSort(props.paneId, { ...sort, field })
  } else if (action === 'sort-dir:asc' || action === 'sort-dir:desc') {
    browserStore.setSort(props.paneId, { ...sort, direction: action === 'sort-dir:asc' ? 'asc' : 'desc' })
  } else if (action === 'sort-folders') {
    browserStore.setSort(props.paneId, { ...sort, foldersFirst: !sort.foldersFirst })
  }
}

// ── 操作更多菜单：新建 / 在 Finder 中显示 / 截屏 / 内联预览 / 递归搜索 / 撤销 ──
const actionsMenuItems = computed<FinderMenuItem[]>(() => {
  const items: FinderMenuItem[] = [
    { label: t('filePane.toolbar.newFolder'), action: 'new-folder', icon: 'newFolder' },
    { label: t('filePane.toolbar.newFile'), action: 'new-file', icon: 'newFile' },
    { label: '', action: '__divider__' },
    { label: t('filePane.toolbar.favoriteCurrentDir'), action: 'add-favorite-current', icon: 'star' },
    {
      label: isHostShellAvailable.value ? t('filePane.toolbar.revealInFinder') : t('filePane.toolbar.revealInFinderLocalOnly'),
      action: 'reveal',
      icon: 'finder',
      disabled: !isHostShellAvailable.value
    }
  ]
  // 从剪贴板新建文件（与 FileList 空白菜单同一探测缓存与门控）
  const clipProbe = clipboardContentStore.currentProbe
  const clipInsertAt = 2 // new-folder / new-file 之后
  if ((clipProbe?.kind === 'text' || clipProbe?.kind === 'image') && !isZipVirtualPath(pane.value?.path || '')) {
    const isText = clipProbe.kind === 'text'
    items.splice(clipInsertAt, 0, {
      label: isText
        ? t('filePane.toolbar.newFromClipboardText')
        : t('filePane.toolbar.newFromClipboardImage'),
      action: 'new-from-clipboard',
      icon: isText ? 'clipboardText' : 'clipboardImage',
      disabled: clipProbe.tooLarge === true
    })
  }
  if (canCaptureScreenshot.value) {
    items.push({ label: t('filePane.toolbar.screenshot'), action: 'screenshot' })
  }
  items.push(
    { label: '', action: '__divider__' },
    { label: t('filePane.toolbar.inlinePreview'), action: 'toggle-inline-preview', icon: inlinePreviewEnabled.value ? 'check' : undefined },
    { label: t('filePane.toolbar.recursiveSearch'), action: 'toggle-recursive-search', icon: browserState.value.recursiveSearch ? 'check' : undefined }
  )
  if (fileOpsStore.undoRecycle) {
    items.push(
      { label: '', action: '__divider__' },
      { label: t('filePane.toolbar.undoRemoteDelete'), action: 'undo-recycle' }
    )
  }
  return items
})

function toggleActionsMenu(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  actionsMenu.x = rect.left
  actionsMenu.y = rect.bottom + 4
  actionsMenu.visible = !actionsMenu.visible
  // 打开时兜底刷新剪贴板探测（focus 是主刷新时机；items 是 computed 绑定，
  // probe 回填后菜单自动重算，无须重建快照）
  if (actionsMenu.visible) void clipboardContentStore.refresh()
}

function onActionsMenuSelect(action: string) {
  actionsMenu.visible = false
  switch (action) {
    case 'new-folder': openCreateDialog('folder'); break
    case 'new-file': openCreateDialog('file'); break
    case 'new-from-clipboard': openCreateFromClipboardDialog(); break
    case 'add-favorite-current': addCurrentDirToFavorites(); break
    case 'reveal': revealCurrentFolderInFinder(); break
    case 'screenshot': void captureScreenshot(); break
    case 'toggle-inline-preview': toggleInlinePreview(); break
    case 'toggle-recursive-search': browserStore.toggleRecursiveSearch(props.paneId); break
    case 'undo-recycle': void undoRecycle(); break
  }
}

/** 收藏当前目录（与 FileList 空白右键同语义：名称取路径末段，根目录用路径本身）。 */
function addCurrentDirToFavorites() {
  if (!pane.value) return
  const segs = pane.value.path.split('/').filter(Boolean)
  const name = segs.length > 0 ? segs[segs.length - 1] : (pane.value.path || '/')
  void favoritesStore.add({ deviceId: pane.value.deviceId, path: pane.value.path, name })
}

onMounted(() => {
  document.addEventListener('click', closeSearchHistoryOnOutsideClick, true)
  // … 菜单 / 网格规格菜单 / 排序 / 操作更多：点外部关闭（冒泡，菜单根自带
  // @click.stop）；右键别处时捕获阶段先行关闭
  document.addEventListener('click', closeBreadcrumbMenu)
  document.addEventListener('contextmenu', closeBreadcrumbMenu, true)
  document.addEventListener('click', closeGridSizeMenu)
  document.addEventListener('contextmenu', closeGridSizeMenu, true)
  document.addEventListener('click', closeSortMenu)
  document.addEventListener('contextmenu', closeSortMenu, true)
  document.addEventListener('click', closeActionsMenu)
  document.addEventListener('contextmenu', closeActionsMenu, true)
  ensureBreadcrumbObserver()
  // 命令面板「刷新当前目录」的广播（仅活动面板响应）
  document.addEventListener('fileman:refresh-active-pane', handleRefreshBroadcast)
  stopFileOperationUpdates = window.fileman.onFileOperationUpdated(task => {
    if (!['completed', 'failed', 'cancelled'].includes(task.status)) return
    selectArrivedFiles(task)
    if (!pendingDirectoryRefreshes.has(task.id) && !taskTouchesThisDirectory(task)) return
    pendingDirectoryRefreshes.delete(task.id)
    if (task.status === 'completed') {
      log.info('[DnD][FilePane] refreshing directory after task completion', {
        paneId: props.paneId,
        taskId: task.id,
        taskType: task.type,
        path: pane.value?.path
      })
      refreshCurrentDirectory()
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('click', closeSearchHistoryOnOutsideClick, true)
  document.removeEventListener('click', closeBreadcrumbMenu)
  document.removeEventListener('contextmenu', closeBreadcrumbMenu, true)
  document.removeEventListener('click', closeGridSizeMenu)
  document.removeEventListener('contextmenu', closeGridSizeMenu, true)
  document.removeEventListener('click', closeSortMenu)
  document.removeEventListener('contextmenu', closeSortMenu, true)
  document.removeEventListener('click', closeActionsMenu)
  document.removeEventListener('contextmenu', closeActionsMenu, true)
  breadcrumbObserver?.disconnect()
  breadcrumbObserver = null
  document.removeEventListener('fileman:refresh-active-pane', handleRefreshBroadcast)
  stopFileOperationUpdates?.()
  stopFileOperationUpdates = null
})

/** 命令面板刷新广播处理：仅当前活动面板响应（非活动面板并行挂载多个）。 */
function handleRefreshBroadcast(): void {
  if (tabsStore.activePane?.id === props.paneId) {
    refreshCurrentDirectory()
  }
}

function openCreateDialog(kind: 'file' | 'folder') {
  createDialog.kind = kind
  createDialog.source = 'manual'
  createDialog.name = kind === 'file' ? 'untitled.txt' : t('filePane.toolbar.newFolder')
  createDialog.error = ''
  createDialog.visible = true
  void nextTick(() => createNameInputRef.value?.select())
}

/**
 * 从剪贴板新建文件：预填时间戳默认名 + 冻结探针预览（文本前 200 字符 /
 * 320px 缩略图）。确认时另调 readClipboardData 取全量——对话框打开期间
 * 剪贴板可能已变，写入以全量读取的实时判定为准。
 */
function openCreateFromClipboardDialog() {
  const probe = clipboardContentStore.currentProbe
  if (probe?.kind !== 'text' && probe?.kind !== 'image') return
  createDialog.kind = 'file'
  createDialog.source = 'clipboard'
  createDialog.clipKind = probe.kind
  createDialog.name = clipboardFileName(probe.kind)
  createDialog.previewText = probe.previewText ?? ''
  createDialog.previewTruncated = probe.truncated ?? false
  createDialog.previewDataUrl = probe.previewDataUrl ?? ''
  createDialog.error = ''
  createDialog.visible = true
  void nextTick(() => createNameInputRef.value?.select())
}

/** 默认名：Clipboard-/Screenshot-YYYY-MM-DD-HH-mm-SS（与设备截屏命名同形）。 */
function clipboardFileName(kind: 'text' | 'image'): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const d = new Date()
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  return kind === 'text' ? `Clipboard-${stamp}.txt` : `Screenshot-${stamp}.png`
}

function closeCreateDialog() {
  createDialog.visible = false
  createDialog.error = ''
}

// ── ⇧⌘G 前往文件夹 ───────────────────────────────────────────────────────────

function openGoToDialog() {
  // Finder 行为：预填当前路径并全选，直接输入即替换
  goToDialog.path = pane.value?.path || '/'
  goToDialog.error = ''
  goToDialog.visible = true
  void nextTick(() => goToNameInputRef.value?.select())
}

function closeGoToDialog() {
  goToDialog.visible = false
  goToDialog.error = ''
}

/**
 * 校验路径并跳转（⇧⌘G 对话框与面包屑输入态共用）：
 * 返回 null 表示已跳转，否则返回错误文案。
 * ZIP 虚拟路径内：同一压缩包内跳转，无法用 exists 校验（inner 条目不是文件系统路径），
 * 仅当面板当前已在 ZIP 内时放行。
 */
async function validateAndGo(raw: string): Promise<string | null> {
  const trimmed = raw.trim()
  if (!trimmed) return t('filePane.goToDialog.emptyPath')
  // 规范化：去尾部斜杠（根目录除外）
  const path = trimmed === '/' ? '/' : trimmed.replace(/\/+$/, '')

  if (isZipVirtualPath(path)) {
    if (!isZipVirtualPath(pane.value?.path ?? '')) {
      return t('filePane.goToDialog.needFilesystemPath')
    }
    tabsStore.navigatePane(props.paneId, path)
    return null
  }
  if (!path.startsWith('/')) {
    return t('filePane.goToDialog.needAbsolutePath')
  }

  const deviceId = pane.value?.deviceId || 'local'
  try {
    const stats = await window.fileman.getStats(deviceId, path)
    if (!stats.isDirectory) {
      return t('filePane.goToDialog.notFolder')
    }
  } catch (e) {
    return t('filePane.goToDialog.notFound', { path })
  }

  tabsStore.navigatePane(props.paneId, path)
  if (pane.value) browserStore.rememberLocation(pane.value.deviceId, path)
  return null
}

async function confirmGoToDialog() {
  const error = await validateAndGo(goToDialog.path)
  if (error) {
    goToDialog.error = error
    return
  }
  closeGoToDialog()
}

// ── 面包屑尾部路径输入（点击铅笔按钮进入输入态，粘贴地址回车前往） ────────────
const breadcrumbEditing = ref(false)
const breadcrumbInput = ref('')
const breadcrumbError = ref('')
const breadcrumbInputRef = ref<HTMLInputElement | null>(null)
// 提交校验是异步的：await 期间的失焦不当作「放弃输入」
let breadcrumbCommitting = false

// 面包屑折叠重测触发：路径变化（computed 只依赖 pane.path，仅真变化才触发）、
// 编辑态切回、git chip 显隐（chip 占宽但不改 pill 盒子，RO 不会触发，必须单列）。
// 置于此处因源数组直接引用 breadcrumbEditing（声明序在前）。
watch([pathSegments, breadcrumbEditing, gitBranchInfo], () => {
  ensureBreadcrumbObserver()
  void adjustBreadcrumbCollapse()
})

function startBreadcrumbEdit() {
  if (!pane.value) return
  // 进入输入态前收起 … 菜单（fixed 浮层不该残留在输入框上）
  breadcrumbMenu.visible = false
  // Finder ⇧⌘G 习惯：预填当前路径并全选，直接粘贴/输入即整体替换
  breadcrumbInput.value = pane.value.path
  breadcrumbError.value = ''
  breadcrumbEditing.value = true
  void nextTick(() => {
    breadcrumbInputRef.value?.focus()
    breadcrumbInputRef.value?.select()
  })
}

function cancelBreadcrumbEdit() {
  breadcrumbEditing.value = false
  breadcrumbError.value = ''
}

/** 失焦即放弃本次输入（校验进行中除外）；无效路径的报错在回车后已即时可见。 */
function onBreadcrumbInputBlur() {
  if (breadcrumbCommitting) return
  breadcrumbEditing.value = false
  breadcrumbError.value = ''
}

function onBreadcrumbEnter(event: KeyboardEvent) {
  // 中文输入法组合确认的 Enter 不当作提交
  if (event.isComposing) return
  void commitBreadcrumbEdit()
}

async function commitBreadcrumbEdit() {
  if (!breadcrumbEditing.value || breadcrumbCommitting) return
  // 报错后全清输入再回车 = 放弃编辑并刷新当前目录（不当作「空路径」错误）
  if (!breadcrumbInput.value.trim()) {
    breadcrumbError.value = ''
    breadcrumbEditing.value = false
    refreshCurrentDirectory()
    return
  }
  breadcrumbCommitting = true
  const error = await validateAndGo(breadcrumbInput.value)
  breadcrumbCommitting = false
  if (error) {
    // 保留输入现场并回焦：改对后回车重试，Esc / 点别处放弃
    breadcrumbError.value = error
    breadcrumbInputRef.value?.focus()
    return
  }
  breadcrumbError.value = ''
  breadcrumbEditing.value = false
}

function joinChildPath(directory: string, name: string): string {
  const normalizedDirectory = directory === '/' ? '' : directory.replace(/\/+$/, '')
  return `${normalizedDirectory}/${name}`
}

/**
 * 拖拽等非本面板排队的传输任务是否影响当前目录：
 * - copy/move/archive 目标为本面板当前目录（含 App.vue 面板背景放置、其他面板排队）；
 * - move 源位于本面板当前目录（跨面板移动后源面板需要刷新）。
 */
function taskTouchesThisDirectory(task: FileOperationTask): boolean {
  if (task.type !== 'copy' && task.type !== 'move' && task.type !== 'archive') return false
  const deviceId = pane.value?.deviceId
  const currentPath = pane.value?.path
  if (!deviceId || !currentPath) return false
  if (task.targetDeviceId === deviceId && task.targetPath === currentPath) return true
  if (task.type === 'move' && task.sourceDeviceId === deviceId) {
    return task.sourcePaths.some(sourcePath => parentDirectoryOf(sourcePath) === currentPath)
  }
  return false
}

/**
 * cmd+V（含 ⌘X→⌘V）任务完成：把成功落地的目标文件设为面板选中，并让刷新后的
 * FileList 滚动揭示首个新文件 —— 用户一眼看到「xxx 副本」落在哪。
 * - itemResults.targetPath 已含 rename 策略生成的「副本」最终名；
 * - 只认本面板 paste 排队的任务：同目录的另一面板不被抢选中；
 * - 完成时面板已离开目标目录则放弃（用户在看别处）；
 * - 全部 skip/failed（如目标已存在被跳过）时保持现有选中，不打扰。
 */
function selectArrivedFiles(task: FileOperationTask) {
  if (!pasteOriginatedTaskIds.delete(task.id)) return
  // 失败/取消（即使有部分成功项）不抢选中：失败已有抽屉/横幅揭示
  if (task.status !== 'completed') return
  if ((task.type !== 'copy' && task.type !== 'move') || !task.targetPath) return
  if (pane.value?.deviceId !== task.targetDeviceId || pane.value?.path !== task.targetPath) return
  const arrived = task.progress.itemResults
    .filter(item => item.status === 'success' && item.targetPath && parentDirectoryOf(item.targetPath) === task.targetPath)
    .map(item => item.targetPath!)
  if (arrived.length === 0) return
  tabsStore.setSelectedFiles(props.paneId, arrived)
  revealArrivedPath.value = arrived[0]
}

function trackDirectoryRefresh(task: FileOperationTask) {
  if (['completed', 'failed', 'cancelled'].includes(task.status)) {
    if (task.status === 'completed') refreshCurrentDirectory()
    return
  }
  pendingDirectoryRefreshes.add(task.id)
  // A user can create an item immediately after opening a tab, before this
  // pane's completion subscription is mounted. Refresh once shortly after
  // queueing as a fallback; the completion event remains the normal path.
  window.setTimeout(() => {
    if (pendingDirectoryRefreshes.has(task.id)) refreshCurrentDirectory()
  }, 150)
}

function refreshCurrentDirectory() {
  directoryLoadKey.value++
}

async function confirmCreateDialog() {
  const name = createDialog.name.trim()
  if (!name || name === '.' || name === '..' || name.includes('/')) {
    createDialog.error = t('filePane.createDialog.invalidName')
    return
  }

  const deviceId = pane.value?.deviceId || 'local'
  const targetPath = joinChildPath(pane.value?.path || '/', name)
  if (createDialog.source === 'clipboard') {
    await confirmCreateFromClipboard(deviceId, targetPath, name)
    return
  }
  try {
    const task = createDialog.kind === 'file'
      ? await fileOpsStore.createTouchTask(deviceId, targetPath)
      : await fileOpsStore.createMkdirTask(deviceId, targetPath)
    trackDirectoryRefresh(task)
    closeCreateDialog()
  } catch (error) {
    createDialog.error = error instanceof Error ? error.message : t('filePane.createDialog.createFailed')
  }
}

/**
 * 从剪贴板新建的确认链路：exists 重名检查 → readClipboardData 全量读取
 * （打开对话框到确认之间板内容可能已变，kind 不符/none 即中止）→ fs:writeFile
 * 直写（瞬时操作不进任务队列）→ 刷新 + toast。文本编码走 TextEncoder——
 * 剪贴板文本含中文/emoji，裸 btoa(unicode) 会抛 Latin-1 越界。
 */
async function confirmCreateFromClipboard(deviceId: string, targetPath: string, name: string): Promise<void> {
  try {
    if (await window.fileman.exists(deviceId, targetPath)) {
      createDialog.error = t('filePane.createDialog.nameExists')
      return
    }
    const data = await window.fileman.readClipboardData()
    if (data.kind === 'none' || (createDialog.clipKind === 'text' ? data.kind !== 'text' : data.kind !== 'image')) {
      createDialog.error = t('fileList.menu.clipboardChanged')
      return
    }
    const base64 = data.kind === 'text'
      ? arrayBufferToBase64(new TextEncoder().encode(data.text))
      : data.base64
    await window.fileman.writeFile(deviceId, targetPath, base64)
    fileOpsStore.pushMessageToast(t('tasks.toast.clipboardFileCreated', { name }), 'completed')
    refreshCurrentDirectory()
    closeCreateDialog()
  } catch (error) {
    const message = error instanceof Error ? error.message : t('filePane.createDialog.createFailed')
    createDialog.error = message
    fileOpsStore.pushMessageToast(t('tasks.toast.clipboardFileFailed'), 'failed', message)
  }
}

/** Uint8Array → base64（分块转换，绕开 String.fromCharCode 的栈长上限）。 */
function arrayBufferToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function handlePreview(file: FileInfo) {
  if (!file.isDirectory) {
    // ZIP files: navigate into the archive instead of previewing
    if (file.extension?.toLowerCase() === '.zip') {
      // Nested ZIP ('a.zip::inner.zip'): the '::' protocol has no second
      // level — open the tree preview instead of a broken virtual path.
      if (isZipVirtualPath(file.path)) {
        previewStore.openPreview(file, pane.value?.deviceId || 'local', undefined, 'zip')
        return
      }
      tabsStore.navigatePane(props.paneId, joinZipPath(file.path, ''))
      return
    }
    const deviceId = pane.value?.deviceId || 'local'
    // 双击统一开预览 tab（按 path+deviceId 去重激活）
    previewStore.openPreview(file, deviceId)
  }
}

function closeInlinePreview() {
  // 面板开启期间常驻，关闭按钮直接关掉整个内联预览
  inlinePreviewEnabled.value = false
  inlinePreviewFile.value = null
  previewStore.clearInlinePreview()
}

// Resize preview panel
function startResize(event: MouseEvent) {
  isResizing.value = true
  event.preventDefault()

  const startX = event.clientX
  const startWidth = previewWidth.value

  function onMouseMove(e: MouseEvent) {
    if (!isResizing.value) return
    const diff = startX - e.clientX
    const newWidth = Math.max(300, Math.min(800, startWidth + diff))
    previewWidth.value = newWidth
  }

  function onMouseUp() {
    isResizing.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function handleFilesLoaded(files: FileInfo[]) {
  loadedFiles.value = files
}

async function copyCurrentPath() {
  const currentPath = pane.value?.path
  if (!currentPath) return
  try {
    await navigator.clipboard.writeText(currentPath)
    log.info('[FinderFilePane] copied current directory path', { currentPath })
  } catch (error) {
    log.error('[FinderFilePane] failed to copy current directory path', { error })
  }
}

function editSelectedTags() {
  const selectedPath = pane.value?.selectedFiles[0]
  if (!selectedPath) return
  void handleOperation({ action: 'info', files: [selectedPath] })
}

// Clear inline preview and search when pane navigates to a new path
watch(() => pane.value?.path, () => {
  inlinePreviewFile.value = null
  searchQuery.value = ''
  revealArrivedPath.value = null
})

// ============ 系统剪贴板互通（应用内复制 ↔ Finder 粘贴） ============

// 写穿令牌：连续两次复制时只允许最后一次的结果翻转 store 镜像标记，
// 防止先发的 osascript 写完成后覆盖后发者的判定
let systemMirrorToken = 0

/**
 * 复制/剪切后把本地真实文件镜像到系统剪贴板（Finder 等原生应用可 ⌘V）。
 * 仅本地设备（deviceId === 'local'，主进程 adapter 注册名）的非 ZIP 虚拟
 * 路径能成为本机 file URL；远端/压缩包内文件只留内部剪贴板。
 * 部分文件不可镜像时仍写可镜像子集（Finder 侧能粘多少粘多少），但镜像
 * 标记置 false——粘贴决策按内部剪贴板走，不拿系统板陈旧内容比对。
 * 失败静默降级（标记 false），不打断复制本身。
 */
async function mirrorToSystemClipboard(files: string[], sourceDeviceId: string) {
  const token = ++systemMirrorToken
  const mirrorable = sourceDeviceId === 'local' ? files.filter(p => !isZipVirtualPath(p)) : []
  if (mirrorable.length === 0) return

  try {
    const ok = await window.fileman.writeFileClipboard(mirrorable)
    if (token === systemMirrorToken) {
      clipboardStore.setSystemMirrored(ok && mirrorable.length === files.length)
    }
  } catch (error) {
    log.error('[FilePane] mirror to system clipboard failed', { error })
  }
}

async function handleOperation(op: { action: string; files: string[]; target?: string; targetDeviceId?: string; newName?: string; sourceDeviceId?: string; sourcePaneId?: string; mode?: 'copy' | 'move'; checksumItems?: ChecksumItem[] }) {
  const targetPath = op.target || pane.value?.path || '/'
  const deviceId = pane.value?.deviceId || 'local'

  switch (op.action) {
    case 'goto':
      openGoToDialog()
      break

    case 'compare-dirs':
      if (op.files.length === 2) {
        tabsStore.openCompareTab(deviceId, op.files[0], deviceId, op.files[1])
      }
      break

    case 'drop-transfer': {
      // 拖放置放（文件夹行 / columns 列），mode 已经过能力校验
      const sourceDeviceId = op.sourceDeviceId || deviceId
      if (op.files.length === 0 || isZipVirtualPath(targetPath)) {
        log.info('[DnD][FilePane] drop-transfer skipped', { targetPath, fileCount: op.files.length })
        break
      }
      try {
        const task = op.mode === 'move'
          ? await fileOpsStore.createMoveTask(sourceDeviceId, op.files, deviceId, targetPath)
          : await fileOpsStore.createCopyTask(sourceDeviceId, op.files, deviceId, targetPath)
        log.info('[DnD][FilePane] drop-transfer → task queued', {
          taskId: task.id,
          type: task.type,
          sourceDeviceId,
          targetDeviceId: deviceId,
          targetPath,
          fileCount: op.files.length
        })
        trackDirectoryRefresh(task)
      } catch (error) {
        log.error('[DnD][FilePane] Failed to queue drop transfer', {
          sourceDeviceId,
          targetDeviceId: deviceId,
          targetPath,
          mode: op.mode,
          error
        })
      }
      break
    }

    case 'send-to': {
      // 右键「发送到 ▸ 设备 ▸ 收藏路径」：把选中文件拷贝到远程设备收藏目录
      // （与 drop-transfer 同链路：任务队列 + toast/抽屉自动驱动，默认 skip 冲突策略）
      if (!op.targetDeviceId || !op.target || op.files.length === 0) break
      try {
        const task = await fileOpsStore.createCopyTask(deviceId, op.files, op.targetDeviceId, op.target)
        log.info('[FilePane] send-to → task queued', {
          taskId: task.id,
          type: task.type,
          targetDeviceId: op.targetDeviceId,
          targetPath: op.target,
          fileCount: op.files.length
        })
        trackDirectoryRefresh(task)
      } catch (error) {
        log.error('[FilePane] Failed to queue send-to transfer', {
          targetDeviceId: op.targetDeviceId,
          targetPath: op.target,
          error
        })
      }
      break
    }

    case 'copy':
      console.log('[FilePane] Copy action - setting clipboard:', {
        files: op.files,
        filesCount: op.files.length,
        sourcePaneId: props.paneId,
        sourceDeviceId: deviceId
      })
      clipboardStore.setClipboard(op.files, 'copy', props.paneId, deviceId)
      void mirrorToSystemClipboard(op.files, deviceId)
      break

    case 'cut':
      console.log('[FilePane] Cut action - setting clipboard:', {
        files: op.files,
        filesCount: op.files.length,
        sourcePaneId: props.paneId,
        sourceDeviceId: deviceId
      })
      clipboardStore.setClipboard(op.files, 'cut', props.paneId, deviceId)
      // 剪切同样写穿系统板：Finder 粘贴退化为复制（macOS 无跨应用剪切语义），
      // 应用内粘贴仍走内部剪贴板保留移动语义
      void mirrorToSystemClipboard(op.files, deviceId)
      break

    case 'paste': {
      // 粘贴源决策（应用内 ↔ 系统剪贴板互通）：
      // 1) 内部剪贴板来自远端设备 → 只能走内部（远端文件不可能出现在系统板）；
      // 2) 内部本地剪贴板未成功镜像系统板 → 走内部（系统板上是陈旧内容，
      //    比对会把用户更早的 Finder 复制误判成新粘贴源）；
      // 3) 否则读系统板：与内部一致 → 内部（保留 cut/同目录副本语义）；
      //    不一致且非空 → 用户在 Finder 复制了新文件 → 从系统板粘贴；
      // 4) 系统板无文件引用 → 内部（无则本操作跳过）。
      const internalEmpty = clipboardStore.files.length === 0
      const internalFromRemote = !internalEmpty && clipboardStore.sourceDeviceId !== 'local'
      const internalOnly = !internalEmpty && (internalFromRemote || !clipboardStore.systemMirrored)

      let pasteFiles = clipboardStore.files
      let pasteAction = clipboardStore.action
      let pasteSourceDeviceId = clipboardStore.sourceDeviceId
      let fromSystem = false

      if (!internalOnly) {
        let systemPaths: string[] = []
        try {
          systemPaths = await window.fileman.readFileClipboard()
        } catch (error) {
          log.error('[FilePane] read system clipboard failed, falling back to internal', { error })
        }
        if (systemPaths.length > 0) {
          const sameAsInternal =
            !internalEmpty &&
            systemPaths.length === clipboardStore.files.length &&
            systemPaths.every(p => clipboardStore.files.includes(p))
          if (!sameAsInternal) {
            pasteFiles = systemPaths
            pasteAction = 'copy'
            pasteSourceDeviceId = 'local'
            fromSystem = true
          }
        }
      }

      console.log('[FilePane] Paste action received:', {
        clipboardFiles: pasteFiles,
        clipboardFilesLength: pasteFiles.length,
        clipboardAction: pasteAction,
        clipboardSourcePaneId: fromSystem ? '(system)' : clipboardStore.sourcePaneId,
        clipboardSourceDeviceId: pasteSourceDeviceId,
        fromSystemClipboard: fromSystem,
        targetPath,
        currentDeviceId: deviceId
      })
      if (pasteFiles.length > 0) {
        console.log('[FilePane] Executing paste with files:', pasteFiles)
        if (pasteAction === 'cut') {
          console.log('[FilePane] Paste as MOVE operation')
          const task = await fileOpsStore.createMoveTask(
            pasteSourceDeviceId,
            pasteFiles,
            deviceId,
            targetPath
          )
          pasteOriginatedTaskIds.add(task.id)
          // cut 消费后清系统板：源文件已移走，残留 file 引用再粘（本应用或
          // Finder）都会悬空；仅镜像成功过才清，避免误清用户自己的剪贴板。
          // 先取标记再 clearClipboard（后者会把标记一并重置）。
          const wasSystemMirrored = clipboardStore.systemMirrored
          clipboardStore.clearClipboard()
          if (wasSystemMirrored) {
            void window.fileman.clearFileClipboard().catch(() => {})
          }
        } else {
          console.log('[FilePane] Paste as COPY operation')
          // Finder 语义：在源目录内 Cmd+V = 复制出「xxx 副本」文件。
          // 同目录时目标路径即源自身，默认 skip 策略会静默跳过 —— 强制走
          // rename 策略（主进程按 Finder 命名生成「a 副本.txt / a 副本 2.txt」）。
          // ZIP 虚拟路径（::）不走此逻辑（源在压缩包内，无同目录概念）。
          const sameDirDuplicate =
            pasteSourceDeviceId === deviceId &&
            pasteFiles.length > 0 &&
            !isZipVirtualPath(targetPath) &&
            pasteFiles.every(p => !isZipVirtualPath(p) && parentDirectoryOf(p) === targetPath)
          const task = await fileOpsStore.createCopyTask(
            pasteSourceDeviceId,
            pasteFiles,
            deviceId,
            targetPath,
            sameDirDuplicate ? 'rename' : 'skip'
          )
          pasteOriginatedTaskIds.add(task.id)
        }
        tabsStore.navigatePane(props.paneId, pane.value?.path || '/')
      } else {
        console.warn('[FilePane] Paste skipped: clipboard is empty')
      }
      break
    }

    case 'delete':
      if (confirm(t('fileList.confirmDelete', op.files.length))) {
        await fileOpsStore.createRecycleTask(deviceId, op.files)
        tabsStore.setSelectedFiles(props.paneId, [])
        tabsStore.navigatePane(props.paneId, pane.value?.path || '/')
      }
      break

    case 'info': {
      // 将当前选中快照交给主进程创建的独立简介窗口；文件后续选择不会影响它。
      // loadedFiles 是 deep-reactive ref，元素为 Proxy —— IPC 结构化克隆会抛
      // "An object could not be cloned"，发送前必须展开成普通对象。
      const files = op.files
        .map(p => loadedFiles.value.find(item => item.path === p))
        .filter((item): item is FileInfo => !!item)
        .map(item => ({ ...item }))
      if (files.length > 0) {
        try {
          await window.fileman.openFileInfoWindow({
            deviceId,
            deviceType: currentDevice.value?.type || 'local',
            deviceName: currentDeviceName.value,
            files
          })
        } catch (error) {
          log.error('[FinderFilePane] failed to open file info window', { error })
        }
      }
      break
    }

    case 'batch-rename':
      batchRenameDialog.files = op.files
        .map(path => loadedFiles.value.find(file => file.path === path))
        .filter((file): file is FileInfo => !!file)
      batchRenameDialog.visible = batchRenameDialog.files.length > 1
      break
    case 'image-convert':
      imageConvertDialog.files = op.files
        .map(path => loadedFiles.value.find(file => file.path === path))
        .filter((file): file is FileInfo => !!file)
      imageConvertDialog.visible = imageConvertDialog.files.length > 0
      break
    case 'new-symlink':
      symlinkDialog.visible = true
      break
    case 'checksum':
      // 1-2 个文件的哈希/对比弹窗（FileList 已附带条目元数据）
      if (op.checksumItems && op.checksumItems.length >= 1) {
        checksumDialog.items = op.checksumItems
        checksumDialog.visible = true
      }
      break

    case 'archive': {
      // Finder 规则：单选 a.txt → a.zip（目录 dir → dir.zip），多选 → Archive.zip。
      // 不再弹 prompt 询问名称 —— Electron 渲染进程不支持 window.prompt()
      // （恒返回 null，此前该菜单项点了没有任何反应，见 疑难问题解决记录）。
      // 压缩包名冲突由主进程 rename 策略自动「副本」递增；ZIP 虚拟目录不提供压缩。
      if (op.files.length === 0 || isZipVirtualPath(targetPath)) break
      const single = op.files.length === 1 ? op.files[0] : null
      const baseName = single ? archiveStemOf(single) : 'Archive'
      try {
        // [...op.files] 展开成普通数组：op.files 可能是 store 里的 reactive Proxy
        // （选中态右键走 props.selectedFiles 直传），裸 Proxy 过 contextBridge 会抛
        // "An object could not be cloned"，被此处 catch 吞成静默失败
        const task = await window.fileman.createArchive(deviceId, [...op.files], targetPath, `${baseName}.zip`)
        trackDirectoryRefresh(task)
      } catch (error) {
        log.error('[FilePane] archive task failed to queue', { targetPath, error })
      }
      break
    }

    case 'extract-archive':
      if (op.files[0]) {
        await runExtractArchive(deviceId, op.files[0], targetPath)
      }
      break

    case 'archive-7z': {
      // 7Z 对话框：默认名沿用 zip Finder 规则（单选 stem / 多选 Archive）
      if (op.files.length === 0 || isZipVirtualPath(targetPath)) break
      lastArchive7zFiles = [...op.files]
      const single7z = op.files.length === 1 ? op.files[0] : null
      archive7zDialog.defaultName = single7z ? archiveStemOf(single7z) : 'Archive'
      archive7zDialog.visible = true
      break
    }

    case 'remove-quarantine': {
      // 移除隔离标记：仅本机（FileList 已门控），目录递归；成功/失败 toast 反馈
      const targets = op.files
        .map(path => loadedFiles.value.find(file => file.path === path))
        .filter((file): file is FileInfo => !!file)
      if (targets.length === 0) break
      let removed = 0
      let failed = 0
      for (const target of targets) {
        try {
          await window.fileman.removeXattr(deviceId, target.path, 'com.apple.quarantine', target.isDirectory)
          removed++
        } catch {
          failed++
        }
      }
      if (failed === 0) fileOpsStore.pushMessageToast(t('filePane.quarantineRemoved', removed), 'completed')
      else fileOpsStore.pushMessageToast(t('filePane.quarantineRemoveFailed', failed), 'failed')
      break
    }

    case 'rename':
      if (op.files.length > 0) {
        // 如果 newName 存在，说明来自内联重命名，直接执行
        if (op.newName) {
          const filePath = op.files[0]
          await fileOpsStore.createRenameTask(deviceId, filePath, op.newName)
          tabsStore.setSelectedFiles(props.paneId, [])
          tabsStore.navigatePane(props.paneId, pane.value?.path || '/')
        } else {
          // 否则显示对话框（兼容其他调用方式）
          renameDialog.filePath = op.files[0]
          renameDialog.visible = true
        }
      }
      break

    case 'mkdir':
      openCreateDialog('folder')
      break

    case 'touch':
      openCreateDialog('file')
      break

    case 'new-from-clipboard':
      openCreateFromClipboardDialog()
      break

    case 'open':
      if (op.files.length > 0) {
        const file = loadedFiles.value.find(f => f.path === op.files[0])
        if (file?.isDirectory) {
          handleNavigate(file.path)
        } else if (file) {
          handlePreview(file)
        }
      }
      break
  }
}

async function confirmBatchRename(items: BatchRenameItem[]) {
  const deviceId = pane.value?.deviceId || 'local'
  await fileOpsStore.createBatchRenameTask(deviceId, items)
  batchRenameDialog.visible = false
  tabsStore.navigatePane(props.paneId, pane.value?.path || '/')
}

async function confirmImageConvert(spec: ImageConvertSpec) {
  const deviceId = pane.value?.deviceId || 'local'
  try {
    const task = await fileOpsStore.createImageConvertTask(
      deviceId,
      imageConvertDialog.files.map(file => file.path),
      spec
    )
    imageConvertDialog.visible = false
    trackDirectoryRefresh(task)
  } catch (error) {
    log.error('[FilePane] image convert task failed to queue', { error })
  }
}

/** Finder 压缩包名规则：a.txt → a；无扩展名（含目录）→ 原名。 */
function archiveStemOf(filePath: string): string {
  const leaf = filePath.slice(filePath.lastIndexOf('/') + 1)
  const dot = leaf.lastIndexOf('.')
  return dot > 0 ? leaf.slice(0, dot) : leaf
}

async function confirmArchive7z(payload: { name: string; password?: string }) {
  const deviceId = pane.value?.deviceId || 'local'
  const targetPath = pane.value?.path || '/'
  const lastSelection = lastArchive7zFiles
  archive7zDialog.visible = false
  if (lastSelection.length === 0) return
  try {
    const task = await window.fileman.createArchive(deviceId, [...lastSelection], targetPath, `${payload.name}.7z`, '7z', payload.password)
    trackDirectoryRefresh(task)
  } catch (error) {
    log.error('[FilePane] 7z archive task failed to queue', { targetPath, error })
  }
}

/**
 * 解压执行 + 加密档密码重试：SevenZipService 以 message 前缀
 * ARCHIVE_PASSWORD_MARKER 标记「缺密码/错密码」（instanceof 不能跨 IPC），
 * 捕获后弹密码框，确定即带密码重试。
 */
const ARCHIVE_PASSWORD_MARKER = 'FILEMAN_ARCHIVE_PASSWORD'

async function runExtractArchive(deviceId: string, archivePath: string, targetDirectory: string): Promise<void> {
  try {
    await window.fileman.extractArchive(deviceId, archivePath, targetDirectory)
    tabsStore.navigatePane(props.paneId, pane.value?.path || '/')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes(ARCHIVE_PASSWORD_MARKER)) {
      extractPasswordDialog.wrongPassword = extractPasswordDialog.visible
      extractPasswordDialog.deviceId = deviceId
      extractPasswordDialog.archivePath = archivePath
      extractPasswordDialog.targetDirectory = targetDirectory
      extractPasswordDialog.baseName = archivePath.slice(archivePath.lastIndexOf('/') + 1)
      extractPasswordDialog.password = ''
      extractPasswordDialog.visible = true
      void nextTick(() => extractPasswordInputRef.value?.focus())
      return
    }
    log.error('[FilePane] extract archive failed', { archivePath, error })
    fileOpsStore.pushMessageToast(t('filePane.extractFailed'), 'failed', message)
  }
}

async function confirmExtractPassword(): Promise<void> {
  const password = extractPasswordDialog.password
  if (!password) return
  const { deviceId, archivePath, targetDirectory } = extractPasswordDialog
  extractPasswordDialog.visible = false
  try {
    await window.fileman.extractArchive(deviceId, archivePath, targetDirectory, password)
    tabsStore.navigatePane(props.paneId, pane.value?.path || '/')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes(ARCHIVE_PASSWORD_MARKER)) {
      // 密码仍错：回到密码框并标注（不清空其余状态）
      extractPasswordDialog.password = ''
      extractPasswordDialog.wrongPassword = true
      extractPasswordDialog.visible = true
      void nextTick(() => extractPasswordInputRef.value?.focus())
      return
    }
    log.error('[FilePane] extract archive failed', { archivePath, error })
    fileOpsStore.pushMessageToast(t('filePane.extractFailed'), 'failed', message)
  }
}

async function captureScreenshot() {
  if (!pane.value || !canCaptureScreenshot.value) return
  try {
    await window.fileman.captureMobileScreenshot(pane.value.deviceId, pane.value.path)
    tabsStore.navigatePane(props.paneId, pane.value.path)
  } catch (error) {
    log.error('[FilePane] screenshot capture failed', { deviceId: pane.value.deviceId, error })
    alert(error instanceof Error ? error.message : t('filePane.screenshotFailed'))
  }
}

async function undoRecycle() {
  await fileOpsStore.undoLastRecycle()
  if (pane.value) tabsStore.navigatePane(props.paneId, pane.value.path)
}

async function doRename(newName: string) {
  if (renameDialog.filePath) {
    const deviceId = pane.value?.deviceId || 'local'
    await fileOpsStore.createRenameTask(deviceId, renameDialog.filePath, newName)
    renameDialog.visible = false
    tabsStore.setSelectedFiles(props.paneId, [])
    tabsStore.navigatePane(props.paneId, pane.value?.path || '/')
  }
}

function handleDrop() {
  // App.vue owns queue creation so a FilePane never duplicates a copy task.
  dragDepth = 0
  isDropTarget.value = false
}
</script>

<style scoped>
/* container-type 只挂在工具栏容器上（见模板注释），不要放回 .file-pane */
.file-pane-toolbar-container {
  container-type: inline-size;
}

/* 拖拽悬停面板时的「落区」：内容区圆角蓝薄纱 + 内侧描边。
   与 FileList 的 .drop-target-row 同一视觉语言（color-mix 蓝色渐层 + inset 描边），
   层级低于文件夹行高亮（行是更精确的目标），淡入淡出避免闪烁。 */
.pane-drop-zone {
  background-color: color-mix(in srgb, var(--accent-blue) 6%, transparent);
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent-blue) 40%, transparent);
}

.drop-zone-fade-enter-active,
.drop-zone-fade-leave-active {
  transition: opacity 0.15s ease;
}

.drop-zone-fade-enter-from,
.drop-zone-fade-leave-to {
  opacity: 0;
}

.file-pane-toolbar {
  flex-wrap: nowrap;
}

/* 搜索胶囊：宽度随窗口自适应，窄窗收缩但绝不成孤立图标（2026-08-19 应用户
   要求改短：原 clamp(260px, 28vw, 520px) 过长挤占标题区） */
.file-pane-toolbar-search-field {
  width: clamp(200px, 22vw, 340px);
}

/* 窄窗降级：优先隐藏低频控件（排序文字 → 标题/分享/标签 → 排序胶囊），
   导航/视图/操作(⋯)/搜索常驻 */
@container (max-width: 860px) {
  .file-pane-toolbar-sort-label {
    display: none;
  }
}

@container (max-width: 760px) {
  .file-pane-toolbar-breadcrumb,
  .file-pane-toolbar-share,
  .file-pane-toolbar-tags {
    display: none;
  }

  .file-pane-toolbar-search-field {
    width: 200px;
  }
}

@container (max-width: 540px) {
  .file-pane-toolbar-sort {
    display: none;
  }

  .file-pane-toolbar-search-field {
    width: 180px;
  }
}

.search-history-menu {
  /* Finder 浮层材质（与标签总览弹层同体系）：高不透明度 + backdrop blur，
     底层文件列表透过时不可辨认；12px 圆角、发丝边、柔和阴影。 */
  border-radius: 12px;
  background: var(--finder-popover-bg) !important;
  border: 1px solid var(--finder-popover-border);
  box-shadow: var(--finder-popover-shadow);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  isolation: isolate;
  color: var(--finder-label);
  animation: menu-pop 0.09s ease-out;
  transform-origin: top left;
}

.breadcrumb-path-error {
  /* 错误气泡：同一浮层材质（红色仅用于边框与文字，不覆盖 color）。 */
  border-radius: 8px;
  background: var(--finder-popover-bg) !important;
  border: 1px solid color-mix(in srgb, var(--accent-red) 45%, transparent);
  box-shadow: var(--finder-popover-shadow);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  isolation: isolate;
}

@keyframes menu-pop {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(-2px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
