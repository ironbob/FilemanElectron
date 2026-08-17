# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

FilemanElectron is a macOS-focused, dual-pane, tabbed file manager built with **Electron 29 + Vue 3 + TypeScript + Pinia**, bundled with **electron-vite**. It browses the local filesystem and remote devices (SMB, SSH/SFTP, Android via ADB, iOS via libimobiledevice) through a uniform adapter layer, with directory comparison, file diff, and rich in-app preview (text, image, audio, video, PDF, ZIP).

The UI language and git history are primarily Chinese; documentation under `疑难问题解决记录/` is Chinese and is the authoritative record for past pitfalls.

## Commands

```bash
npm run dev        # electron-vite dev — launches Vite dev server (5173) + Electron, DevTools auto-open
npm run build      # electron-vite build — emits to out/ (main, preload, renderer)
npm run preview    # electron-vite preview — run against the built out/ output
npm run typecheck  # vue-tsc --noEmit — the ONLY static check in this repo
npm run dist:mac   # build + package a macOS DMG into dist/ (see scripts/build-dmg.sh)
npm run icon       # regenerate the placeholder build/icon.icns from icons/ic_computer.svg
```

- There is **no test suite** and **no linter/formatter configured**. `npm run typecheck` is the sole pre-flight check.
- **Packaging uses `electron-builder`** (config in `electron-builder.yml`, orchestrated by `scripts/build-dmg.sh`). It ships only `out/` + `package.json` + pruned prod `node_modules`, asar-packs the app, unpacks native binaries (`sharp`, `ssh2`, `ffmpeg-static`), and emits an **unsigned** DMG (`CSC_IDENTITY_AUTO_DISCOVERY=false` — override to sign). Native-dep rebuild is disabled (`npmRebuild: false`) since all are N-API prebuilt or pure-JS. The app icon (`build/icon.icns`) is a generated placeholder; drop a hand-made one to override. Per project decision (2026-08-07), the DMG also **bundles the mobile CLI tools** — `adb` (Android), `hdc` + `libusb_shared.dylib` (OHOS/HarmonyOS; hdc is NOT self-contained — it needs that sibling dylib via `@rpath`), and `libimobiledevice` (`idevice_id`/`ideviceinfo`/`idevicepair` + AFC) — as `extraResources`, so users need not install them; `MobileDeviceScanner` must resolve the bundled copy, not `$PATH`. License compliance for these bundled tools is explicitly out of scope. (Wired 2026-08-17: `build-dmg.sh` auto-places adb via `scripts/fetch-adb.sh` — local SDK → Google download; `scripts/fetch-hdc.sh` copies hdc + its dylib from the local OpenHarmony/DevEco SDK (hdc has NO public download URL — missing SDK degrades to a warning, not a build failure); `scripts/bundle-ios-dylibs.sh` collects the iOS addon + dylib chain + the four libimobiledevice CLIs into `build/ios-native`; `ToolPathResolver` resolves bundled → `$PATH` → brew common prefixes → tool-specific SDK dirs (`extraPaths`, e.g. `~/Library/OpenHarmony/Sdk/*/toolchains`) and best-effort strips quarantine from bundled binaries + their `siblings` dylibs. Remember: GUI-launched packaged apps get NO user `$PATH` — bare-command `which`/`spawn` calls always fail in the DMG.)
- Dev loads `process.env.ELECTRON_RENDERER_URL || http://localhost:5173`.

## Architecture

### Three-process layout (electron-vite)
- **Main** — entry `electron/main.ts`. Owns all long-lived singletons (`ConfigService`, `CredentialService`, `DeviceManager`, `FileOperationManager`, `ThumbnailService`, `ZipService`) and registers every `ipcMain.handle` channel. The renderer cannot touch Node APIs directly.
- **Preload** — `electron/preload.ts`. Runs under `contextIsolation: true`, `nodeIntegration: false` and exposes **one** object, `window.fileman`, via `contextBridge`. All renderer→main calls go through it.
- **Renderer** — `src/`, a Vue 3 SPA. Entry `src/main.ts` (`createApp` + Pinia; no router — tabs are a Pinia store, not vue-router, despite the dependency being present).

Path aliases: `@` → `electron/src` in main, `@` → `src` in renderer (see `electron.vite.config.ts`).

### IPC contract — three places to keep in sync
The shape of IPC is declared in triplicate; **changing one means updating all**:
1. `electron/main.ts` — `ipcMain.handle('channel', ...)` definitions.
2. `electron/preload.ts` — `filemanAPI` methods + the type interfaces at the top.
3. `src/env.d.ts` — the `Window['fileman']` declaration the renderer sees.

Channels are namespaced: `system:`, `config:`, `device:`, `fs:`, `zip:`, `file-operation:`, `mobile:`, `thumbnail:`. Push events (main→renderer) use `webContents.send` (`device:changed`, `mobile:devicesChanged`, `file-operation:added/updated`, `transfer:progress`).

### Adapter pattern (the central abstraction)
`IFileSystemAdapter` (`electron/src/adapters/types.ts`) is the uniform filesystem interface. Implementations: `LocalAdapter`, `SMBAdapter`, `SSHAdapter`, `AndroidAdapter`, `iOSAdapter`. `DeviceManager` holds a `Map<deviceId, IFileSystemAdapter>` and proxies every filesystem call (`listFiles`, `readFile`, ...) by `deviceId`. To add a new device type: write an adapter, add it to `DeviceManager.createAdapter()`, and declare its capabilities.

`DeviceCapabilities` (`electron/src/adapters/capabilities.ts`) describes what each device can do (read/write/copy/search + cross-device `canCopyFrom/copyTo/moveFrom/moveTo`, plus `readonlyPaths`, `maxFileSize`). The UI gates actions on these flags; `canTransferBetween()` checks both endpoints. iOS is heavily restricted (no search/copy/move within device, `/` read-only).

**Optional native deps are externalized and loaded at runtime**, not required to build/run: `@aozp/smb2`/`smb2`, `ssh2`, `adbkit` are listed `external` in the vite config. Missing ones just disable that device type — do not add them as hard imports. The mobile features additionally depend on **external CLI tools** (`adb`, `libimobiledevice`) — these are **bundled into the DMG** (see the packaging note above), not user-installed; do not assume they live on `$PATH`.

### Cross-device transfer
`fs:copyBetween`/`fs:moveBetween` in `main.ts` do a **read-buffer→write loop** (move = copy + delete source), not a stream. `FileOperationManager` serializes a queue and pushes `file-operation:updated` progress events to the renderer.

### ZIP virtual paths (important convention)
A path inside a ZIP is encoded as `"<zipFilePath>::<innerPath>"` (separator is literally `::`, see `ZIP_PATH_SEP` in `main.ts`). Browsing is **lazy** — `ZipService.listDirectory`/`readEntry` decompress only what is shown, no full extraction. Both main (`fs:stat`/`fs:readFile` special-case the `::`) and the renderer (`tabs.ts` `goUp`) must understand this format. If you touch path handling, handle the `::` case.

### Renderer state (Pinia stores in `src/stores/`)
- `tabs` — the spine. Each `Tab` holds one or more `Pane`s (dual-pane) OR a `compareSession`/`fileDiffSession` (then `panes` is empty and the tab renders a compare/diff view instead). **Persisted to `localStorage`**, debounced 300 ms, with `selectedFiles` and compare/diff tabs stripped out.
- `devices`, `fileOperations`, `clipboard`, `transfers`, `thumbnail`, `preview` — `preview` runs its own secondary tab system for preview/diff content.
- `window.fileman` is the only way stores talk to the main process.

### Major renderer subsystems
- **Directory compare** — `src/components/compare/` (`useDirCompare.ts`). Status determination treats ≤2 s mtime difference as equal (cross-filesystem rounding).
- **File diff** — `FileDiffView.vue`, opened from a compare entry.
- **Preview** — `src/components/preview/`, one content component per type (`PreviewTextContent` uses Monaco, `PreviewPdfContent` uses pdfjs, `PreviewZipContent`, image/audio/video).
- **Text filter engine** — `src/utils/textFilter/` (lexer → parser → evaluator). Syntax documented in `src/components/filter/SYNTAX.md`.

### Theming
Colors are **CSS variables** defined in `src/style.css` under `[data-theme="..."]` (dark is default). `tailwind.config.js` maps Tailwind color utilities (`bg-primary`, `text-secondary`, `accent-blue`, ...) to those variables. Dark mode key is `[data-theme="dark"]`, toggled on the `App.vue` root. Use the Tailwind utility classes / CSS variables, never hardcode hex colors in components.

macOS chrome: `titleBarStyle: 'hiddenInset'`, draggable regions via `app-drag` / `app-no-drag` classes.

## Critical conventions & gotchas

These are non-obvious and have bitten this codebase before — respect them:

- **Pin `monaco-editor` at `0.44.0`.** Newer versions break worker resolution under electron-vite. Workers MUST be imported as `?worker&inline` (Electron's `file://` sandbox silently hangs plain workers). Set `MonacoEnvironment` **before** importing `monaco`. Hold the editor instance in `shallowRef` (not `ref`). Dispose the model **then** the editor on unmount. Full details: `疑难问题解决记录/monaco-editor-electron29-接入注意事项.md`.
- **pdfjs-dist v5 targets Chrome 130–131; Electron 29 is Chromium 122.** Polyfills live in `src/polyfills.ts` and MUST be imported at the very top of `src/main.ts` (`Promise.try`, `Uint8Array#toHex/toBase64`, `Uint8Array.fromBase64`, `Map#getOrInsertComputed`). The matching type declarations are in `src/env.d.ts`. Hold `PDFDocumentProxy` in `shallowRef`. Full details: `疑难问题解决记录/pdfjs-dist-v5-electron29-兼容性修复.md`.
- **`shallowRef`, not `ref`, for any third-party class instance with private fields (`#field`) or heavy internal state** (Monaco, pdfjs, JSON viewer). Vue's deep `Proxy` breaks private-field access and wrecks performance on these objects.
- **Child-component key consumption** — register keydown handlers via the `useKeyInterceptor` composable (capture phase, LIFO), returning `true` to consume. Do **not** add bubble-phase `document.addEventListener('keydown')` in child components expecting to beat `App.vue`'s handler. Details: `疑难问题解决记录/子组件ESC键消费-阻止父组件响应.md`.
- **Global vs scoped CSS** — in `src/style.css`, do not use the `background` shorthand for component-owned classes; a global `background: linear-gradient(...)` sets `background-image`, which a higher-specificity scoped `background-color` cannot override. Prefer CSS variables and let scoped styles own component appearance. Details: `疑难问题解决记录/全局CSS与scoped样式冲突-tab选中效果异常.md`.
- **Tabs store + selection performance** — the deep watch on `tabs` serializes to `localStorage` on every change, so selection writes are debounced and `selectedFiles` is excluded from persistence. When adding frequently-mutated pane state, follow the same debounce/don't-persist pattern. Details: `疑难问题解决记录/FileList.vue-Finder式多选与性能优化踩坑.md`.
- **Virtualized file list** — `FileList.vue` uses `vue-virtual-scroller` `RecycleScroller`; rubber-band selection is throttled with `requestAnimationFrame` and queries only mounted items via `[data-file-path]`.

## Background reading
Design specs and plans live in `docs/superpowers/`. The `疑难问题解决记录/` folder is the canonical record of hard-won integration fixes — consult it before touching Monaco, pdfjs, selection logic, or global CSS.
