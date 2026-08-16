# backdrop-filter 层叠顺序：顶栏下拉菜单被画布区遮挡（点击无效）

日期：2026-08-16
影响组件：`ImageEditTopToolbar.vue`（图片编辑器顶部工具栏的缩放菜单 / ⋯ 集合菜单）

## 现象

- 菜单正常渲染（可访问性树、截图里都在），但 Playwright `click` 永远卡在
  “waiting for element to be visible, enabled and stable” 直到超时。
- 手动点击同样无效——鼠标事件落在菜单下方的画布区上。

## 根因

顶栏为 Finder 毛玻璃效果使用了 `backdrop-filter`。**`backdrop-filter` 会为其宿主元素
创建独立合成层（stacking context）**，但该元素本身 `z-index: auto` 且 `position: static`，
于是整个工具栏（含内部 `z-40` 的绝对定位下拉菜单——子元素的 z-index 被困在父层的合成
上下文内）作为一个整体参与文档流绘制；而 DOM 中排在后面的兄弟（画布区）虽然也是
`position: static`，但按绘制顺序后画，直接盖住了下拉菜单的可点击区域。

即：**下拉菜单的 `z-40` 只在工具栏合成层内部有效，救不了工具栏自身被后画兄弟覆盖。**

## 解法

给工具栏显式建立层叠优先级（`ImageEditTopToolbar.vue` scoped 样式）：

```css
.img-top-toolbar {
  position: relative;
  z-index: 50; /* backdrop-filter 建立合成层但 z 默认 auto——下拉菜单会被后画的画布区盖住 */
  backdrop-filter: saturate(150%) blur(14px);
}
```

## 预防

- 任何带 `backdrop-filter`（或 `filter`/`transform`/`opacity < 1`）的“工具栏/头部”元素，
  只要其内部有绝对定位下拉/弹出物，就必须给该元素自身 `position: relative` + 明确
  `z-index`，不能只给弹出物设 z-index。
- 判定方法：DevTools 里检查弹出物实际收到的 hit-test 目标；或 Playwright 失败信息
  长时间停留在 visible/enabled/stable 循环（而非 intercepted）时优先怀疑层叠顺序。
- 与既有记录《全局CSS与scoped样式冲突》同一类教训：**视觉上“看得见”不等于“点得着”。**
