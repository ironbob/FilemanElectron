# 视频播放页 Quick Look 化：贴合框 contain 计算与 e2e 素材时长坑

日期：2026-08-18
组件：`src/components/preview/PreviewVideoContent.vue`（scoped `video-*` 类）
设计契约：`docs/design/finder-ui-standard.md` §13；e2e：`e2e/video-player.spec.ts`

## 背景

原实现是"网页播放器"观感：`bg-black/50 rounded-2xl` 实心大胶囊控制条、右上白色
工具条、竖线分隔符、视频卡片 `shadow-md`。重设计为 Quick Look 语言：半透明材质
（`rgba(35,35,37,.72)` + `blur(20px) saturate(140%)`）、细 scrubber、NSMenu 倍速
下拉、控件静止自动淡出。

## 坑 1：控件浮层要贴视频，不是贴舞台——纯 CSS 做不到

**要求**：控制条宽度跟随视频内容（竖屏视频时不能横贯整个窗口）。

**纯 CSS 方案的死结**：包裹层若 `h-full` + video `w-auto max-w-full`，宽视频被
`max-w-full` 压宽后元素盒高度仍是 100%，`object-contain` 会在元素盒内留白——浮层
贴的是元素盒（含留白），不是可见视频。包裹层不设高度则百分比 max-height 解不开
（auto 高度父级下子级百分比按 none 处理）。

**解法**：JS contain 计算。`loadedmetadata` 拿宽高比，`ResizeObserver` 跟舞台
（窗口缩放 / 任务抽屉推挤都覆盖），`frameBox = {w, h}` 显式设 px：

```ts
let w = availW; let h = w / aspect
if (h > availH) { h = availH; w = h * aspect }
```

舞台本体**不设 padding**（边距写进计算，`clientWidth` 不含 padding 的歧义就不存
在）；浮层（右上工具栏 + 底部控制条）全部 absolute 在贴合框内，天然跟随视频。

## 坑 2：自动淡出的状态机——暂停/结束是"常显"，不是"继续倒计时"

第一版定时器 tick 里 `if (!canAutoHide()) scheduleHide()` 无限重排——视频暂停后
定时器每 2.6s 空转一次直到卸载。正确语义分层：

- `!isPlaying`（暂停/结束）→ 直接 return，保持常显；
- 瞬态在场（倍速菜单开着 / scrubber 拖拽中 / 指针悬停控件 / 控件 `:focus-within`）
  → 重排稍后再试。

"控件聚焦不隐藏"用的是 `barRef/toolbarRef.matches(':focus-within')` 而不是舞台——
舞台自身 `tabindex=0`（键盘快捷键的落点），用舞台判 focus-within 会导致点击视频后
永远不隐藏。

键盘防叠加同理：舞台 `@keydown` 处理器先判 `e.target !== stageRef` 就 return——
按钮上的空格（原生 click）、音量滑条上的方向键（原生 step）不再被舞台级处理器
二次消费。scrubber 自身聚焦的 ←→ 用 `stopPropagation` 单独步进 ±5s。

## 坑 3：e2e 素材时长必须 > 自动隐藏阈值

自动淡出的 e2e 用 2s 素材永远验不过：**2.6s 静止阈值还没到，视频先 `ended`**，
`handleVideoEnded` 把控件唤回常显。素材换成 8s（`ffmpeg -f lavfi testsrc2`，48×72
竖屏 VP8，base64 内联进 `readFile` mock——mock 无法运行时伪造可解码视频）。

同批次踩的小坑：`page.addInitScript(fn, arg)` **只收一个 arg**，多参要包对象。

## 坑 4：全屏对象从裸 video 换成贴合框

`videoRef.requestFullscreen()` 会让浮层控件全部消失（它们是 video 的兄弟节点）。
改为对贴合框全屏，控件在全屏中仍然在场（Quick Look 行为）。竖屏视频全屏时的黑边
由 video 自身 `background: #000` 兜底。

## 关联

- 状态栏设备徽标（绿点"本机"）在视频预览 tab 激活期间隐藏：`App.vue`
  `isVideoPreviewActive`（窗口状态层不与媒体层混排）。
- 倍速菜单 Esc 走 `useKeyInterceptor` 捕获消费（子组件按键消费的既有约定，
  见《子组件ESC键消费-阻止父组件响应》）。
