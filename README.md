# Gemini Navigator

一个 Chrome 浏览器扩展，为 Gemini 网页版添加对话目录导航和 PDF 导出功能。

## ✨ 功能特性

- **📑 对话目录** - 在页面右侧显示可点击的对话目录，快速跳转到任意对话位置
- **📄 PDF 导出** - 一键将完整对话导出为 PDF 文档，方便分享和存档

## 🚀 安装方法

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择 `gemini-navigator` 文件夹

## 📖 使用说明

1. 安装后访问 [gemini.google.com](https://gemini.google.com)
2. 在页面右侧会自动出现对话目录面板
3. 点击目录项可快速跳转到对应对话
4. 点击"导出 PDF"按钮下载对话记录
5. 双击目录标题可折叠面板

## 🛠 技术栈

- Chrome Extension Manifest V3
- html2pdf.js
- MutationObserver

## 📁 项目结构

```
gemini-navigator/
├── manifest.json          # 扩展配置
├── content.js             # 内容脚本
├── styles.css             # 样式文件
├── icons/                 # 图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── lib/
    └── html2pdf.bundle.min.js
```

## 📄 License

MIT
