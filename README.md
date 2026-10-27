# 个人工作台 · Personal Workbench

一个跑在自己电脑上的个人工作台：**待办、日程倒计时、专注计时、便笺灵感、链接收藏、习惯打卡、常用工具**。
零后端依赖，数据只存在本机 JSON 文件里，不联网、不上传。

![功能](https://img.shields.io/badge/deps-zero-brightgreen) ![平台](https://img.shields.io/badge/platform-Windows-0078d4) ![License](https://img.shields.io/badge/license-MIT-blue)

## 功能

- **今日概览**：待办数量、今日完成、最近日程、专注分钟数、习惯打卡数 + 完成度进度条 + 每日一句
- **待办清单**：高/中/低优先级、回车即加、双击改字、筛选未完成/已完成、一键清除已完成
- **日程倒计时**：按「天 / 小时 / 分钟」实时倒数，48 小时内高亮，过期置灰
- **专注计时**：25 / 45 / 60 分钟，圆环进度、开始暂停、最近 7 天柱状图、今日累计
- **便笺 · 灵感**：灵感 / 笔记 / 备忘三类，点击编辑，按更新时间排序
- **链接收藏**、**习惯打卡**（7 天格子 + 连续天数）、**常用工具**（网站快捷入口）
- 顶栏「导出数据 / 导入数据」一键备份与恢复

## 快速开始

需要 Node.js 18 以上，无需 `npm install`（零依赖）。

```bash
node server.js
# 打开 http://127.0.0.1:4300
```

Windows 用户也可以直接双击：

| 文件 | 用途 |
| --- | --- |
| `启动工作台.bat` | 以应用窗口打开（Edge 无地址栏模式，体验接近桌面 App） |
| `启动工作台-网页版.bat` | 用普通浏览器标签页打开 |
| `设置开机自启.bat` | 登录 Windows 后自动打开（可选） |

端口被占用会自动顺延到 4301、4302……

## 桌面版（可选）

项目包含 Electron 桌面版，支持系统托盘常驻、关窗不退出：

```bash
npm install
npm start
```

> 如果所在环境无法创建 Electron 窗口，请使用上面的网页版 / 应用窗口方式，功能完全一致。

## 打包成免安装 EXE

```bash
npm install
node scripts/build-exe.mjs
# 产物：dist/个人工作台-win32-x64/个人工作台.exe
```

## 数据

| 版本 | 位置 |
| --- | --- |
| 网页版 | `data/workbench.json` |
| 桌面版 | `%APPDATA%\个人工作台\data\workbench.json` |

- 写入采用「临时文件 + 重命名」，避免写一半损坏
- 文件损坏时自动备份到 `data/backups/`
- `data/` 已在 `.gitignore` 中，**你的真实数据不会被提交到仓库**

## 目录结构

```
server.js              本地服务（零依赖，端口冲突自动顺延）
public/                前端
  index.html
  styles.css
  app.js
desktop/main.js        Electron 主进程（内嵌服务 + 系统托盘）
scripts/
  open.mjs             拉起服务并用浏览器打开
  app.mjs              拉起服务并用 Edge 应用窗口打开
  build-exe.mjs        打包成免安装 EXE
  make-icons.cjs       生成应用图标（纯 Node，无图形库）
assets/                icon.png / tray.png
```

## License

MIT
