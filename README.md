# xa-note

一个轻量级、无服务器依赖的 Chrome 浏览器网页标注扩展。

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## 功能预览

- 文本高亮标注：背景、下划线、波浪线、删除线
- 12 种预设颜色 + HSV 自定义取色器
- 标签系统：创建标签、筛选标注、为标注快速增删标签
- 页面内备注卡：点击高亮即可编辑备注和标签
- 收藏功能：标记重要内容
- 全局搜索：支持文字、备注、标题、URL
- 网站分类：按网站统计标注，可编辑网站名称和备注
- 数据导入导出：JSON 备份、CSV 表格、浏览器打印 PDF
- 外观设置：深色主题、主题色、卡片风格、字体选择
- 快捷键支持：添加高亮、打开侧边栏、跳转备注

## 安装使用

### 开发者模式安装

1. 打开 Chrome 浏览器，访问 `chrome://extensions`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目文件夹

### 基本使用

| 操作 | 方法 |
|------|------|
| 添加高亮 | 选中文字 → 点击浮动工具栏 / 右键菜单 / `Alt+S` |
| 打开侧边栏 | 点击扩展图标 / `Alt+W` |
| 打开高亮详情 | 点击页面内已有高亮 |
| 跳转到上一个高亮 | `Alt+N` |
| 保存并关闭备注卡 | 备注卡打开时按 `Alt+N` |

## 功能特性

### 标注样式

- **背景高亮** - 经典的文字背景色标注
- **下划线** - 简洁的下划线标注
- **波浪线** - 突出的波浪下划线
- **删除线** - 删除线样式标注

### 颜色系统

内置 12 种精选颜色：

| Teal | Gold | Coral | Rose | Lavender | Indigo |
|------|------|-------|------|----------|--------|
| ![#5ee5e5](https://via.placeholder.com/15/5ee5e5/5ee5e5.png) | ![#facc15](https://via.placeholder.com/15/facc15/facc15.png) | ![#fb923c](https://via.placeholder.com/15/ffb923c/fb923c.png) | ![#fb7185](https://via.placeholder.com/15/fb7185/fb7185.png) | ![#a78bfa](https://via.placeholder.com/15/a78bfa/a78bfa.png) | ![#818cf8](https://via.placeholder.com/15/818cf8/818cf8.png) |

支持添加自定义颜色，也可以替换当前默认颜色。自定义取色器使用 HSV 色彩空间，适合精细调整高亮色。

### 备注与标签

- 点击页面内高亮会打开备注卡，可直接编辑批注。
- 备注卡和侧边栏都可以为标注增删标签。
- 标签筛选支持普通标签，也支持网站分类生成的站点标签。

### 网站分类

- 标注会自动按网站域名统计。
- 可为网站设置显示名称和备注。
- 网站名称可同步为标签，方便按资料来源归档。

### 导入导出

- **JSON**：完整备份和恢复标注、标签、颜色设置。
- **CSV**：导出表格，便于在 Excel 或其他工具中整理。
- **PDF**：打开浏览器打印页，可选择保存为 PDF；支持标签、网页、备注筛选。

### 外观设置

- 支持深色主题。
- 支持主题色切换。
- 支持「流光」「素笺」两种卡片风格。
- 支持默认字体和衬线字体切换。

### 数据存储

所有标注数据存储在浏览器本地 **IndexedDB**，无需服务器，保护你的隐私。

支持 JSON 格式导入/导出，方便备份和迁移。PDF 导出依赖浏览器打印能力，不需要额外服务。

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt+S` | 添加高亮标注 |
| `Alt+W` | 打开侧边栏 |
| `Alt+N` | 跳转到上一个高亮 / 保存并关闭卡片 |

可在扩展设置页面自定义快捷键。

## 技术栈

- **Chrome Extension Manifest V3**
- **原生 JavaScript** - 无框架依赖，轻量高效
- **IndexedDB** - 本地数据持久化
- **Chrome Side Panel API** - 侧边栏管理界面
- **TextQuoteSelector** - 标准化的文本定位格式
- **浏览器打印** - PDF 导出

## 项目结构

```
xa-note/
├── manifest.json      # 扩展配置
├── background.js      # Service Worker
├── content.js         # 内容脚本
├── content.css        # 页面内样式
├── sidepanel.html     # 侧边栏页面
├── sidepanel.js       # 侧边栏逻辑
├── sidepanel.css      # 侧边栏样式
├── db.js              # IndexedDB 数据库
├── utils.js           # 工具函数
├── icon*.png          # 扩展图标
├── preview-*.html     # UI 预览页面
├── tubiao*.png        # 图标素材
└── README.md
```

## 开发说明

- 当前项目无需安装依赖，也没有构建步骤。
- 修改代码后，在 `chrome://extensions` 中点击扩展的「重新加载」即可测试。
- 所有标注数据默认存储在当前浏览器本地 IndexedDB 中。

## License

MIT License - 可自由使用和修改

## 联系方式

如有问题或建议，请联系：3193095702@qq.com

---

**xa-note** - 让网页标注更简单
