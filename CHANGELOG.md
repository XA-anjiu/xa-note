# XA-Note 变更日志

> 本文件记录对 XA-Note（本项目）的修改历史。每条都按「问题 → 原因 → 改法 → 验证」写清楚，
> 便于日后回溯：**为什么这么改、改在哪个函数、怎么确认没改坏**。
>
> 修改原则（沿用至今）：**改动前先完整备份**；**不删既有功能**；**改动局部、可回滚**；
> 改完必须过 `tests/` 下的回归用例。

---

## 2026-09-12 · 一轮完整迭代（14 次改动，全部已在真机验证通过）

### 概览

| # | 主题 | 主要文件 |
| --- | --- | --- |
| 1 | 高亮不再改写网页原有文字颜色；自动跳转页面卡住修复 | `content.js` `background.js` `sidepanel.*` |
| 2 | 悬浮栏纵坐标钳制；高亮定位策略加强 + 未定位自动重试 | `content.js` |
| 3 | 新增词表页（聚合视图）、词表导出、一键打标签 | `sidepanel.*` |
| 4 | 词表视觉重做；新增单词/词组过滤器 | `sidepanel.js` `sidepanel.css` |
| 5 | 过滤规则修正（`[A]` 这类选项字母、长句判定） | `sidepanel.js` |
| 6 | 词表去掉「网站那一行」；展开后关不掉改成受控开关 | `sidepanel.js` |
| 7 | 词表展示形态：卡片列表 → 胶囊云 | `sidepanel.css` `sidepanel.js` |
| 8 | 词条详情：详情卡片 → 贴着胶囊的就地浮层 | `sidepanel.js` `sidepanel.css` |
| 9 | 把整个侧边栏搬进网页大面板（iframe 复用） | `manifest.json` `content.*` `sidepanel.*` |
| 10 | 大面板视觉修复（导航拉长、关闭按钮被裁、点击穿透…） | `content.*` `sidepanel.css` |
| 11 | 滚轮穿透、词表页宽度不一致、取消卡片自动动效 | `content.js` `content.css` `sidepanel.css` |
| 12 | 取消卡片悬停抬升（5 处位移） | `sidepanel.css` |
| 13 | 悬停时卡片被撑长（控制栏展开）→ 常驻占位 | `sidepanel.css` |
| 14 | 代码臃肿度清理（死代码 / 死 CSS / 空置变量） | `sidepanel.*` `content.js` |

---

### 详细记录

#### 1. 高亮不再覆盖网页原有文字颜色（问题一）

- **问题**：划词标注后，网页原本的文字颜色被改掉（Lavender / Indigo / Navy 等预设直接写死白色字）。
- **原因**：`applyHighlightStyle()` 无条件执行 `element.style.setProperty("color", color.text || …, "important")`。
- **改法**：新增 `resolveHighlightTextColor(color)`，只返回三种结果之一 —— 模式 `original`（默认）返回空串、
  `black` 返回 `#000000`、`auto` 才回退到旧逻辑；调用处改为 **只有拿到非空值才写 `color`**。
  同时 `wrapTextNode()` 给高亮 `span` 记录 `dataset.hlBg / hlStyle`，`reapplyHighlightStyle()` 支持原地重着色；
  侧边栏新增「高亮文字颜色」三选一开关（保持原色 / 固定黑色 / 自动对比色）。

#### 2. 自动跳转的页面被卡住（问题二）+ 悬浮栏消失 + 高亮定位加强

- **自动跳转卡住**：`unwrapHighlights()` 原先对整页执行 `document.body.normalize()`，会把网页脚本持有的
  文本节点引用合并失效，导致那些页面卡在跳转前。**改法**：只对受影响的父节点逐个 `normalize()`。
- **某些站点看不到悬浮栏**：`localStorage['web-annotator-rail-y']` 按域名隔离，窗口变矮后旧坐标越界，
  悬浮栏被顶到视口外。**改法**：`resolveRailTop()` 读值时校验并丢弃越界值，另加 `resize` 时
  `clampRailIntoViewport()`。
- **高亮定位**：新增归一化定位（`buildNormalizedView` / `rangeFromNormalizedQuote`）与模糊兜底
  （`rangeFromFuzzyQuote`：头部锚点 + 5 种长度因子 + bigram Dice ≥ 0.85，两个候选过于接近时宁可放弃），
  定位策略按「DOM 路径 → 文本位置 → 引用 → 归一化 → 模糊」依次降级；
  失败的高亮进入 `pendingRetryMarks`，由 `MutationObserver`（900ms 防抖、最多 8 轮）自动重试。

#### 3. 新增词表页 / 词表导出 / 一键打标签

- 侧边栏第 2 个页面「词表」：把当前所有标注聚合成词条（合并同词、统计出现次数与上下文）。
- 词表可导出为 **Anki 用的表格**、也可一键复制为文本。
- 标注卡片上新增**快捷标签**：取使用频次最高的 3 个标签做成一排小胶囊，点一下就挂到该条标注上
  （`hydrateQuickTags()` / `toggleTagOnMark()`）。

#### 4. 词表视觉重做 + 单词/词组过滤

- **用户反馈**：词表过于单调、不匹配插件主题风格 → 重做视觉（复用 `.mark-card` 家族的圆角/阴影/毛玻璃语言）。
- **新增分类器** `classifyWordEntry(text)`：先把文本剥到只剩「核心字符」（`/[^0-9A-Za-z\u4e00-\u9fff]/g`），
  再按长度/词数判定 `word`（单词）/ `phrase`（词组）/ `other`（其它）。
  规则要点见第 5 条。词表页与 PDF 导出共用这一套判定，默认「只看单词与词组」。

#### 5. 过滤规则修正（三次迭代，如实记录）

| 迭代 | 规则 | 结果 |
| --- | --- | --- |
| 一 | 按**原始字符数**判断过短 | `[A]` 这种选项字母漏了过去（3 个字符） |
| 二 | 改成按剥壳后的字符数判断 | 修好了 `[A]`，但把 `out of date.` 这类长词组误杀 |
| 三（现行） | 终止标点 **且**词数 ≥ 6 才算整句；`core.length ≤ 1` 或纯数字 → 其它 | 真实数据体检：247 条标注 → 单词 160 / 词组 60 / 过滤 27（其中 23 条是 `[A]`–`[D]`） |

阈值都集中在 `classifyWordEntry()` 顶部，想调只改那一处。

#### 6. 词表精简 + 展开/收起修复

- 词条详情**去掉「网站那一行」**，只保留出现位置上下文 + 「打开原文」按钮。
- 词条原先展开后关不掉（原生 `details` 的已知毛病）→ 换成受控开关（`toggleWordCard()` 显式切换 `hidden`）。

#### 7. 词表展示形态：卡片列表 → 胶囊云

- **用户反馈**：用卡片显示单词「过于占地方」→ 改成 `.wa-chip-cloud` 胶囊云（一屏能扫很多词），
  点哪个胶囊才展开哪个的详情。

#### 8. 词条详情：详情卡片 → 就地浮层

- **用户反馈**：点开详情后整个面板滚到底部，「这个逻辑做的太差了」。
- **改法**：`openWordPopover()` / `positionWordPopover()` / `closeWordPopover()` —— 贴着胶囊就地弹出浮层，
  宽度 `min(300px, 视口-24)`、超出下方空间时向上翻转；**禁用一切 `scrollIntoView` 式的视口挪动**。
  旧的详情插槽代码已全部移除（0 残留）。

#### 9. 把整个侧边栏搬进网页大面板

- **做法**：`iframe` 复用 `sidepanel.html?surface=page-panel`，与参考项目 `ds-pp` 的 quick-panel 同构。
  同扩展源 → IndexedDB / `chrome.storage` 天然共用；样式与宿主页面零串扰。
- `manifest.json` 的 `web_accessible_resources` 放行 `sidepanel.html/css/js` + `utils.js` + `db.js`。
- 悬浮栏新增第 2 个按钮；`PAGE_PANEL_ID` + `togglePagePanel()/openPagePanel()/closePagePanel()`；
  关闭方式：右上 ×、点击面板外、`Esc`。外部点击判定**必须排除悬浮栏**，否则「点开→被当外部→立刻关」。
- **宿主形态约定**：URL 参数 `surface` → `<html data-surface="page-panel">`，CSS 用
  `html[data-surface="page-panel"]` 限定；不传参时是普通侧边栏，行为不变。以后新增宿主形态沿用此约定。

#### 10. 大面板视觉修复（先量再改）

用离线预览（真实 `content.css` + 真实标注数据桩）量出来的问题：

| 现象 | 改动前 | 改动后 |
| --- | --- | --- |
| 导航四按钮被拉长 | `.seg` 702px（每格 174px，字只占 26px） | 440px 居中（每格 109px） |
| 关闭按钮被视口裁掉 | 右边缘 753 / 视口 754，且与悬浮栏重叠 | 移入 36px 标题栏，永远在面板内 |
| 点空白会点到网页 | 只有卡片本身有大小 | 外层改成铺满视口的透明层，接住点击 |
| 面板开着网页还能滚 | 无拦截 | 见第 11 条（两道闸） |
| 内容整宽铺满 | 搜索行 694–980px | 上限 880px 居中，表单卡 720px，标注卡多列 |

#### 11. 三个具体问题

1. **滚轮穿透**：只在面板那一层挂监听不可靠 → 改成在 `document` **捕获阶段**拦
   `wheel / mousewheel / DOMMouseScroll`（iframe 内的滚动事件不会冒泡到父文档，面板内部照常滚），
   另加 `lockHostScroll()` 锁住 `html/body` 滚动（补滚动条宽度、关闭时原样还原）。
2. **词表页宽度不一致**：`.wa-chip-cloud` 左右没有内边距，而 `.sp-search` 有 12px → 词云比搜索框每边宽 12px。
   补 12px 内边距（侧边栏同步对齐）；面板模式再把词表页选项卡收成 856px。
   实测搜索框 / 词云 / 选项卡边缘全部为 `[62, 918]`。
3. **取消自动动效**：删掉 `#web-annotator-note-details` 的 0.3s 淡入淡出 + 20px 位移、
   `.sp-page` 切页 `opacity .25s`、`.wa-word-pop` 的弹出动画（含 `@keyframes`）。

#### 12. 取消卡片悬停抬升（5 处）

`.mark-card:hover`、`body.card-a / .card-b .mark-card:hover`（B 风格还有 `rotate(-0.15deg)`）、
`body.card-a .mark-card:hover::after`（角落色晕 140→160px 放大）、`.wa-chip:hover`；
并把卡片的 `transition` 置为 `none` —— 悬停只瞬间切换阴影，不位移、不淡入。

#### 13. 悬停时卡片被撑长 → 常驻占位

- **真正的原因**：A 风格的控制栏（标签行 + 删除）做成了悬停展开（`max-height: 0 → 80px` + 0.4s 过渡），
  鼠标一压上去卡片就被撑高、顶开下面的卡片。
- **改法**：位置常驻，**只切换可见性** —— `visibility: hidden` + `pointer-events: none`（悬停翻成
  `visible` / `auto`）。离散属性没有过渡，不淡也不滑。
- **实测**：悬停前后卡片高度均为 124px，同屏多张一致；代价是每张卡片恒定 +29px（那一行总得占地方）。

#### 14. 代码臃肿度清理

删掉的（全部确认无人引用）：

| 类别 | 内容 | 量 |
| --- | --- | --- |
| 调试输出 | `renderSites()` / `getHost()` 里 6 处 `console.log`（`getHost` 对每条标注都打一次，1400+ 条标注即 1400+ 行日志） | 6 行 |
| 死函数 | `isRiskyExact()`（真正在用的是 `isVeryRiskyExact()`）、`paginatePdfRows()`（PDF 分页已改为 CSS 方案） | 35 行 |
| 死 CSS | `.shortcut-list` 家族 21 条（快捷键已改为弹窗）、`.theme-toggle-row` / `.theme-label`、错放在 `sidepanel.css` 的 `.wa-details-highlight` | 24 条 / 123 行 |
| 空置变量 | `--card-note-text`、`--fav-color`、`--url-color`、`--glass-orb-display`、`--glow-shadow`（全项目只有定义、没有一处 `var()`） | 20 行 |

**注意**：`initContent` / `initSidePanel` / `initUtils` 看着像死函数，其实是**具名 IIFE**（文件主体），不要删。

体积变化：`sidepanel.css` 106,020 → 102,200 B、`sidepanel.js` 87,540 → 85,922 B、
`content.js` 83,208 → 83,011 B，合计 **−5,635 B / −185 行**，功能零改动。

---

### 设计约定（后续改动请遵守）

1. **卡片一律不要动效**：不做悬停位移/缩放，也不做自动淡入滑出；悬停只允许「瞬间切换阴影」。
2. **悬停不得改变尺寸或位置**：悬停才出现的内容（如控制栏）用**常驻占位 + 只切 `visibility`**。
3. **详情类交互就地弹出**：用贴着锚点的浮层，**禁止 `scrollIntoView`** 这类会挪动视口/面板滚动的做法。
4. **列表要紧凑**：优先胶囊等高密度形态，不堆大卡片。词汇条目只显示「出现位置 + 打开原文」。
5. **沿用既有视觉语言**：复用 `.mark-card` 家族与 `--card-*` / `--mark-color` 等既有令牌，不引入新色系。
6. **宿主形态用 `?surface=` 区分**，CSS 一律加 `html[data-surface=…]` 前缀，保证普通侧边栏不受影响。
7. **改完必须重载扩展**（`chrome://extensions` → ⟳）；**只按 F5 不生效**（内容脚本不会重新注入）。

---

### 回归测试

```bash
node tests/test-words.mjs      # 词表分类与过滤，54 项
node tests/test-anchor.mjs     # 高亮定位与模糊匹配，13 项
node tests/check-filter.mjs    # 用真实导出数据体检过滤规则（可选传 JSON 路径）
```

三个脚本都是从**源码里按花括号配对抽出真实函数**再跑，不是复制一份逻辑，所以改完代码跑它们才有意义。
当前状态：**54 / 54、13 / 13 全部通过**。

改样式（CSS）时另有两条人肉检查：括号配平（`{` 与 `}` 数量相等）、以及用离线预览量几何
（标注卡高度、网格列数、各页内容的左右边缘是否对齐）。

---

### 尚未处理（留待以后）

1. **根目录里约 1.24 MB 未被引用的文件**：`tubiao.png`（689 KB）、`tubiao_transparent.png`（490 KB）、
   `preview-icons.html`、`preview-dark.html`、`unified-proxy.rar`。不影响运行，打包时白占体积。
2. **29 个重复定义的选择器**：CSS 层叠里「后一条覆盖前一条」常是有意为之，合并属于重构，风险高于收益，
   故未动。若要做，建议一次只合并一个并每次跑几何比对。
3. 再往下削减体积需要**动结构**（例如把 card-a / card-b 两套卡片变体合并成变量驱动），属重构范畴。

---

### 回滚

项目在 git 控制下，改动前的版本就是最近一次提交：

```bash
git -C D:\pluge\xa-note status     # 查看本次全部改动
git -C D:\pluge\xa-note diff       # 查看逐行改动
git -C D:\pluge\xa-note checkout -- <文件>   # 还原某个文件
```

本次没有改动任何数据结构（IndexedDB 结构、导出格式均未变），回滚**不会丢标注与词表**。
当日用于备份的 `D:\pluge\xa-note-backup-*` 快照目录已按用户要求清理，回滚以 git 为准。
