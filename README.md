# Ruanftrix 屏保

一款基于 Electron 的精美壁纸屏保应用，支持多种壁纸来源和个性化设置。

## 功能特性

- 多种壁纸来源
  - 网络壁纸：内置多种风格的高质量在线壁纸
  - 自定义URL：使用单张网络图片作为壁纸
  - 多张URL：使用多张网络图片轮播，用英文逗号分隔
  - 本地单图：选择本地图片文件作为固定壁纸
  - 本地文件夹：选择本地图片文件夹，自动轮播其中的图片
- 自动切换壁纸：可自定义切换间隔，支持手动切换
- 两种退出方式：仅手动关闭 / 任意动作退出
- 实时时钟显示：可开关、可选择位置和字体
- 视觉特效：优雅的淡入淡出过渡效果
- 娱乐模式：暂停屏保计时，专注娱乐不被打扰
- 预览窗口：在设置中实时预览屏保效果
- 深色主题：沉浸式深色界面设计

## 系统要求

- Windows 10 / 11
- 支持 Electron 运行的 64 位系统

## 安装

从 Release 页面下载最新的安装包，运行安装即可。

## 开发

### 环境要求

- Node.js >= 18
- pnpm >= 8

### 安装依赖

```bash
pnpm install
```

### 开发运行

```bash
pnpm start
```

### 构建安装包

```bash
pnpm run build
```

### 调试模式

```bash
pnpm start -- --dev
```

- `--dev`：开发者模式，打开 DevTools
- `--debug`：调试模式，控制台输出计时器日志

## 项目结构

```
ruanftrix-screensaver/
├── main.js              # 主进程
├── settings.html        # 设置窗口
├── settings.js          # 设置窗口逻辑
├── screensaver.html     # 屏保窗口
├── screensaver.js       # 屏保窗口逻辑
├── preview.html         # 预览窗口
├── preview.js           # 预览窗口逻辑
├── assets/              # 静态资源（图标等）
└── package.json
```

## 技术栈

- Electron
- 原生 HTML / CSS / JavaScript
- electron-builder（打包）

## 作者

Ruan Mingze <<xmt20160124@outlook.com>>

## 许可证

MIT License
