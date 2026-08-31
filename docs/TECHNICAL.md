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
- **帧率解耦**：物理以固定 `60Hz` 时间步运行（`FIXED_DT_MS`），渲染跟随显示器刷新率。受击时仍用 `hitStopRef` 做顿帧。
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

---

## 4. 目录结构指南 (Directory Structure)

```text
/
├── components/
│   └── GameCanvas.tsx   # Canvas 主循环编排（固定 60Hz 物理步 + 渲染）
├── game/
│   ├── collision.ts     # AABB 碰撞、视口剔除、实体深拷贝
│   ├── enemies.ts       # 敌人数值表（关卡放置与刷怪笼共用）
│   ├── particles.ts     # 粒子对象池
│   ├── input.ts         # 键盘 / WASD / 手柄统一成数字输入
│   └── stars.ts         # 预计算星空，避免每帧随机
├── audio.ts             # Web Audio API 封装
├── constants.ts         # 物理常数与固定时间步
├── levels.ts            # 关卡数据
├── types.ts             # 接口与枚举
├── App.tsx              # 游戏状态机与 HUD
└── index.tsx            # React 根挂载
```

---

## 5. 关卡编辑器扩展建议 (Extensibility)

目前项目中的地图由 `levels.ts` 下的帮助类（如 `createPlatform`, `createEnemy`）以代码硬编码方式写入。
若需实现**可视化的地图编辑器**，建议：
1. 将 `LevelData` 的读取流改造为 `fetch('/api/map.json')`。
2. 使用外部编辑工具（如 Tiled）以 JSON 格式输出 Tile 信息。
3. 在 `GameCanvas.tsx` 中增加并解析 TileArray 进而实例化 `Entity` 数组。
