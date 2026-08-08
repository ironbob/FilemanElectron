# iosafc — native addon (libimobiledevice AFC ↔ Node)

Node N-API addon that wraps libimobiledevice's AFC + lockdown C API, so the
`iOSAdapter` can browse / read / write the iOS AFC sandbox **without** shelling
out to an external CLI and **without** macFUSE. This is the bundleable path
(the `.node` + libimobiledevice dylibs ship inside the app).

> ⚠ **Scaffold — not yet compiled or device-tested.** The C++ is written
> against the verified libimobiledevice AFC/lockdown API, but you must build it
> on a machine with the dev headers and validate on a real device.

## Prerequisites + build libraries

```sh
bash scripts/install-ios-deps.sh
```
Installs `libimobiledevice` (+ `libplist`, `libusbmuxd`, `libimobiledevice-glue`
via deps), `pkg-config`, and `dylibbundler` (used by the bundling step).

## Build the addon

From the repo root (compiles against Electron's ABI so it loads in the app):

```sh
npm run build:native
# = cd native/iosafc && npx node-gyp configure build \
#     --target=29.1.0 --arch=arm64 --dist-url=https://electronjs.org/headers
```

Adjust `--arch=x64` on Intel. Produces `native/iosafc/build/Release/iosafc.node`.

## Bundle the dylib chain + package

```sh
bash scripts/bundle-ios-dylibs.sh   # → build/ios-native/ (iosafc.node + lib*.dylib, @loader_path)
npm run dist:mac                    # build-dmg.sh auto-calls the bundler; ships Resources/ios-native/
```

`bundle-ios-dylibs.sh` uses `dylibbundler` to collect the transitive
libimobiledevice dylibs into `build/ios-native/` and rewrite every install name
to `@loader_path/<name>`, so the addon finds them at runtime without Homebrew.
`electron-builder.yml` ships `build/ios-native` as `Resources/ios-native/`;
`iOSAdapter` loads `Resources/ios-native/iosafc.node` when packaged.

If the addon isn't built, `dist:mac` ships an empty `ios-native/` and iOS is
simply disabled (the adapter throws a clear "not built/packaged" error).

## Validate on a real device

1. Connect an iPhone over USB, unlock it.
2. Build the addon, launch `npm run dev`.
3. Trust-this-computer flow → list `/` (AFC root: `DCIM`, `PhotoData`, …) →
   pull a photo → push a file into a writable area.
4. Confirm which AFC areas are writable (this resolves requirement Q2 — the
   iOS AFC writable-boundary question).
