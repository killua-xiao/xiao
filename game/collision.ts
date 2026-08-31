import { Entity } from '../types';

/** Axis-aligned bounding box overlap. Shared by player, bullets, and pickups. */
export function checkCollision(rect1: Entity, rect2: Entity): boolean {
  return (
    rect1.pos.x < rect2.pos.x + rect2.size.x &&
    rect1.pos.x + rect1.size.x > rect2.pos.x &&
    rect1.pos.y < rect2.pos.y + rect2.size.y &&
    rect1.pos.y + rect1.size.y > rect2.pos.y
  );
}

/** True if an entity is outside the camera window plus a safety buffer. */
export function isOffCamera(ent: Entity, cameraX: number, viewWidth: number, buffer: number): boolean {
  const entRight = ent.pos.x + ent.size.x;
  return entRight < cameraX - buffer || ent.pos.x > cameraX + viewWidth + buffer;
}

export function cloneEntities<T extends Entity>(entities: T[]): T[] {
  return entities.map((ent) => ({
    ...ent,
    pos: { ...ent.pos },
    size: { ...ent.size },
    vel: { ...ent.vel },
  }));
}
