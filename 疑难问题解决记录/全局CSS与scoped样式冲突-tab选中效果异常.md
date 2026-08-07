# 全局 CSS 与 Scoped 样式冲突 — Tab 选中效果渲染异常

## 问题描述

**现象**：`AppTabBar.vue` 中活跃 Tab（`.tab-item-active`）在亮色主题下呈现明显的黑色胶囊形背景，并附带奇特阴影，与 UI 整体风格严重不符。

**排查过程**：
1. 首先定位到 scoped 样式中 `shadow-sm` 在暗色模式下阴影过重（`rgba(0,0,0,0.3)`），将其移除。
2. 但亮色主题下黑色背景依然存在，说明根因另在别处。

---

## 根本原因：`style.css` 中存在遗留的全局 Tab 样式

`src/style.css` 中存在一段全局的 `.tab-item-active` 规则：

```css
.tab-item-active {
  background: linear-gradient(180deg, var(--bg-primary) 0%, rgba(30, 30, 46, 0.98) 100%);
  color: var(--text-primary);
  box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.1);
}
```

Vue scoped 样式虽然 specificity 更高，但它只能覆盖 `background-color`，**无法覆盖 `background-image`**。全局规则使用 `background` shorthand 同时设置了 `background-image: linear-gradient(...)`，其中底部颜色 `rgba(30,30,46,0.98)` 是硬编码的深色值。因此无论 scoped 样式如何设置背景色，那条深色渐变始终生效，在亮色主题下尤为明显。

---

## 解决方案

删除 `src/style.css` 中的全局 Tab 样式块（`.tab-item`、`.tab-item-active`、`.tab-item-inactive` 相关规则），完全由组件 scoped 样式控制外观。

同时将 scoped 样式中的 `.tab-item-active` 改为使用 CSS 变量而非硬编码颜色：

```css
/* AppTabBar.vue <style scoped> */
.tab-item-active {
  @apply text-text-primary bg-bg-active;
}
```

---

## 经验总结

> **`background` shorthand 与 `background-color` 的覆盖陷阱**
>
> 全局样式中若使用 `background: linear-gradient(...)` shorthand，会同时设定 `background-image`。后续 scoped 或局部样式哪怕 specificity 更高，若只设置 `background-color`，也**无法清除**全局规则留下的 `background-image`。
>
> **规避原则**：
> 1. 全局 CSS 中避免为具体组件的类名定义 `background` shorthand，改用 CSS 变量，或仅定义 `background-color`。
> 2. 当组件视觉效果异常时，排查是否有同名 class 的全局样式干扰，不要只看 scoped 样式。
> 3. 及时清理全局 CSS 中已被组件 scoped 样式接管的遗留规则，防止静默覆盖失效。
