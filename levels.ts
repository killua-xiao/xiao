
import { LevelData, EntityType, EnemyVariant } from './types';
import { CANVAS_HEIGHT, COLORS, TILE_SIZE } from './constants';

const createPlatform = (x: number, y: number, w: number, h: number, id: string) => ({
  id, type: EntityType.PLATFORM, pos: { x: x * TILE_SIZE, y: CANVAS_HEIGHT - y * TILE_SIZE }, size: { x: w * TILE_SIZE, y: h * TILE_SIZE }, vel: { x: 0, y: 0 }
});

// Helper for Wall: y represents the top-most point (grid units from bottom). 
// To block full screen (height 450, roughly 11.25 tiles), we use y=12 and h=12.
const createWall = (x: number, y: number, w: number, h: number, id: string) => ({
  id, type: EntityType.BREAKABLE_WALL, pos: { x: x * TILE_SIZE, y: CANVAS_HEIGHT - y * TILE_SIZE }, size: { x: w * TILE_SIZE, y: h * TILE_SIZE }, vel: { x: 0, y: 0 }
});

const createCoin = (x: number, y: number, id: string) => ({
  id, type: EntityType.COIN, pos: { x: x * TILE_SIZE + 10, y: CANVAS_HEIGHT - y * TILE_SIZE + 10 }, size: { x: 20, y: 20 }, vel: { x: 0, y: 0 }
});

const createWine = (x: number, y: number, id: string) => ({
  id, type: EntityType.WINE, pos: { x: x * TILE_SIZE + 10, y: CANVAS_HEIGHT - y * TILE_SIZE + 5 }, size: { x: 20, y: 30 }, vel: { x: 0, y: 0 }
});

const createPotion = (x: number, y: number, id: string) => ({
  id, type: EntityType.POTION, pos: { x: x * TILE_SIZE + 10, y: CANVAS_HEIGHT - y * TILE_SIZE + 5 }, size: { x: 20, y: 25 }, vel: { x: 0, y: 0 }
});

const createSpike = (x: number, y: number, w: number, id: string) => ({
  id, type: EntityType.SPIKE, pos: { x: x * TILE_SIZE, y: CANVAS_HEIGHT - y * TILE_SIZE }, size: { x: w * TILE_SIZE, y: TILE_SIZE / 2 }, vel: { x: 0, y: 0 }
});

const createTrophy = (x: number, y: number, id: string) => ({
  id, type: EntityType.TROPHY, pos: { x: x * TILE_SIZE, y: CANVAS_HEIGHT - y * TILE_SIZE - 40 }, size: { x: 40, y: 40 }, vel: { x: 0, y: 0 }
});

const createSpawner = (x: number, y: number, variant: EnemyVariant, cooldownFrames: number, id: string) => ({
  id,
  type: EntityType.SPAWNER,
  pos: { x: x * TILE_SIZE, y: CANVAS_HEIGHT - y * TILE_SIZE },
  size: { x: TILE_SIZE, y: TILE_SIZE },
  vel: { x: 0, y: 0 },
  spawnVariant: variant,
  spawnCooldown: cooldownFrames,
  timeUntilSpawn: 0
});

const createFamily = (x: number, y: number, variant: EnemyVariant, id: string) => {
    let width = 30;
    let height = 30;
    
    if (variant === 'FAMILY_DAD') {
        width = 40;
        height = 40;
    } else if (variant === 'FAMILY_BRO' || variant === 'FAMILY_SIS') {
        width = 20;
        height = 20;
    }

    return {
        id,
        type: EntityType.ENEMY, // Using Enemy type for movement update logic, but will be treated as friendly
        pos: { x: x * TILE_SIZE, y: CANVAS_HEIGHT - y * TILE_SIZE - height },
        size: { x: width, y: height },
        vel: { x: 0, y: 0 }, // Wait for player
        patrolStart: -9999, // Endless patrol
        patrolEnd: 99999,
        enemyVariant: variant,
        health: 999,
        color: '#FFFFFF',
        isFollowing: false,
        followOffset: Math.random() * 20 + 30 // 30-50 distance
    };
};

// Enemy Factory
const createEnemy = (x: number, y: number, range: number, variant: EnemyVariant, id: string) => {
  let width = 30;
  let height = 30;
  let speed = 2;
  let health = 1;
  let color = COLORS.enemy;

  if (variant === 'TANK') {
    width = 50;
    height = 50;
    speed = 1;
    health = 3;
    color = COLORS.enemyTank;
  } else if (variant === 'FAST') {
    width = 25;
    height = 25;
    speed = 4;
    health = 1;
    color = COLORS.enemyFast;
  } else if (variant === 'BAT' || variant === 'BIRD') {
    width = 30;
    height = 20;
    speed = 3;
    health = 1;
    color = variant === 'BIRD' ? COLORS.enemyBird : COLORS.enemyBat;
  } else if (variant === 'SLIME') {
    width = 30;
    height = 20;
    speed = 1;
    health = 2;
    color = COLORS.enemySlime;
  } else if (variant === 'FISH') {
    width = 35;
    height = 25;
    speed = 2.5;
    health = 1;
    color = COLORS.enemyFish;
  } else if (variant === 'SKELETON') {
    width = 25;
    height = 45;
    speed = 2;
    health = 2;
    color = COLORS.enemySkeleton;
  } else if (variant === 'MUMMY') {
    width = 30;
    height = 45;
    speed = 1;
    health = 4;
    color = COLORS.enemyMummy;
  } else if (variant === 'ZOMBIE') {
    width = 30;
    height = 45;
    speed = 1.5;
    health = 3;
    color = COLORS.enemyZombie;
  } else if (variant === 'SPIDER') {
    width = 30;
    height = 25;
    speed = 2; // Vertical speed
    health = 1;
    color = COLORS.enemySpider;
  } else if (variant === 'ALIEN') {
    width = 25;
    height = 35;
    speed = 2;
    health = 2;
    color = COLORS.enemyAlien;
  } else if (variant === 'UFO') {
    width = 40;
    height = 25;
    speed = 4;
    health = 2;
    color = COLORS.enemyUfo;
  } else if (variant === 'METEOR') {
      width = 30;
      height = 30;
      speed = 3;
      health = 1;
      color = COLORS.meteor;
  }

  const enemy = {
    id, 
    type: EntityType.ENEMY, 
    pos: { x: x * TILE_SIZE, y: CANVAS_HEIGHT - y * TILE_SIZE - height }, 
    size: { x: width, y: height }, 
    vel: { x: speed, y: 0 }, 
    patrolStart: x * TILE_SIZE, 
    patrolEnd: (x + range) * TILE_SIZE,
    enemyVariant: variant,
    health,
    maxHealth: health,
    color,
    initialY: CANVAS_HEIGHT - y * TILE_SIZE - height
  };

  if (variant === 'SPIDER') {
      enemy.vel.x = 0; // Spiders only move Y
      enemy.vel.y = speed;
  }
  if (variant === 'UFO') {
      // UFOs can fly
  }

  return enemy;
};

// Helper to create a train car platform
// length: number of tiles wide
const createTrainCar = (startX: number, length: number, idPrefix: string) => {
    return createPlatform(startX, 2, length, 1, `${idPrefix}_floor`);
};

export const levels: LevelData[] = [
  {
    id: 1,
    name: "Green Valley 1-1",
    width: 8000, 
    height: CANVAS_HEIGHT,
    backgroundColor: COLORS.sky,
    weather: 'SUNNY',
    spawnPoint: { x: 50, y: CANVAS_HEIGHT - 150 },
    entities: [
      createPlatform(0, 1, 30, 1, 'floor-1'),
      createEnemy(15, 1, 10, 'NORMAL', 'e1'),
      createWine(20, 2, 'wine1'), 
      createCoin(22, 2, 'c0_1'),
      createCoin(24, 2, 'c0_2'),

      createPlatform(35, 1, 20, 1, 'floor-2'),
      createSpawner(45, 2, 'NORMAL', 300, 'spawner1'), 
      createPotion(50, 2, 'potion1'), // Tutorial Potion

      createPlatform(60, 2, 20, 1, 'floor-tank'),
      createEnemy(65, 2, 10, 'TANK', 'e_tank1'),
      createPlatform(65, 5, 5, 1, 'high-ground'),
      createCoin(66, 6, 'c1'),
      createCoin(68, 6, 'c1_2'),

      createPlatform(85, 1, 30, 1, 'floor-fast'),
      createSpawner(90, 2, 'FAST', 200, 'spawner2'), 
      createPlatform(95, 4, 3, 1, 'p1'),
      createPlatform(105, 5, 3, 1, 'p2'),
      createWine(100, 5, 'wine2'),

      createPlatform(120, 2, 40, 1, 'floor-long'), // Ends at 160
      createSpawner(130, 3, 'TANK', 600, 'spawner3'), 
      createSpike(140, 2, 5, 's_new1'),
      createPlatform(150, 4, 10, 1, 'p3'),
      createCoin(152, 6, 'c_new1'),
      createCoin(154, 6, 'c_new2'),
      createCoin(156, 6, 'c_new3'),

      createPlatform(164, 1, 20, 1, 'final_run'), 
      createTrophy(175, 2, 'finish_trophy')
    ]
  },
  {
    id: 2,
    name: "Dark Cave 2-1",
    width: 9000,
    height: CANVAS_HEIGHT,
    backgroundColor: COLORS.caveBg,
    groundColor: COLORS.caveGround,
    spikeColor: COLORS.caveSpike,
    weather: 'CAVE',
    spawnPoint: { x: 50, y: CANVAS_HEIGHT - 150 },
    entities: [
      createPlatform(0, 1, 20, 1, 'c_start'),
      createWine(5, 2, 'c_wine_start'),
      
      createPlatform(25, 3, 10, 1, 'c_plat1'),
      createEnemy(30, 5, 5, 'BAT', 'c_bat1'), 
      createSpawner(20, 2, 'SLIME', 400, 'sp_slime1'),

      createPlatform(40, 1, 10, 1, 'c_edge1'),
      createSpike(50, 0, 10, 'c_spike_pit1'), 
      createPlatform(54, 3, 3, 1, 'c_pit_bridge'), 
      createPotion(55, 4, 'c_potion_start'),

      createPlatform(60, 1, 10, 1, 'c_edge2'),
      createSpawner(65, 2, 'BAT', 200, 'sp_bat1'),

      createPlatform(75, 4, 5, 1, 'c_high1'),
      createCoin(77, 6, 'cc1'),
      createPlatform(85, 2, 5, 1, 'c_low1'),
      createEnemy(85, 2, 5, 'SLIME', 'c_slime2'),

      createPlatform(95, 1, 50, 1, 'c_long'),
      createSpawner(100, 2, 'BAT', 300, 'sp_bat2'),
      createSpawner(110, 2, 'SLIME', 300, 'sp_slime2'),
      createSpawner(120, 2, 'TANK', 600, 'sp_tank_cave'),
      createSpike(130, 1, 5, 'c_spikes_on_road'),

      createPlatform(150, 3, 3, 1, 'cp1'),
      createPlatform(158, 5, 3, 1, 'cp2'),
      createPlatform(166, 7, 3, 1, 'cp3'),
      createEnemy(166, 9, 3, 'BAT', 'c_bat_guard'),
      createWine(166, 9, 'c_wine_reward'),

      createPlatform(172, 2, 40, 1, 'c_final'),
      createSpawner(185, 3, 'BAT', 150, 'sp_bat_storm'),
      
      createTrophy(200, 3, 'finish_trophy_2')
    ]
  },
  {
    id: 3,
    name: "Stormy Keep 3-1",
    width: 8000,
    height: CANVAS_HEIGHT,
    backgroundColor: '#2D1B2E', 
    groundColor: '#3F3F46', 
    spikeColor: '#71717A',
    weather: 'RAIN',
    spawnPoint: { x: 50, y: CANVAS_HEIGHT - 150 },
    entities: [
      createPlatform(0, 1, 20, 1, 'k_start'),
      createWine(5, 2, 'k_wine_start'),
      
      createPlatform(25, 1, 5, 1, 'k_moat_1'),
      createSpike(30, 0, 10, 'k_spikes_1'),
      createPlatform(33, 3, 4, 1, 'k_moat_bridge'),
      createEnemy(33, 4, 4, 'SLIME', 'k_moat_guard'),
      
      createPlatform(40, 1, 10, 1, 'k_wall_base'),
      
      createPlatform(50, 2, 4, 1, 'k_step_1'),
      createSpawner(52, 4, 'BAT', 250, 'k_sp_bat1'),
      createPlatform(56, 4, 4, 1, 'k_step_2'),
      createPlatform(62, 6, 4, 1, 'k_step_3'),
      createCoin(63, 7, 'k_c1'),
      createPlatform(68, 4, 4, 1, 'k_step_4_down'),
      
      createPlatform(75, 2, 40, 1, 'k_courtyard'),
      createEnemy(80, 2, 10, 'TANK', 'k_tank_1'),
      createSpawner(90, 3, 'FAST', 300, 'k_sp_fast'),
      createSpike(95, 2, 5, 'k_courtyard_spikes'),
      createEnemy(105, 2, 10, 'TANK', 'k_tank_2'),
      createWine(100, 5, 'k_wine_mid'),

      createPlatform(120, 3, 3, 1, 'k_gap_1'),
      createPlatform(126, 4, 3, 1, 'k_gap_2'),
      createSpawner(126, 6, 'BAT', 200, 'k_sp_bat2'),
      createPlatform(132, 2, 3, 1, 'k_gap_3'),
      createPlatform(138, 5, 3, 1, 'k_gap_4'),
      
      createSpike(120, 0, 25, 'k_pit_death'), 

      createPlatform(145, 2, 40, 1, 'k_final_path'),
      createEnemy(150, 2, 5, 'SLIME', 'k_slime_final'),
      createEnemy(155, 2, 5, 'SLIME', 'k_slime_final2'),
      createCoin(160, 4, 'k_final_c1'),
      createCoin(162, 4, 'k_final_c2'),
      createCoin(164, 4, 'k_final_c3'),
      
      createTrophy(175, 3, 'finish_trophy_3')
    ]
  },
  {
    id: 4,
    name: "Deep Blue 4-1",
    width: 8000,
    height: CANVAS_HEIGHT,
    backgroundColor: COLORS.sea,
    weather: 'SEA',
    spawnPoint: { x: 50, y: CANVAS_HEIGHT / 2 },
    entities: [
      createPlatform(0, 0, 200, 1, 'sea_floor'), 
      createPlatform(0, 11, 200, 1, 'sea_ceiling'),
      
      createWine(5, 5, 'sea_wine_start'),
      createCoin(8, 5, 'sea_c1'),
      createCoin(9, 6, 'sea_c2'),
      createCoin(10, 5, 'sea_c3'),

      createPlatform(20, 1, 5, 5, 'sea_rock1_bottom'),
      createPlatform(20, 8, 5, 4, 'sea_rock1_top'),
      createEnemy(25, 5, 5, 'FISH', 'sea_fish1'),

      createSpawner(35, 5, 'FISH', 200, 'sea_sp_fish1'),
      createPlatform(40, 4, 3, 3, 'sea_float_rock1'),
      createCoin(41, 8, 'sea_c4'),

      createPlatform(50, 1, 30, 4, 'sea_tunnel_floor'),
      createPlatform(50, 8, 30, 4, 'sea_tunnel_ceil'),
      createEnemy(55, 5, 20, 'FISH', 'sea_fish_tunnel'),
      createEnemy(65, 5, 20, 'FISH', 'sea_fish_tunnel2'),
      
      createPlatform(80, 1, 10, 10, 'sea_wall_block'),
      createCoin(85, 12, 'sea_c_high'),
      
      createPlatform(95, 1, 15, 2, 'sea_wreck_base'),
      createPlatform(100, 3, 5, 5, 'sea_wreck_mast'),
      createSpawner(100, 5, 'FISH', 150, 'sea_sp_fish2'),
      createWine(102, 9, 'sea_wine_mid'),

      createPlatform(120, 1, 2, 2, 'coral1'),
      createPlatform(125, 2, 2, 3, 'coral2'),
      createPlatform(130, 1, 2, 4, 'coral3'),
      createPlatform(135, 3, 2, 2, 'coral4'),
      createEnemy(128, 6, 10, 'FISH', 'sea_fish_reef'),
      
      createPlatform(150, 5, 2, 2, 'sea_obstacle_mid'),
      createSpawner(160, 5, 'FISH', 100, 'sea_final_storm'),
      
      createTrophy(180, 1, 'finish_trophy_4')
    ]
  },
  {
    id: 5,
    name: "Lost Tomb 5-1",
    width: 6000,
    height: CANVAS_HEIGHT,
    backgroundColor: COLORS.tomb,
    groundColor: COLORS.sand,
    weather: 'TOMB',
    spawnPoint: { x: 50, y: CANVAS_HEIGHT - 100 },
    entities: [
      createPlatform(0, 1, 200, 1, 't_floor_main'),
      createPlatform(0, 13, 200, 9, 't_ceiling_main'),

      createWine(5, 2, 't_wine_start'),
      createEnemy(15, 1, 5, 'SKELETON', 't_skel_start'),

      createWall(25, 12, 2, 12, 't_wall_block_1'),
      
      createEnemy(30, 1, 5, 'SKELETON', 't_skel_2'),
      createEnemy(35, 2, 0, 'SPIDER', 't_spider_1'), 
      createCoin(35, 2, 't_c1'),
      createEnemy(40, 2, 0, 'SPIDER', 't_spider_2'),

      createWall(50, 12, 2, 12, 't_wall_block_2'),

      createEnemy(55, 1, 5, 'MUMMY', 't_mummy_1'),
      createWine(58, 2, 't_wine_2'),
      createEnemy(65, 1, 5, 'MUMMY', 't_mummy_2'),
      
      createWall(75, 12, 3, 12, 't_wall_block_3'),
      
      createCoin(80, 2, 't_c2'),
      createCoin(82, 2, 't_c3'),
      createCoin(84, 2, 't_c4'),
      createSpawner(85, 1, 'SKELETON', 200, 't_sp_final'),

      createTrophy(95, 1, 'finish_trophy_5')
    ]
  },
  {
    id: 6,
    name: "Daylight Express 6-1",
    width: 8000,
    height: CANVAS_HEIGHT,
    backgroundColor: COLORS.sky,
    groundColor: COLORS.trainCar,
    weather: 'TRAIN',
    spawnPoint: { x: 50, y: CANVAS_HEIGHT - 150 },
    entities: [
      createTrainCar(0, 25, 'train_car_1'),
      createWine(10, 3, 'tr_wine_start'),
      
      createTrainCar(30, 20, 'train_car_2'),
      createEnemy(35, 3, 10, 'ZOMBIE', 'tr_zombie_1'),
      createSpawner(40, 3, 'BIRD', 300, 'tr_sp_bird1'), 

      createTrainCar(55, 10, 'train_car_3'),
      createCoin(58, 4, 'tr_c1'),
      createTrainCar(68, 10, 'train_car_4'),
      createEnemy(70, 3, 5, 'ZOMBIE', 'tr_zombie_2'),

      createTrainCar(83, 30, 'train_car_5'),
      createSpawner(85, 3, 'ZOMBIE', 400, 'tr_sp_zombie1'),
      createSpawner(95, 3, 'BIRD', 250, 'tr_sp_bird2'),
      createWine(100, 3, 'tr_wine_mid'),

      createTrainCar(118, 15, 'train_car_6'),
      createPlatform(120, 4, 3, 2, 'tr_container_1'),
      createCoin(121, 7, 'tr_c2'),
      createPlatform(126, 5, 3, 2, 'tr_container_2'),
      createEnemy(128, 7, 0, 'BIRD', 'tr_bird_guard'),

      createTrainCar(138, 40, 'train_car_final'),
      createSpawner(145, 3, 'ZOMBIE', 200, 'tr_sp_zombie_final'),
      createEnemy(160, 3, 10, 'TANK', 'tr_tank_boss'),

      createTrophy(170, 3, 'finish_trophy_6')
    ]
  },
  {
    id: 7,
    name: "Cosmic Voyage 7-1",
    width: 8000,
    height: CANVAS_HEIGHT,
    backgroundColor: COLORS.spaceBg,
    groundColor: COLORS.asteroid,
    weather: 'SPACE',
    spawnPoint: { x: 50, y: CANVAS_HEIGHT / 2 },
    entities: [
      createPlatform(0, 0, 800, 0.1, 'space_boundary_floor'), 
      createWine(5, 5, 'sp_wine_start'),
      createEnemy(10, 5, 0, 'ALIEN', 'sp_alien_start'),

      createSpawner(30, 5, 'METEOR', 120, 'sp_met_1'),
      createSpawner(30, 8, 'METEOR', 150, 'sp_met_1b'),

      createEnemy(25, 5, 0, 'UFO', 'sp_ufo_1'),
      createCoin(28, 6, 'sp_c1'),
      createPotion(35, 6, 'sp_potion_1'),
      
      createSpawner(50, 4, 'METEOR', 100, 'sp_met_2'),
      createSpawner(50, 7, 'METEOR', 140, 'sp_met_2b'),
      createSpawner(50, 2, 'METEOR', 180, 'sp_met_2c'),
      
      createEnemy(55, 6, 0, 'UFO', 'sp_ufo_2'),
      createCoin(58, 8, 'sp_c2'),
      
      createWine(70, 5, 'sp_wine_mid'),
      createEnemy(75, 5, 5, 'ALIEN', 'sp_alien_mid'),
      
      createSpawner(90, 3, 'METEOR', 90, 'sp_met_3'),
      createSpawner(90, 6, 'METEOR', 90, 'sp_met_3b'),
      createSpawner(90, 9, 'METEOR', 90, 'sp_met_3c'),
      
      createEnemy(100, 4, 10, 'UFO', 'sp_ufo_swarm_1'),
      createEnemy(110, 7, 10, 'UFO', 'sp_ufo_swarm_2'),
      
      createCoin(120, 5, 'sp_c3'),
      createCoin(122, 5, 'sp_c4'),
      
      createSpawner(130, 2, 'METEOR', 60, 'sp_met_storm_1'),
      createSpawner(130, 5, 'METEOR', 70, 'sp_met_storm_2'),
      createSpawner(130, 8, 'METEOR', 80, 'sp_met_storm_3'),
      
      createEnemy(140, 5, 5, 'ALIEN', 'sp_alien_guard'),
      
      createTrophy(160, 5, 'finish_trophy_7')
    ]
  },
  {
      id: 999,
      name: "Way Home",
      width: 4000,
      height: CANVAS_HEIGHT,
      backgroundColor: COLORS.arcticBg,
      groundColor: COLORS.ice,
      spikeColor: '#fff', 
      weather: 'ARCTIC',
      spawnPoint: { x: 50, y: CANVAS_HEIGHT - 100 },
      entities: [
          createPlatform(0, 1, 200, 1, 'ice_floor'),
          
          createFamily(20, 1, 'FAMILY_BRO', 'fam_bro_1'),
          createFamily(25, 1, 'FAMILY_SIS', 'fam_sis_1'),
          createFamily(40, 1, 'FAMILY_MOM', 'fam_mom'),
          createFamily(60, 1, 'FAMILY_DAD', 'fam_dad'),
          createFamily(70, 1, 'FAMILY_BRO', 'fam_bro_2'),
          
          // Home Trigger is now bigger (House sized)
          { 
              id: 'home_trigger', 
              type: EntityType.TROPHY, 
              pos: { x: 90 * TILE_SIZE, y: CANVAS_HEIGHT - 1 * TILE_SIZE - 100 }, 
              size: { x: 100, y: 100 }, 
              vel: { x: 0, y: 0 } 
          }
      ]
  }
];
