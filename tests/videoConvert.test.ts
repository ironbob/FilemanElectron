import assert from 'node:assert/strict'
import {
  MAX_EDGE_BY_RESOLUTION,
  buildVideoConvertArgs,
  isProgressEnd,
  parseMediaDuration,
  parseProgressOutTimeUs,
  progressFraction,
  scaleFilterFor,
  splitProgressLines,
  toTaskBytes
} from '../electron/src/services/support/videoConvert'
import { resolveOutputPath, extensionForFormat } from '../electron/src/services/support/imageEditNaming'
import type { VideoConvertSpec } from '../shared/types'

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`✓ ${name}`)
}

function spec(over: Partial<VideoConvertSpec> = {}): VideoConvertSpec {
  return { format: 'mp4', quality: 'standard', resolution: 'keep', ...over }
}

function valueAfter(args: string[], flag: string): string {
  const idx = args.indexOf(flag)
  assert.ok(idx > -1, `argv 应包含 ${flag}`)
  return args[idx + 1]
}

// ============ buildVideoConvertArgs ============

test('基础 / 视频参数：libx264 veryfast + yuv420p，AAC 192k，faststart，元数据保留，显式 mp4 容器', () => {
  const args = buildVideoConvertArgs('/a/b.mov', '/a/.b.abc.mp4.tmp', spec())
  for (const flag of ['-hide_banner', '-nostdin', '-nostats', '-y', '-progress', 'pipe:1', '-i', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-map_metadata', '0', '-f', 'mp4']) {
    assert.ok(args.includes(flag), `缺少 ${flag}`)
  }
  assert.equal(valueAfter(args, '-progress'), 'pipe:1')
  assert.equal(valueAfter(args, '-i'), '/a/b.mov')
  assert.equal(valueAfter(args, '-c:v'), 'libx264')
  assert.equal(valueAfter(args, '-preset'), 'veryfast')
  assert.equal(valueAfter(args, '-pix_fmt'), 'yuv420p')
  assert.equal(valueAfter(args, '-c:a'), 'aac')
  assert.equal(valueAfter(args, '-b:a'), '192k')
  assert.equal(valueAfter(args, '-movflags'), '+faststart')
  assert.equal(valueAfter(args, '-map_metadata'), '0')
  assert.equal(valueAfter(args, '-f'), 'mp4')
  // 输出路径是最后一个独立 argv 元素（不经 shell，含空格也不会被拆）
  assert.equal(args[args.length - 1], '/a/.b.abc.mp4.tmp')
  // 只取首条视频 + 首条音轨（可选），不带字幕 / 数据流
  const mapIdx = args.indexOf('-map')
  assert.deepEqual(args.slice(mapIdx, mapIdx + 4), ['-map', '0:v:0', '-map', '0:a:0?'])
})

test('质量三档 → CRF 20 / 23 / 28', () => {
  assert.equal(valueAfter(buildVideoConvertArgs('/a.mov', '/a.mp4', spec({ quality: 'high' })), '-crf'), '20')
  assert.equal(valueAfter(buildVideoConvertArgs('/a.mov', '/a.mp4', spec({ quality: 'standard' })), '-crf'), '23')
  assert.equal(valueAfter(buildVideoConvertArgs('/a.mov', '/a.mp4', spec({ quality: 'small' })), '-crf'), '28')
})

test('分辨率：keep 不加滤镜；1080p / 720p 长边上限 1920 / 1280，等比只缩不放 + 偶数尺寸', () => {
  const keep = buildVideoConvertArgs('/a.mov', '/a.mp4', spec({ resolution: 'keep' }))
  assert.ok(!keep.includes('-vf'))
  assert.equal(scaleFilterFor('keep'), null)

  const f1080 = valueAfter(buildVideoConvertArgs('/a.mov', '/a.mp4', spec({ resolution: '1080p' })), '-vf')
  assert.equal(f1080, `scale='min(iw,1920)':'min(ih,1920)':force_original_aspect_ratio=decrease:force_divisible_by=2`)
  const f720 = valueAfter(buildVideoConvertArgs('/a.mov', '/a.mp4', spec({ resolution: '720p' })), '-vf')
  assert.equal(f720, `scale='min(iw,1280)':'min(ih,1280)':force_original_aspect_ratio=decrease:force_divisible_by=2`)
  assert.deepEqual(MAX_EDGE_BY_RESOLUTION, { keep: null, '1080p': 1920, '720p': 1280 })
})

test('固定参数顺序：全局 → 输入 → 滤镜 → 映射 → 视频 → 音频 → 容器/元数据 → 输出', () => {
  assert.deepEqual(buildVideoConvertArgs('/in/a.mov', '/out/.a.1.mp4.tmp', spec({ quality: 'small', resolution: '720p' })), [
    '-hide_banner', '-nostdin', '-nostats', '-y', '-progress', 'pipe:1', '-i', '/in/a.mov',
    '-vf', `scale='min(iw,1280)':'min(ih,1280)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart', '-map_metadata', '0',
    '-f', 'mp4',
    '/out/.a.1.mp4.tmp'
  ])
})

// ============ parseMediaDuration ============

test('parseMediaDuration：正常 / 毫秒 / 微秒 / 无小数', () => {
  assert.equal(parseMediaDuration('  Duration: 00:00:02.00, start: 0.000000, bitrate: 2691 kb/s'), 2_000_000)
  assert.equal(parseMediaDuration('Duration: 00:00:01.50, start: 0'), 1_500_000)
  assert.equal(parseMediaDuration('Duration: 01:02:03.456789, start: 0'), 3_723_456_789)
  assert.equal(parseMediaDuration('Duration: 00:10:00, start: 0'), 600_000_000)
})

test('parseMediaDuration：缺失 / N/A 返回 null', () => {
  assert.equal(parseMediaDuration('Duration: N/A, bitrate: N/A'), null)
  assert.equal(parseMediaDuration(''), null)
  assert.equal(parseMediaDuration('At least one output file must be specified'), null)
})

// ============ 进度行解析 ============

test('parseProgressOutTimeUs：只认非负 out_time_us，负哨兵 / N/A / 其它键为 null', () => {
  assert.equal(parseProgressOutTimeUs('out_time_us=1984000'), 1_984_000)
  assert.equal(parseProgressOutTimeUs('out_time_us=0\r'), 0)
  assert.equal(parseProgressOutTimeUs('out_time_us=-9223372036854775807'), null)
  assert.equal(parseProgressOutTimeUs('out_time_us=N/A'), null)
  assert.equal(parseProgressOutTimeUs('out_time_ms=1984000'), null)
  assert.equal(parseProgressOutTimeUs('frame=12'), null)
  assert.equal(isProgressEnd('progress=end'), true)
  assert.equal(isProgressEnd('progress=continue'), false)
})

test('splitProgressLines：跨 chunk 的半行留给下一段拼接', () => {
  const first = splitProgressLines('frame=1\nout_time_us=12')
  assert.deepEqual(first.lines, ['frame=1'])
  assert.equal(first.rest, 'out_time_us=12')
  const second = splitProgressLines(first.rest + '34567\nprogress=end\n')
  assert.deepEqual(second.lines, ['out_time_us=1234567', 'progress=end'])
  assert.equal(second.rest, '')
  assert.deepEqual(splitProgressLines(''), { lines: [], rest: '' })
})

// ============ 比例 / 字节进度 ============

test('progressFraction：clamp 0..1；时长未知 / 为 0 恒 0', () => {
  assert.equal(progressFraction(1_000_000, 2_000_000), 0.5)
  assert.equal(progressFraction(5_000_000, 2_000_000), 1)
  assert.equal(progressFraction(-1, 2_000_000), 0)
  assert.equal(progressFraction(1_000_000, null), 0)
  assert.equal(progressFraction(1_000_000, 0), 0)
  assert.equal(progressFraction(null, 2_000_000), 0)
  assert.equal(progressFraction(Number.NaN, 2_000_000), 0)
})

test('toTaskBytes：已完成字节 + 当前文件字节 × 比例（clamp），多文件累计单调', () => {
  assert.equal(toTaskBytes(0, 1000, 0), 0)
  assert.equal(toTaskBytes(0, 1000, 0.5), 500)
  assert.equal(toTaskBytes(0, 1000, 1), 1000)
  assert.equal(toTaskBytes(0, 1000, 1.5), 1000)
  assert.equal(toTaskBytes(0, 1000, -0.5), 0)
  // 两文件 1000 + 500：第二个文件从 1000 起算
  assert.equal(toTaskBytes(1000, 500, 0.5), 1250)
  assert.equal(toTaskBytes(1000, 500, 1), 1500)
  let last = 0
  for (const [done, size, frac] of [[0, 1000, 0.3], [0, 1000, 1], [1000, 500, 0.2], [1000, 500, 1]] as const) {
    const now = toTaskBytes(done, size, frac)
    assert.ok(now >= last)
    last = now
  }
  assert.equal(last, 1500)
  // 时长未知（比例恒 0）：文件完成时整体跳变到满
  assert.equal(toTaskBytes(0, 777, progressFraction(null, null)), 0)
  assert.equal(toTaskBytes(0, 777, 1), 777)
})

// ============ resolveOutputPath（format: 'mp4'） ============

test('extensionForFormat：mp4 原样', () => {
  assert.equal(extensionForFormat('mp4'), 'mp4')
  assert.equal(extensionForFormat('jpeg'), 'jpg')
})

test('a.mov → a.mp4（suffix 空串，不是默认 _edited）', () => {
  assert.equal(
    resolveOutputPath({ sourcePath: '/a/b/a.mov', mode: 'copy', format: 'mp4', suffix: '', exists: () => false }),
    '/a/b/a.mp4'
  )
})

test('目标已存在 a.mp4 → a-1.mp4，绝不返回已存在路径', () => {
  const taken = new Set(['/a/b/a.mp4'])
  const out = resolveOutputPath({ sourcePath: '/a/b/a.mov', mode: 'copy', format: 'mp4', suffix: '', exists: p => taken.has(p) })
  assert.equal(out, '/a/b/a-1.mp4')
  assert.ok(!taken.has(out))
  taken.add('/a/b/a-1.mp4')
  assert.equal(
    resolveOutputPath({ sourcePath: '/a/b/a.mov', mode: 'copy', format: 'mp4', suffix: '', exists: p => taken.has(p) }),
    '/a/b/a-2.mp4'
  )
})

test('自定义后缀与输出目录', () => {
  assert.equal(
    resolveOutputPath({ sourcePath: '/a/b/a.mov', mode: 'copy', format: 'mp4', suffix: '_mp4', exists: () => false }),
    '/a/b/a_mp4.mp4'
  )
  assert.equal(
    resolveOutputPath({ sourcePath: '/a/b/a.mov', mode: 'copy', format: 'mp4', suffix: '', dir: '/custom', exists: () => false }),
    '/custom/a.mp4'
  )
})

console.log(`\nvideoConvert: ${passed} tests passed`)
