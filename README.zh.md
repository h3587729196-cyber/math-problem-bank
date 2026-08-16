# 难题库 · Math Problem Bank

[English](README.md) | 中文

> **本地优先（local-first）的图片化数学题库** —— 把题目与解题思路都保存为图片：一题多解、解法剧场、FSRS-Lite 间隔复习、Three.js 方法-题目知识图谱、局域网同步。所有数据存储于浏览器 IndexedDB，无后端、无上传。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite)](https://vite.dev)
[![Release v1.10.0](https://img.shields.io/badge/Release-v1.10.0-2ea44f?logo=github)](https://github.com/h3587729196-cyber/math-problem-bank/releases/tag/v1.10.0)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/h3587729196-cyber/math-problem-bank/pulls)

## 为什么做这个项目

拍了 100 道难题，当场懂了，考试前全忘了。这个应用把「截图堆」变成一套 **方法 ↔ 题目知识系统**：每道题挂到它用到的方法上，每个方法反查它解决过的题目，再配合记忆曲线排期回看——让「当时怎么卡住、怎么突破」沉淀为可复用的招式。

## 功能亮点

### 图片化题库
题干图片 + **一题多解**：每组解法可独立命名、记录多条文字步骤、附一张思路图，并可标记「简易度（简单/适中/复杂）」与「妙解」；支持标题 / 来源 / 难度 / 状态 / 标签 / 解法数 / 关键字筛选与搜索，另有独立的「破题思路」搜索池。

### 解法剧场
从题目详情一键进入：把任一解法按步骤逐帧回放，动画与页面无缝衔接、可随时打断；支持切换解法、拖动进度、倍速播放与键盘方向键操控。

### 招式网络（Three.js 3D 知识图谱）
方法与题库的力导向知识图谱：方法 = 蓝色发光球体（越大关联越多），题目 = 状态色小球（绿/橙/红），关联按角色（核心/辅助/延伸）以霓虹连线区分；单击高亮邻域，**双击飞入节点内部**展开步骤链 / 解法环，Esc 返回全景。

### FSRS-Lite 间隔回看 + 强制思考
FSRS 启发的记忆模型（难度 / 稳定性 / 记忆强度，目标保持率 90%）：**单卡专注会话先强制思考 20 秒**，倒计时结束才出现「查看答案」，再按「忘了 / 有点模糊 / 做出来了」三级评分，分别塌缩、微调、倍增间隔；**连续做对 3 次自动毕业**。

### 认知回看
难度 4–5 的难题单独成池，每次回看记录「这次觉得的难度」，自动绘制**认知曲线**（难度随时间的变化）；觉得变简单则降档并拉长间隔，直到自动毕业。

### 方法库 & 题↔方法双向关联
方法含适用信号、操作步骤、说明与易错点（支持图片）；显式关联带角色与备注，题目侧、方法侧双向管理；方法掌握度 5 级（了解 → 融会贯通），并按使用情况自动分类（高频 / 稳定 / 开始生疏 / 闲置…）。

### 巧思库
所有解法中的破题步骤都可标星并设置巧妙程度（1–5），自动汇入巧思库；支持模糊搜索、按程度排序，点击任意条目即可溯源回原题。

### 数据分析报告
专业学习报告：核心指标、状态趋势、攻克用时、薄弱点 Top、方法掌握度 / 难度 / 巧思 / 活跃度分析；可按「本月 / 近 90 天 / 全部 / 自定义」筛选并对比上一期，按 A4 排版，一键打印 / 导出 PDF。

### 局域网同步
电脑与手机连同一 WiFi 自动互通：数据存于本地服务端，新设备打开自动拉取、编辑后自动推送；备份面板支持手动「从其他设备合并 / 上传当前题库」。

### 备份与恢复
本地自动备份（保留最近 N 份）、ZIP 完整导出 / 导入（含图片原图与页面设置）、兼容旧版 JSON 备份、一键清空。

## 动态粒子背景

Canvas 驱动的交互式物理粒子场，作为整个应用的氛围背景：

- **弹性粒子场** —— 约 4500 颗单色粒子按六角蜂窝网格铺满视口，每颗粒子都有锚点；静止时安静待位，仅带极淡的集体呼吸微光（批量 `Path2D` 填充，支撑 4500+ 粒子依旧流畅）；
- **三重指针律动** —— 光标移动触发三层叠加效果：高斯力场将附近粒子冲开（尾流拖行 + 前方排开 + 旋涡）；快速移动时在路径上激发向外扩散的圆形涟漪，粒子被一波波推开；光标处喷射单色沙粒，随尾流飘出渐隐；
- **弹性回位** —— 光标离开后，弹簧把粒子拉回锚点，轻微回弹后复原；
- **自适应与无障碍** —— 深色主题为淡白光点（`lighter` 泛光）、浅色主题为深灰微尘；粒子密度随视口缩放，页面隐藏时暂停渲染，`prefers-reduced-motion` 时渲染静态帧。

## 技术栈

- **React 19 + TypeScript + Vite** —— 应用主体
- **Motion** —— 弹簧与手势动效
- **Three.js** —— 招式网络三维引擎（按需加载，不影响首屏）
- **IndexedDB** —— 题目 / 方法 / 图片 Blob 全部保存在本机浏览器

## 下载与安装（v1.10.0）

从[最新 Release](https://github.com/h3587729196-cyber/math-problem-bank/releases)下载开箱即用的安装包：

| 文件 | 说明 |
| --- | --- |
| `Math-Problem-Bank-v1.10.0-win-x64-setup.exe` | Windows 安装程序 —— 安装到 `%LOCALAPPDATA%\MathProblemBank`，自动创建桌面与开始菜单快捷方式并启动应用 |
| `Math-Problem-Bank-v1.10.0-win-x64-portable.zip` | 便携版 —— 解压到任意位置，双击 `start.bat` 即可运行 |

> 两个包均 100% 离线运行，仅需 [Node.js ≥ 20](https://nodejs.org)。
> 安装程序未签名，首次运行 Windows SmartScreen 可能提示，选择「仍要运行」即可。

## 快速开始

```bash
npm install
npm run dev        # 开发模式，默认 http://localhost:5173
npm run build      # 类型检查 + 生产构建
npm run preview    # 预览生产构建
npm run serve      # 本地部署：零依赖静态服务，默认 http://localhost:5173
```

Windows 下直接双击根目录 **`启动本地版.bat`**：自动构建生产版本、启动本地服务并打开浏览器；5173 被占用时自动顺延（5174、5175…），数据与开发模式互通。手机端可连同一 WiFi 扫码访问。

## 数据与隐私

- 所有数据（含图片）仅存于浏览器 IndexedDB（数据库名 `math-problem-bank`），**不经过任何服务器**；
- 录入图片自动压缩（最长边 1920px、质量 0.85），SVG / GIF 保持原样；
- 文字仅作元数据（标题、来源、标签、步骤说明），题目与思路本体均为图片；
- 局域网同步仅在**同一 WiFi** 下通过本地服务端进行。

## 自动化验证

```bash
npm run check
```

- `scripts/audit.mjs`：无头 Chrome 检查图片加载、布局溢出、毛玻璃降级、深色模式、粒子背景、移动端适配等 20 余项指标；
- `scripts/e2e.mjs`：端到端走查新增 → 编辑 → 搜索 → 回看 → 解法剧场 → 招式网络 → 认知回看 → 数据分析 → 局域网同步等完整链路。

## 目录结构

```text
src/
  db/            IndexedDB 封装与预置种子数据
  hooks/         数据仓库、Blob URL、媒体查询
  components/    题库、详情、表单、方法库、招式网络、报告等页面与组件
  components/ui/ 通用 UI（Sheet、灯箱、分段控件、标签输入…）
  styles/        设计系统（明暗主题、毛玻璃、排版、减少动效）
  utils/         图片处理、压缩、ZIP、复习排期等工具
scripts/         serve / netinfo / bridge / audit / e2e / visual-check
```

## 更新日志

### v1.10.0 —— 动态粒子背景（重点更新）
- **动态粒子背景（本次重点）**：物理驱动的弹性粒子场（蜂窝网格约 4500 颗粒子），三重指针律动——高斯尾流冲刷、扩散涟漪、沙流喷射；弹簧回位、双主题自适应与无障碍降级；
- **安装包**：首个 Windows 发行版——自解压 `setup.exe` 安装程序与便携 ZIP 包；
- 官方双语文档、MIT 许可与项目元数据。

## License

[MIT](LICENSE) © 2026 math-problem-bank contributors
