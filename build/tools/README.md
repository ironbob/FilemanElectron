# Bundled CLI tools

This directory holds external CLI binaries that are packaged into the DMG via
`electron-builder.yml` → `extraResources`, so end users don't install them.

## Required: `adb` (Android)

Place the **macOS** `adb` binary at `build/tools/adb` before running
`npm run dist:mac`. It is copied to `Contents/Resources/adb` and resolved at
runtime by `ToolPathResolver` (`electron/src/services/ToolPathResolver.ts`),
which the `AndroidAdapter` (adbkit) and `MobileDeviceScanner` use instead of
`$PATH`.

### Where to get it

- From **Android SDK Platform Tools** (official):
  https://developer.android.com/tools/releases/platform-tools
  Download the macOS build, extract, and copy `platform-tools/adb` here.
- For a **universal** (arm64 + x86_64) build, use `lipo` to merge the two
  arch binaries, or ship two and pick at runtime (out of current scope).

### Make it executable

```sh
chmod +x build/tools/adb
```

### macOS Gatekeeper note

Bundled binaries may carry a quarantine attribute that blocks execution. If
the packaged app fails to spawn adb with a "cannot be opened" error, strip it
at install/run time:

```sh
xattr -d com.apple.quarantine /Applications/Fileman.app/Contents/Resources/adb
```

(Automating this inside the app is a known follow-up; not in the current pass.)

## libimobiledevice (iOS — Phase 2, not yet)

iOS support (Phase 2) will bundle `libimobiledevice` binaries here under the
same scheme. Tracked in `prd/2026-08-07-mobile-file-management-requirements.md`.
