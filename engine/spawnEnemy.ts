import { COLORS } from '../constants';
import { Entity, EntityType, EnemyVariant, Player } from '../types';

export interface SpawnEnemyContext {
  entities: Entity[];
  player: Player;
  liveEnemyCount: number;
  maxEnemies: number;
  onRoar: () => void;
}

export function spawnEnemy(spawner: Entity, ctx: SpawnEnemyContext): boolean {
  if (ctx.liveEnemyCount >= ctx.maxEnemies) return false;

  const variant: EnemyVariant = spawner.spawnVariant || 'NORMAL';
  let width = 30;
  let height = 30;
  let speed = 2;
  let health = 1;
  let color = COLORS.enemy;

  if (variant === 'TANK') { width = 50; height = 50; speed = 1; health = 3; color = COLORS.enemyTank; }
  else if (variant === 'FAST') { width = 25; height = 25; speed = 4; health = 1; color = COLORS.enemyFast; }
  else if (variant === 'BAT' || variant === 'BIRD') { width = 30; height = 20; speed = 3; health = 1; color = variant === 'BIRD' ? COLORS.enemyBird : COLORS.enemyBat; }
  else if (variant === 'SLIME') { width = 30; height = 20; speed = 1; health = 2; color = COLORS.enemySlime; }
  else if (variant === 'FISH') { width = 35; height = 25; speed = 2.5; health = 1; color = COLORS.enemyFish; }
  else if (variant === 'SKELETON') { width = 25; height = 45; speed = 2; health = 2; color = COLORS.enemySkeleton; }
  else if (variant === 'MUMMY') { width = 30; height = 45; speed = 1; health = 4; color = COLORS.enemyMummy; }
  else if (variant === 'ZOMBIE') { width = 30; height = 45; speed = 1.5; health = 3; color = COLORS.enemyZombie; }
  else if (variant === 'SPIDER') { width = 30; height = 25; speed = 2; health = 1; color = COLORS.enemySpider; }
  else if (variant === 'ALIEN') { width = 25; height = 35; speed = 2; health = 2; color = COLORS.enemyAlien; }
  else if (variant === 'UFO') { width = 40; height = 25; speed = 4; health = 2; color = COLORS.enemyUfo; }
  else if (variant === 'METEOR') { width = 35; height = 35; speed = 4; health = 1; color = COLORS.meteor; }

  const dir = Math.random() > 0.5 ? 1 : -1;
  let spawnY = spawner.pos.y - height + spawner.size.y;

  if (variant === 'BAT' || variant === 'BIRD' || variant === 'UFO') {
    spawnY -= variant === 'UFO' ? 100 + Math.random() * 50 : 100;
  }
  if (variant === 'METEOR') {
    spawnY = spawner.pos.y - 300 + Math.random() * 400;
  }

  const enemy: Entity = {
    id: `spawned_${Date.now()}_${Math.random()}`,
    type: EntityType.ENEMY,
    pos: { x: spawner.pos.x, y: spawnY },
    size: { x: width, y: height },
    vel: { x: speed * dir, y: 0 },
    patrolStart: spawner.pos.x - 400,
    patrolEnd: spawner.pos.x + 400,
    enemyVariant: variant,
    health,
    maxHealth: health,
    color,
  };

  if (variant === 'SPIDER') { enemy.vel.x = 0; enemy.vel.y = speed; enemy.initialY = spawnY; }
  if (variant === 'METEOR') {
    enemy.vel.x = -speed - Math.random() * 2;
    enemy.vel.y = (Math.random() - 0.5) * 1;
    enemy.patrolStart = -99999;
    enemy.patrolEnd = 99999;
  }

  ctx.entities.push(enemy);

  const dist = Math.abs(spawner.pos.x - ctx.player.pos.x);
  if (dist < 800 && variant !== 'METEOR') {
    ctx.onRoar();
  }

  return true;
}
