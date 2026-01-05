
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

// --- 颜色配置表 (Palette - Updated for Realism) ---
export const COLORS = {
  // 背景色 (会被渐变替代，作为Fallback)
  sky: '#38BDF8', // 更自然的蓝
  skyDark: '#0F172A',
  sea: '#082F49',     
  tomb: '#271503',    
  spaceBg: '#020617', 
  arcticBg: '#F0F9FF',
  
  // 地形
  ground: '#65A30D', // 草地绿
  groundTop: '#84CC16', // 草地亮面
  groundDark: '#3F6212', // 泥土暗部
  rock: '#475569',
  sand: '#D97706',
  sandWall: '#F59E0B',
  asteroid: '#334155',
  ice: '#E0F2FE',

  // 场景元素
  caveBg: '#0A0A0A',
  caveGround: '#262626',
  caveGroundDark: '#171717',
  caveSpike: '#525252',
  
  // 火车关卡
  trainBg: '#0F172A', 
  trainCarBody: '#F1F5F9', // 更有质感的白
  trainCarStripe: '#2563EB', 
  trainWindow: '#60A5FA', 
  trainWheel: '#0F172A', 
  trainConnector: '#1E293B',

  // 角色相关
  dirt: '#713F12',
  bear: '#F8FAFC',      
  bearFace: '#FDE047',  
  bearFaceDrunk: '#EF4444', 
  ninjaBody: '#111827', 
  ninjaSash: '#DC2626', 
  astroSuit: '#E2E8F0', 
  astroVisor: '#0EA5E9',
  
  // 武器与特效
  tail: '#06B6D4',      
  gun: '#374151', 
  shovel: '#94A3B8', 
  shovelHandle: '#78350F',
  shuriken: '#E2E8F0', 
  laserGun: '#10B981', 
  laserBeam: '#F43F5E', 
  projectile: '#FFFFFF', 
  coin: '#FACC15',
  coinShine: '#FEF08A',
  wine: '#7E22CE', 
  wineLabel: '#F3E8FF',
  potion: '#EF4444', 
  trophy: '#F59E0B', 
  trophyBase: '#78350F',
  meteor: '#475569', 
  
  // 敌人颜色定义
  enemy: '#DC2626',      
  enemyTank: '#6D28D9',  
  enemyFast: '#EA580C',  
  enemyBat: '#4C1D95',   
  enemySlime: '#059669', 
  enemyFish: '#F97316',  
  enemySkeleton: '#E2E8F0', 
  enemyMummy: '#FEF3C7', 
  enemySpider: '#0F172A', 
  enemyZombie: '#4D7C0F', 
  enemyBird: '#CBD5E1',   
  enemyAlien: '#65A30D',  
  enemyUfo: '#64748B',    
  ufoLight: '#38BDF8',    
  spiderEye: '#DC2626',   
  
  // 危险与交互物
  spike: '#737373',
  lava: '#DC2626',
  lavaSurface: '#FCA5A5',
  flagPole: '#9CA3AF',
  flag: '#EF4444',
  gateDark: '#1F2937',
  gateLight: '#9CA3AF',

  // 装饰性
  flowerPetal: '#F9A8D4',
  flowerCenter: '#FDE047',
  planetRed: '#EF4444',
  planetBlue: '#3B82F6',
  planetRing: '#FDE047',
  earthWater: '#1D4ED8',
  earthLand: '#15803D',
  stationPillar: '#475569',
  stationRoof: '#1E293B'
};
