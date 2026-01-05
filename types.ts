
// 游戏状态枚举
export enum GameStatus {
  MENU = 'MENU',             // 主菜单
  INTRO = 'INTRO',           // 开场动画
  PLAYING = 'PLAYING',       // 游戏进行中
  GAME_OVER = 'GAME_OVER',   // 游戏结束
  LEVEL_COMPLETE = 'LEVEL_COMPLETE', // 关卡完成
  VICTORY = 'VICTORY',       // 通关（保留字段）
  OUTRO = 'OUTRO',           // 结局动画
  CREDITS = 'CREDITS',       // 感谢名单（包含隐藏秘籍输入）
  REVIVE_PROMPT = 'REVIVE_PROMPT',   // 复活提示
  HIDDEN_OUTRO = 'HIDDEN_OUTRO'      // 隐藏结局动画
}

// 实体类型枚举：定义游戏中所有物体的类别
export enum EntityType {
  PLAYER = 'PLAYER',                 // 玩家（小熊）
  PLATFORM = 'PLATFORM',             // 地面/平台
  BREAKABLE_WALL = 'BREAKABLE_WALL', // 可破坏的墙壁
  COIN = 'COIN',                     // 金币
  ENEMY = 'ENEMY',                   // 敌人
  SPIKE = 'SPIKE',                   // 尖刺（陷阱）
  CHECKPOINT = 'CHECKPOINT',         // 存档点 (新)
  FLAG = 'FLAG',                     // 旗帜（旧版终点）
  TROPHY = 'TROPHY',                 // 奖杯（关卡终点）
  LAVA = 'LAVA',                     // 岩浆
  PROJECTILE = 'PROJECTILE',         // 子弹/投掷物
  SPAWNER = 'SPAWNER',               // 刷怪笼
  WINE = 'WINE',                     // 道具：酒（加速+无敌）
  POTION = 'POTION'                  // 道具：药水（回血）
}

// 天气/环境类型
export type WeatherType = 'SUNNY' | 'RAIN' | 'SNOW' | 'CAVE' | 'SEA' | 'TOMB' | 'TRAIN' | 'SPACE' | 'ARCTIC';

// 敌人变种类型
export type EnemyVariant = 'NORMAL' | 'TANK' | 'FAST' | 'BAT' | 'SLIME' | 'FISH' | 'SKELETON' | 'MUMMY' | 'SPIDER' | 'ZOMBIE' | 'BIRD' | 'ALIEN' | 'UFO' | 'METEOR' | 'FAMILY_DAD' | 'FAMILY_MOM' | 'FAMILY_BRO' | 'FAMILY_SIS';

// 基础向量接口
export interface Vector {
  x: number;
  y: number;
}

// 基础实体接口：游戏中所有物体的基类
export interface Entity {
  id: string;           // 唯一标识符
  type: EntityType;     // 类型
  pos: Vector;          // 位置 (x, y)
  size: Vector;         // 尺寸 (宽, 高)
  vel: Vector;          // 速度向量
  color?: string;       // 颜色（可选）
  isDead?: boolean;     // 是否已销毁
  
  // 动画状态 (新)
  animFrame?: number;   // 当前动画帧索引
  animTimer?: number;   // 动画计时器

  // 友好NPC/跟随逻辑
  isFollowing?: boolean; // 是否正在跟随玩家
  followOffset?: number; // 跟随时的随机偏移量，防止重叠

  // 敌人特有属性
  patrolStart?: number; // 巡逻起始X坐标
  patrolEnd?: number;   // 巡逻结束X坐标
  enemyVariant?: EnemyVariant; // 敌人变种
  health?: number;      // 当前生命值
  maxHealth?: number;   // 最大生命值
  initialY?: number;    // 初始Y坐标（用于蜘蛛等悬挂怪物）

  // 刷怪笼特有属性
  spawnCooldown?: number; // 生成冷却时间（帧数）
  timeUntilSpawn?: number;// 距离下次生成的计时器
  spawnVariant?: EnemyVariant; // 生成的怪物类型
  
  // 存档点属性
  isChecked?: boolean; // 是否已激活
}

// 玩家接口：继承自实体，增加玩家特有状态
export interface Player extends Entity {
  isGrounded: boolean;      // 是否在地面上
  facingRight: boolean;     // 朝向（true为右）
  isInvulnerable: boolean;  // 是否处于无敌状态
  invulnerableTimer: number;// 无敌时间计时器
  shootCooldown: number;    // 射击冷却
  drunkTimer: number;       // "醉酒"状态计时器（吃了酒道具）
  
  // 物理手感优化
  coyoteTimer: number;      // "土狼时间"：离开平台后的一小段时间内仍允许跳跃
  jumpBufferTimer: number;  // "跳跃预输入"：落地前按跳跃键，落地瞬间自动跳跃
  
  // 视觉表现优化 (Juice)
  renderScale: Vector;      // 渲染缩放 (用于挤压与拉伸效果)

  // 近战/交互状态
  isAttacking?: boolean;
  attackTimer?: number;
}

// 关卡数据结构
export interface LevelData {
  id: number;
  name: string;         // 英文名称
  nameCn: string;       // 中文名称 (新增)
  width: number;        // 关卡总宽度
  height: number;       // 关卡高度
  entities: Entity[];   // 包含的所有实体
  spawnPoint: Vector;   // 玩家出生点
  backgroundColor: string; // 背景色
  groundColor?: string; // 地面颜色
  spikeColor?: string;  // 尖刺颜色
  weather: WeatherType; // 天气类型
}

// 全局游戏状态
export interface GameState {
  status: GameStatus;       // 当前流程状态
  currentLevelId: number;   // 当前关卡ID
  score: number;            // 得分
  lives: number;            // 当前生命
  maxLives: number;         // 最大生命上限（可动态增加）
  coinsCollected: number;   // 金币收集数量
}
