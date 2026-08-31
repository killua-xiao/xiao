import { Entity, EntityType } from '../types';

const SPAWNER_TRACK_RADIUS = 600;
const METEOR_TRACK_RADIUS = 1200;

/** Count live enemies likely spawned from a given spawner (by variant + proximity). */
export function countSpawnerLiveEnemies(entities: Entity[], spawner: Entity): number {
  const variant = spawner.spawnVariant;
  if (!variant) return 0;

  const radius = variant === 'METEOR' ? METEOR_TRACK_RADIUS : SPAWNER_TRACK_RADIUS;
  return entities.filter(
    e =>
      e.type === EntityType.ENEMY &&
      !e.isDead &&
      e.enemyVariant === variant &&
      Math.abs(e.pos.x - spawner.pos.x) < radius &&
      Math.abs(e.pos.y - spawner.pos.y) < radius,
  ).length;
}

export function canSpawnerSpawn(entities: Entity[], spawner: Entity): boolean {
  const maxAlive = spawner.spawnMaxAlive ?? (spawner.spawnVariant === 'METEOR' ? 2 : 3);
  return countSpawnerLiveEnemies(entities, spawner) < maxAlive;
}
