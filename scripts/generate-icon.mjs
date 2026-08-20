#!/usr/bin/env node
/**
 * generate-icon.mjs — builds build/icon.icns from the canonical app artwork.
 *
 * The source artwork is `build/app-icon.png`: a Finder-inspired, transparent
 * raster mark that is kept tightly framed for legibility in the Dock and Finder.
 *
 * Pipeline (no extra deps — uses the project's already-installed `sharp`):
 *   1. Read the master PNG, preserving its alpha channel.
 *   2. Downscale with Lanczos3 to every size a macOS .iconset needs.
 *   3. `iconutil -c icns` the iconset → build/icon.icns.
 *
 */
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const SRC = resolve(ROOT, 'build/app-icon.png')
const OUT_ICNS = resolve(ROOT, 'build/icon.icns')
const ICONSET = resolve(ROOT, 'build/icon.iconset')

if (!existsSync(SRC)) {
  console.error(`[icon] source PNG not found: ${SRC}`)
  process.exit(1)
}

// macOS .iconset membership → rendered pixel size.
const SIZES = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024]
]

console.log(`[icon] rendering master from ${SRC.replace(ROOT + '/', '')} ...`)
const master = await sharp(SRC)
  .resize(1024, 1024, { fit: 'fill', kernel: 'lanczos3' })
  .png()
  .toBuffer()

rmSync(ICONSET, { recursive: true, force: true })
mkdirSync(ICONSET, { recursive: true })

for (const [name, px] of SIZES) {
  await sharp(master)
    .resize(px, px, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toFile(resolve(ICONSET, name))
}
console.log(`[icon] wrote ${SIZES.length} PNGs to build/icon.iconset/`)

try {
  execFileSync('iconutil', ['-c', 'icns', ICONSET, '-o', OUT_ICNS], { stdio: 'inherit' })
} catch {
  console.error('[icon] iconutil failed — install the Xcode Command Line Tools: xcode-select --install')
  process.exit(1)
}
console.log(`[icon] ✓ ${OUT_ICNS.replace(ROOT + '/', '')}`)
