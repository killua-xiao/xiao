import { Entity, EntityType, EnemyVariant } from '../types';
import { CANVAS_HEIGHT, COLORS, TILE_SIZE } from '../constants';

export interface EnemyStats {
  width: number;
  height: number;
  speed: number;
  health: number;
  color: string;
}

const DEFAULT_STATS: EnemyStats = {
  width: 30,
  height: 30,
  speed: 2,
  health: 1,
  color: COLORS.enemy,
};

/** Canonical combat stats. Used by both placed enemies and spawners so the two cannot drift. */
export const ENEMY_STATS: Partial<Record<EnemyVariant, EnemyStats>> = {
  NORMAL: DEFAULT_STATS,
  TANK: { width: 50, height: 50, speed: 1, health: 3, color: COLORS.enemyTank },
  FAST: { width: 25, height: 25, speed: 4, health: 1, color: COLORS.enemyFast },
  BAT: { width: 30, height: 20, speed: 3, health: 1, color: COLORS.enemyBat },
  BIRD: { width: 30, height: 20, speed: 3, health: 1, color: COLORS.enemyBird },
  SLIME: { width: 30, height: 20, speed: 1, health: 2, color: COLORS.enemySlime },
  FISH: { width: 35, height: 25, speed: 2.5, health: 1, color: COLORS.enemyFish },
  SKELETON: { width: 25, height: 45, speed: 2, health: 2, color: COLORS.enemySkeleton },
  MUMMY: { width: 30, height: 45, speed: 1, health: 4, color: COLORS.enemyMummy },
  ZOMBIE: { width: 30, height: 45, speed: 1.5, health: 3, color: COLORS.enemyZombie },
  SPIDER: { width: 30, height: 25, speed: 2, health: 1, color: COLORS.enemySpider },
  ALIEN: { width: 25, height: 35, speed: 2, health: 2, color: COLORS.enemyAlien },
  UFO: { width: 40, height: 25, speed: 4, health: 2, color: COLORS.enemyUfo },
  METEOR: { width: 30, height: 30, speed: 3, health: 1, color: COLORS.meteor },
};

export function getEnemyStats(variant: EnemyVariant = 'NORMAL'): EnemyStats {
  return ENEMY_STATS[variant] ?? DEFAULT_STATS;
}

export function isFamilyVariant(variant?: EnemyVariant): boolean {
  return !!variant && variant.startsWith('FAMILY');
}

function buildEnemy(opts: {
  id: string;
  variant: EnemyVariant;
  posX: number;
  posY: number;
  velX: number;
  velY: number;
  patrolStart: number;
  patrolEnd: number;
}): Entity {
  const stats = getEnemyStats(opts.variant);
  const enemy: Entity = {
    id: opts.id,
    type: EntityType.ENEMY,
    pos: { x: opts.posX, y: opts.posY },
    size: { x: stats.width, y: stats.height },
    vel: { x: opts.velX, y: opts.velY },
    patrolStart: opts.patrolStart,
    patrolEnd: opts.patrolEnd,
    enemyVariant: opts.variant,
    health: stats.health,
    maxHealth: stats.health,
    color: stats.color,
    initialY: opts.posY,
  };

  if (opts.variant === 'SPIDER') {
    enemy.vel.x = 0;
    enemy.vel.y = stats.speed;
  }

  return enemy;
}

/** Tile-space factory used by `levels.ts`. Y is measured from the bottom of the canvas. */
export function createPlacedEnemy(
  x: number,
  y: number,
  range: number,
  variant: EnemyVariant,
  id: string
): Entity {
  const stats = getEnemyStats(variant);
  return buildEnemy({
    id,
    variant,
    posX: x * TILE_SIZE,
    posY: CANVAS_HEIGHT - y * TILE_SIZE - stats.height,
    velX: stats.speed,
    velY: 0,
    patrolStart: x * TILE_SIZE,
    patrolEnd: (x + range) * TILE_SIZE,
  });
}

export function spawnEnemyFromSpawner(spawner: Entity): Entity {
  const variant = spawner.spawnVariant || 'NORMAL';
  const stats = getEnemyStats(variant);
  const dir = Math.random() > 0.5 ? 1 : -1;
  let spawnY = spawner.pos.y - stats.height + spawner.size.y;

  if (variant === 'BAT' || variant === 'BIRD' || variant === 'UFO') {
    spawnY -= variant === 'UFO' ? 100 + Math.random() * 50 : 100;
  }
  if (variant === 'METEOR') {
    spawnY = spawner.pos.y - 300 + Math.random() * 400;
  }

  const enemy = buildEnemy({
    id: `spawned_${Date.now()}_${Math.random()}`,
    variant,
    posX: spawner.pos.x,
    posY: spawnY,
    velX: stats.speed * dir,
    velY: 0,
    patrolStart: spawner.pos.x - 400,
    patrolEnd: spawner.pos.x + 400,
  });

  if (variant === 'METEOR') {
    enemy.vel.x = -stats.speed - Math.random() * 2;
    enemy.vel.y = (Math.random() - 0.5) * 1;
    enemy.patrolStart = -99999;
    enemy.patrolEnd = 99999;
  }

  return enemy;
}
