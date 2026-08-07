#!/usr/bin/env bash
#
# build-dmg.sh — build the macOS .app and package it into a DMG (dist/).
#
#   npm run dist:mac         # build icon + app + dmg
#   bash scripts/build-dmg.sh --no-build   # skip electron-vite build, reuse out/
#
# Requires: npm install (electron-builder + sharp are dev/runtime deps).
# Output:   dist/Fileman-<version>-<arch>.dmg  (unsigned — see note below)

set -euo pipefail
cd "$(dirname "$0")/.."

DO_BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-build) DO_BUILD=0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

echo "==> [1/3] Build app (electron-vite build)"
if [[ "$DO_BUILD" -eq 1 ]]; then
  npm run build
else
  echo "    skipped (--no-build); reusing out/"
  [[ -f out/main/index.js ]] || { echo "    out/ is missing — run without --no-build first." >&2; exit 1; }
fi

echo "==> [2/3] Ensure app icon (build/icon.icns)"
if [[ -f build/icon.icns ]]; then
  echo "    exists; keeping it (delete it to regenerate the placeholder)"
else
  node scripts/generate-icon.mjs
fi

echo "==> [3/3] Package DMG (electron-builder --mac)"
# Default to an UNSIGNED build. electron-builder otherwise auto-discovers a
# signing identity; on this machine the "Apple Development" cert is duplicated
# in the keychain (ambiguous) and can't notarize for general distribution
# anyway (needs a Developer ID). To sign instead:
#   CSC_IDENTITY_AUTO_DISCOVERY=true npm run dist:mac
export CSC_IDENTITY_AUTO_DISCOVERY="${CSC_IDENTITY_AUTO_DISCOVERY:-false}"
npx electron-builder --mac

echo
echo "==> Done. DMG artifact(s):"
ls -lh dist/*.dmg 2>/dev/null || echo "    (no .dmg in dist/ — check output above)"
echo
echo "NOTE: the DMG is unsigned. To open on another Mac, right-click the app →"
echo "      Open, or:  xattr -dr com.apple.quarantine '/Applications/Fileman.app'"
