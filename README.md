# ✨ xa-note

一个轻量级、无服务器依赖的 Chrome 浏览器网页标注扩展。

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## 📸 功能预览

- 📝 文本高亮标注（背景、下划线、波浪线、删除线）
- 🎨 12种精美预设颜色 + 自定义取色器
- 🏷️ 标签系统，灵活分类管理
- 📌 收藏功能，快速定位重要内容
- 💬 备注批注，为标注添加笔记
- 🔍 全局搜索，支持文字、备注、标题、URL
- 🌐 网站分类，自动按网站统计
- 📥 导入/导出 JSON 备份
- ⌨️ 快捷键支持
- 🌙 深色/浅色主题
- 📱 侧边栏管理界面

## 🚀 安装使用

### 开发者模式安装

1. 打开 Chrome 浏览器，访问 `chrome://extensions`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目文件夹

### 使用方法

| 操作 | 方法 |
|------|------|
| 添加高亮 | 选中文字 → 点击浮动工具栏 / 右键菜单 / `Alt+S` |
| 打开侧边栏 | 点击扩展图标 / `Alt+W` |
| 跳转到上一个高亮 | `Alt+N` |

## 🎨 功能特性

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

支持自定义颜色，HSV 色彩空间精准调色。

### 数据存储

所有标注数据存储在浏览器本地 **IndexedDB**，无需服务器，保护你的隐私。

支持 JSON 格式导入/导出，方便备份和迁移。

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt+S` | 添加高亮标注 |
| `Alt+W` | 打开侧边栏 |
| `Alt+N` | 跳转到上一个高亮 / 保存并关闭卡片 |

可在扩展设置页面自定义快捷键。

## 🛠️ 技术栈

- **Chrome Extension Manifest V3**
- **原生 JavaScript** - 无框架依赖，轻量高效
- **IndexedDB** - 本地数据持久化
- **Shadow DOM** - UI 隔离，避免样式污染
- **TextQuoteSelector** - 标准化的文本定位格式

## 📁 项目结构

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
└── README.md
```

## 📄 License

MIT License - 可自由使用和修改

## 📧 联系方式

如有问题或建议，请联系：3193095702@qq.com

---

**xa-note** - 让网页标注更简单 ✨
