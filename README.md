[![Build APK](https://github.com/Vanclab/modu-reader/actions/workflows/build.yml/badge.svg)](https://github.com/Vanclab/modu-reader/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Vanclab/modu-reader)](https://github.com/Vanclab/modu-reader/releases)
[![minSdk](https://img.shields.io/badge/Android-5.0%2B-green.svg)](https://developer.android.com/about/versions/lollipop)

# 墨读 · Android 本地阅读器

一个纯本地书籍/漫画阅读 App：WebView 外壳 + 网页界面 + 原生桥接（文件选择、PDF 渲染、本地存储）。
不联网、无账号、书架数据全部保存在应用私有目录。

## 版本

- 正式版 **v1.0**（versionCode 100）
- 签名：沿用调试密钥 `~/.dsh/debug.keystore`，可与历史版本原地覆盖升级（不会丢数据）

## 目录结构

```
apk-reader/
├── AndroidManifest.xml        清单（图标、主题、Activity）
├── build.sh                   一键构建：javac → dx → aapt → zipalign → apksigner
├── res/mipmap-*/              应用图标（48/72/96/144/192）
├── assets/
│   ├── icon-master.png        图标母版 1024×1024
│   └── www/                   前端
│       ├── index.html         页面结构
│       ├── style.css          全部样式
│       ├── app.js             书架、导入、多选、设置、目录
│       ├── reader.js          阅读器（分章、翻页、EPUB、CBZ、PDF）
│       └── jszip.min.js       ZIP/EPUB 解析
└── src/com/dsh/reader/
    └── MainActivity.java      原生桥（SAF 选文件、读文件、PDF 渲染、存档读写）

## 功能

**书架**
- 书架页：按系列分组，每行 3 本，未归系列收在「未分组」
- 书库页：继续阅读、系列横滑、单册网格
- 长按书封进入多选：重命名 / 加入系列 / 改封面 / 删除（批量）
- 长按系列卡片：改系列名 / 换系列封面 / 解散系列
- 标签页：按标签聚合，点开即书单

**导入**
- 支持 EPUB、TXT、Markdown、PDF、CBZ、ZIP
- MOBI / AZW3 / AZW4 / RAR / 7Z 可入库但暂不能解析（会明确提示）
- 导入时可指定系列、标签

**阅读**
- 自动分章：识别「第X章/节/卷/回」、序章、楔子、番外、Chapter N；认不出来按 4000 字切块
- 上下滚动 / 左右翻页两种模式，翻页可跟手拖动
- 目录、章节间跳转、章末提示「已到底」
- EPUB 内嵌图片解析并铺满行宽，点击看大图；封面页自动置顶；插图在翻页模式独占一页
- PDF 用系统 PdfRenderer 逐页渲染；漫画按图片顺序翻页

**外观**
- 背景色（6 预设 + 相册自定义图）、文字色（6 预设）、字号、行距、边距、字重、翻页方式
- 默认设置对所有书生效；在书里改过的书会保存一份完整快照，从此独立，不受默认影响
- 可随时「恢复默认阅读设置」

**沉浸式**
- 默认隐藏顶栏与进度条，点屏幕中间唤出，滑动自动收起
- 底部常显：`第n章/共n章`、整书百分比、当前时间

## 构建

```bash
cd apk-reader
./build.sh            # 产出 build/app.apk
```

依赖（Ubuntu 24.04 arm64）：
`openjdk-17-jdk-headless`、`aapt`、`apksigner`、`zipalign`、`dalvik-exchange`、`android-sdk-platform-23`

## 已知限制

- 编译目标 API 23，因此没有自适应图标（adaptive-icon），也没有 AndroidX / Material 组件
- MOBI / AZW3 / AZW4 / RAR / 7Z 未实现解析
- 左右翻页模式的跟手拖动仅对文字生效，漫画/PDF 为松手翻页

## 协议

本项目基于 [MIT License](LICENSE) 开源。
图标为项目自绘图形，字体使用 Noto Serif CJK（SIL Open Font License）。
