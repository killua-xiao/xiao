import { CANVAS_WIDTH } from '../constants';
import { Entity, EntityType } from '../types';

export function countLiveEnemies(entities: Entity[]): number {
  return entities.filter(e => e.type === EntityType.ENEMY && !e.isDead).length;
}

export function compactDeadEntities(entities: Entity[], cameraX: number): Entity[] {
  return entities.filter(ent => {
    if (ent.type !== EntityType.ENEMY || !ent.isDead) return true;
    const entRight = ent.pos.x + ent.size.x;
    return entRight >= cameraX - CANVAS_WIDTH && ent.pos.x <= cameraX + CANVAS_WIDTH * 2;
  });
}
