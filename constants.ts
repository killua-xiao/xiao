
// --- 核心画布配置 ---
export const CANVAS_WIDTH = 800;  // 画布宽度
export const CANVAS_HEIGHT = 450; // 画布高度
export const TILE_SIZE = 40;      // 瓦片/网格大小

// --- 物理与手感参数 (Physics & Feel) ---
export const GRAVITY = 0.6;           // 重力加速度
export const TERMINAL_VELOCITY = 12;  // 最大下落速度（防止穿模）
export const MOVE_SPEED = 6;          // 玩家最大水平移动速度
export const ACCELERATION = 0.8;      // 加速度（起步快慢）
export const FRICTION = 0.82;         // 地面摩擦力（停止快慢）
export const AIR_FRICTION = 0.95;     // 空气阻力（空中移动更滑）
export const JUMP_FORCE = -14;        // 跳跃力度（负值向上）
export const COYOTE_TIME = 6;         // 土狼时间（帧数）：允许走出平台边缘后几帧内跳跃
export const JUMP_BUFFER = 5;         // 跳跃预输入（帧数）：落地前按键的容错窗口

// --- 游泳/飞行 物理参数 ---
export const SWIM_SPEED = 5;          // 水中/太空最大速度
export const WATER_FRICTION = 0.92;   // 水中/太空阻力

export const ENEMY_SPEED = 2;         // 标准敌人速度

// --- 战斗参数 ---
export const PROJECTILE_SPEED = 12;   // 子弹飞行速度
export const PROJECTILE_SIZE = 8;     // 子弹大小
export const SHOOT_COOLDOWN = 20;     // 射击冷却（帧数）

// --- 近战参数 (铲子/特定关卡) ---
export const MELEE_RANGE = 50;
export const MELEE_COOLDOWN = 25;
export const MELEE_DURATION = 10;

// --- 道具效果 ---
export const WINE_DURATION = 600;        // 酒持续时间 (60fps下约10秒)
export const WINE_SPEED_MULTIPLIER = 1.4;// 酒后速度倍率
export const WINE_JUMP_MULTIPLIER = 1.2; // 酒后跳跃倍率

// --- 玩家基础属性 ---
export const PLAYER_WIDTH = 30;
export const PLAYER_HEIGHT = 30;
export const MAX_HEALTH = 3;    // 初始最大生命值
export const REVIVE_COST = 1;   // 复活所需金币

// --- 颜色配置表 (Palette) ---
export const COLORS = {
  // 背景色
  sky: '#87CEEB',
  skyDark: '#1E3A8A', // 夜晚
  sea: '#006994',     // 深海
  tomb: '#422006',    // 古墓
  spaceBg: '#020617', // 太空
  arcticBg: '#E0F2FE',// 北极（隐藏关）
  
  // 地形
  ground: '#4ADE80',
  groundDark: '#14532D',
  rock: '#64748B',
  sand: '#D97706',
  sandWall: '#FCD34D',
  asteroid: '#475569',
  ice: '#BAE6FD',

  // 场景元素
  caveBg: '#171717',
  caveGround: '#404040',
  caveGroundDark: '#262626',
  caveSpike: '#737373',
  
  // 火车关卡
  trainBg: '#0F172A', 
  trainCar: '#475569', 
  trainWindow: '#FEF08A', 
  trainWheel: '#1E293B', 

  // 角色相关
  dirt: '#854D0E',
  bear: '#FFFFFF',      // 北极熊白
  bearFace: '#FCD34D',  // 脸部颜色
  bearFaceDrunk: '#EF4444', // 醉酒脸红
  ninjaBody: '#111827', // 忍者装
  ninjaSash: '#DC2626', // 忍者红带
  astroSuit: '#E2E8F0', // 太空服
  astroVisor: '#38BDF8',// 面罩
  
  // 武器与特效
  tail: '#22D3EE',      // 人鱼尾巴
  gun: '#4B5563', 
  shovel: '#A3A3A3', 
  shovelHandle: '#78350F',
  shuriken: '#E2E8F0', 
  laserGun: '#10B981', 
  laserBeam: '#F472B6', 
  projectile: '#FFF', 
  coin: '#FACC15',
  coinShine: '#FEF08A',
  wine: '#9333EA', 
  wineLabel: '#F3E8FF',
  potion: '#EF4444', 
  trophy: '#FBBF24', 
  trophyBase: '#78350F',
  meteor: '#64748B', 
  
  // 敌人颜色定义
  enemy: '#DC2626',      // 红色 (普通)
  enemyTank: '#7C3AED',  // 紫色 (坦克)
  enemyFast: '#EA580C',  // 橙色 (快速)
  enemyBat: '#4C1D95',   // 深紫 (蝙蝠)
  enemySlime: '#10B981', // 绿色 (史莱姆)
  enemyFish: '#F97316',  // 橙鱼
  enemySkeleton: '#E5E5E5', // 骷髅白
  enemyMummy: '#FDE68A', // 木乃伊黄
  enemySpider: '#171717', // 蜘蛛黑
  enemyZombie: '#65A30D', // 僵尸绿
  enemyBird: '#E2E8F0',   // 鸟灰
  enemyAlien: '#84CC16',  // 外星绿
  enemyUfo: '#94A3B8',    // UFO灰
  ufoLight: '#38BDF8',    // UFO光
  spiderEye: '#DC2626',   // 蜘蛛眼
  
  // 危险与交互物
  spike: '#999999',
  lava: '#EF4444',
  lavaSurface: '#FCA5A5',
  flagPole: '#D1D5DB',
  flag: '#DC2626',
  gateDark: '#374151',
  gateLight: '#9CA3AF',

  // 装饰性星球
  planetRed: '#EF4444',
  planetBlue: '#3B82F6',
  planetRing: '#FCD34D'
};
