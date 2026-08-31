# 🛠️ 小熊大冒险 - 核心技术架构文档 (Technical Documentation)

这份文档旨在为希望了解《小熊大冒险》底层实现细节、想要基于此进行二次开发或优化引擎性能的开发者提供技术向导。

## 1. 系统架构概述 (Architecture Overview)

本游戏刻意摒弃了成熟的第三方游戏引擎（如 Phaser, PixiJS），主要出于两个目的：
1. **轻量化**：以最小的体积直接运行在任何现代浏览器。
2. **纯粹的技术展示**：展示 React 与 原生 Canvas API 混合调用的良好实践。

架构主要被切分为两大并行层：
- **UI 操作层 (React / DOM)**: 负责菜单生命周期控制（主菜单、过场剧情、失败结算界面、HUD金币血量显示）。借助 React 的组件和状态驱动特性完成。
- **高性能渲染层 (Canvas)**: 所有的物理运算、动画更新与 2D 贴图均实现在 `<canvas>` 中，通过原生的 `requestAnimationFrame` 发起循环，脱离 React State 的调度（避免 React 重渲染造成的掉帧）。

---

## 2. 核心模块解析 (Core Modules)

### 2.1 游戏主循环 (Main Game Loop)
位于 `components/GameCanvas.tsx`，核心方法为 `update()`（物理逻辑）与 `draw()`（视觉渲染）。
- **帧率解耦**：物理相关的运算虽然绑定在 `rAF` 之下，但利用了 `hitStopRef` 来实现受击时的 "顿帧" 冲击效果（Hitstop），赋予了打击感。
- **独立时间步长**：通过 `timeRef` 管理系统运行的刻度，用于处理子弹冷却、粒子生命周期衰减、云朵视差滚动等。

### 2.2 ECS (Entity-Component-System) 微架构思想
虽然代码结构未使用纯粹的 ECS，但借鉴了其设计模式，所有对象均定义在 `types.ts`。
- `Entity` 接口包含了世间万物的基础属性。
- `Player` 接口继承了 `Entity`，并挂载了跳跃缓冲计时器、土狼时间计时器和特殊状态机变量。
这样一来，在主循环中的碰撞检测 `checkCollision` 能够实现极为通用化的高性能剔除。

### 2.3 手感优化机制 (Juice & Game Feel)
"手感"是平台动作类游戏的灵魂。在常数的约束下 (`constants.ts`)，引擎中设计了以下物理 Hack 逻辑：
1. **Coyote Time (土狼时间)**：当玩家滑出平台边缘的短短几帧内，只要按跳跃，依然可以起跳。避免了玩家因"手慢"而产生的挫败感。
2. **Jump Buffer (跳跃预输入缓冲)**：在玩家即将落地的前几帧输入跳跃，系统会将跳跃指令缓存并在落地的第一帧自动触发，提高了连跳的流畅度。
3. **Squash & Stretch (挤压与拉伸渲染)**：起跳、落地以及呼吸状态，通过对 `renderScale.x` 和 `y` 设置非线性的差值，呈现出弹性的视觉反馈，而非死板的平移。

---

## 3. 性能优化 (Performance Optimization)

鉴于在单画布中同时处理大量的敌人循环、粒子系统，因此必须利用底层 API 优化：

### 3.1 视口剔除 (Frustum/Viewport Culling)
针对超长关卡（宽度超过 6000px），将物体的渲染与碰撞检测与相机的世界坐标 `cameraRef.current.x` 进行比较。只渲染位于屏幕视野范围 `[camera.x - buffer, camera.x + CANVAS_WIDTH + buffer]` 内的实体。

### 3.2 粒子对象池 (Particle Object Pool)
在下雪、下雨天气以及怪物爆裂时会产生大量的粒子对象。系统使用了 **对象池模式** (`particlePoolRef`) 预分配了 300 个大小确定的对象内存结构。
生成粒子时寻找 `active: false` 的插槽，生命周期结束时不销毁对象，而是设定为回收，避免了内存的频繁分配和垃圾回收(GC)导致的偶发性卡顿。

### 3.3 离屏渲染 (Off-screen CanvasRendering)
背景的天际线与环境底色，由于像素覆盖率巨大（Fill-rate），每帧利用主线程重绘渐变会极为耗时。项目使用了 `bgCanvasRef` 和 `lightingCanvasRef` 创建双缓冲离屏 Canvas。在初始化 (`useEffect`) 时绘制一次复杂的静态图层，后续的帧循环中仅通过 `ctx.drawImage` 将此画卷切片绘制到屏上。

### 3.4 空间网格碰撞 (Spatial Grid)

碰撞 broad-phase 使用均匀网格（`engine/collision.ts` 中的 `SpatialGrid`），单元大小与 `TILE_SIZE` 对齐。每帧重建网格后，子弹、玩家与实体的交互仅查询相关单元内的候选对象，避免对全关卡实体做 O(n) 遍历。

### 3.5 扫掠 AABB (Swept Collision)

高速子弹在每帧位移较大时，使用 `checkSweptCollision` 沿运动轨迹做 broad-phase 检测，避免穿透薄墙或小型敌人。

### 3.6 输入与刷怪模块

- `engine/input.ts` — 键盘 / 手柄 / 触屏输入归一化
- `engine/spawner.ts` — 刷怪笼同屏存活上限
- `engine/renderHelpers.ts` — Canvas DPR 适配与存档点 HUD
- `engine/levelValidation.ts` — 开发模式下关卡数据 invariant 校验

单元测试位于 `engine/*.test.ts`，运行 `npm run test`。

---

## 4. 目录结构指南 (Directory Structure)

```text
/
├── engine/              # 【新增】可复用引擎模块
│   ├── collision.ts     # AABB + 扫掠检测 + SpatialGrid
│   ├── input.ts         # 统一输入 helpers
│   ├── spawner.ts       # 刷怪笼存活上限
│   ├── renderHelpers.ts # Canvas 适配与 HUD 绘制
│   ├── levelValidation.ts
│   ├── ParticlePool.ts  # 粒子对象池
│   ├── StatsBuffer.ts   # 分数/金币批量同步缓冲
│   ├── camera.ts        # 相机跟随与震屏
│   ├── spawnEnemy.ts    # 刷怪工厂
│   └── entityLifecycle.ts
├── components/
│   └── GameCanvas.tsx   # Canvas 渲染引擎、物理判定、控制逻辑
├── audio.ts             # Web Audio API 封装，基于正弦波生成 8bit 音效
├── constants.ts         # 游戏全局常数字典（重力、速度、尺寸基准）
├── levels.ts            # 关卡工厂 (纯数据)，包含 7个大地图+1个隐藏地图
├── types.ts             # TypeScript 类型定于，TS接口与枚举声明
├── App.tsx              # 【核心】游戏状态机、React UI 界面与生命周期管理
└── index.tsx            # Vite 默认的 React 根挂载层
```

---

## 5. 关卡编辑器扩展建议 (Extensibility)

目前项目中的地图由 `levels.ts` 下的帮助类（如 `createPlatform`, `createEnemy`）以代码硬编码方式写入。
若需实现**可视化的地图编辑器**，建议：
1. 将 `LevelData` 的读取流改造为 `fetch('/api/map.json')`。
2. 使用外部编辑工具（如 Tiled）以 JSON 格式输出 Tile 信息。
3. 在 `GameCanvas.tsx` 中增加并解析 TileArray 进而实例化 `Entity` 数组。
