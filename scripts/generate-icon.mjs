#!/usr/bin/env node
/**
 * generate-icon.mjs — builds build/icon.icns from an SVG glyph.
 *
 * This is a PLACEHOLDER app icon so the packaged DMG has a real launcher icon.
 * Drop a hand-authored `build/icon.icns` to override; this script only runs
 * when that file is absent (see scripts/build-dmg.sh).
 *
 * Pipeline (no extra deps — uses the project's already-installed `sharp`):
 *   1. Compose one master SVG (1024²): rounded-rect gradient background +
 *      the source glyph centered, recoloured to a single tint.
 *   2. Rasterise via sharp at high density (supersample), then downscale with
 *      Lanczos3 to every size a macOS .iconset needs.
 *   3. `iconutil -c icns` the iconset → build/icon.icns.
 *
 * Config via env (all optional):
 *   FILEMAN_ICON_SRC     path to source SVG   (default: icons/ic_computer.svg)
 *   FILEMAN_ICON_BG      gradient stops        (default: 3b82f6,1e40af)
 *   FILEMAN_ICON_GLYPH   glyph tint (hex)      (default: ffffff)
 */
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const SRC = process.env.FILEMAN_ICON_SRC
  ? resolve(ROOT, process.env.FILEMAN_ICON_SRC)
  : resolve(ROOT, 'icons/ic_computer.svg')
const [BG1, BG2] = (process.env.FILEMAN_ICON_BG || '3b82f6,1e40af').split(',')
const GLYPH = '#' + (process.env.FILEMAN_ICON_GLYPH || 'ffffff')
const OUT_ICNS = resolve(ROOT, 'build/icon.icns')
const ICONSET = resolve(ROOT, 'build/icon.iconset')

if (!existsSync(SRC)) {
  console.error(`[icon] source SVG not found: ${SRC}`)
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

// Extract inner content of the source SVG (drop xml decl / doctype / outer <svg>).
const raw = readFileSync(SRC, 'utf8')
const svgOpen = raw.indexOf('<svg')
const svgClose = raw.lastIndexOf('</svg>')
if (svgOpen === -1 || svgClose === -1) {
  console.error(`[icon] could not parse <svg>...</svg> in ${SRC}`)
  process.exit(1)
}
const inner = raw
  .slice(raw.indexOf('>', svgOpen) + 1, svgClose)
  // Strip explicit fills so the wrapping <g fill> tint wins (these are single-colour glyphs).
  .replace(/\sfill\s*=\s*"[^"]*"/g, '')

// macOS squircle ≈ 22.37% corner radius; glyph at ~58% with even padding.
const VIEWBOX = 1024
const RADIUS = Math.round(VIEWBOX * 0.2237)
const GLYPH_BOX = Math.round(VIEWBOX * 0.58)
const SCALE = (GLYPH_BOX / VIEWBOX).toFixed(6)
const PAD = Math.round((VIEWBOX - GLYPH_BOX) / 2)

const masterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#${BG1}"/>
      <stop offset="100%" stop-color="#${BG2}"/>
    </linearGradient>
    <clipPath id="squircle"><rect x="0" y="0" width="${VIEWBOX}" height="${VIEWBOX}" rx="${RADIUS}" ry="${RADIUS}"/></clipPath>
  </defs>
  <g clip-path="url(#squircle)">
    <rect x="0" y="0" width="${VIEWBOX}" height="${VIEWBOX}" fill="url(#bg)"/>
    <g fill="${GLYPH}" transform="translate(${PAD},${PAD}) scale(${SCALE})">
      ${inner}
    </g>
  </g>
</svg>`

// Supersample: density 144 on a 1024 viewBox → 2048px master, then downscale.
const DENSITY = 144
console.log(`[icon] rendering master from ${SRC.replace(ROOT + '/', '')} ...`)
const master = await sharp(Buffer.from(masterSvg), { density: DENSITY })
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
