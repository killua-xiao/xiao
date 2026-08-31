import { Entity } from '../types';

/** Axis-aligned bounding box overlap test. */
export function checkCollision(a: Entity, b: Entity): boolean {
  return (
    a.pos.x < b.pos.x + b.size.x &&
    a.pos.x + a.size.x > b.pos.x &&
    a.pos.y < b.pos.y + b.size.y &&
    a.pos.y + a.size.y > b.pos.y
  );
}

/**
 * Uniform-grid spatial hash for broad-phase collision culling.
 * Entities spanning multiple cells are inserted into each overlapping bucket.
 */
export class SpatialGrid {
  private readonly cellSize: number;
  private readonly cells = new Map<string, Entity[]>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  clear(): void {
    this.cells.clear();
  }

  insert(entity: Entity): void {
    if (entity.isDead) return;

    const minCol = Math.floor(entity.pos.x / this.cellSize);
    const maxCol = Math.floor((entity.pos.x + entity.size.x) / this.cellSize);
    const minRow = Math.floor(entity.pos.y / this.cellSize);
    const maxRow = Math.floor((entity.pos.y + entity.size.y) / this.cellSize);

    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const key = `${col},${row}`;
        let bucket = this.cells.get(key);
        if (!bucket) {
          bucket = [];
          this.cells.set(key, bucket);
        }
        bucket.push(entity);
      }
    }
  }

  rebuild(entities: Entity[]): void {
    this.clear();
    for (const entity of entities) {
      this.insert(entity);
    }
  }

  /** Return unique entities whose cells overlap the given world-space AABB. */
  queryRect(x: number, y: number, width: number, height: number, buffer = 0): Entity[] {
    const results: Entity[] = [];
    const seen = new Set<Entity>();

    const minCol = Math.floor((x - buffer) / this.cellSize);
    const maxCol = Math.floor((x + width + buffer) / this.cellSize);
    const minRow = Math.floor((y - buffer) / this.cellSize);
    const maxRow = Math.floor((y + height + buffer) / this.cellSize);

    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const bucket = this.cells.get(`${col},${row}`);
        if (!bucket) continue;
        for (const entity of bucket) {
          if (!seen.has(entity)) {
            seen.add(entity);
            results.push(entity);
          }
        }
      }
    }

    return results;
  }

  /** Query entities visible around the camera (full level height). */
  queryViewport(cameraX: number, viewportWidth: number, levelHeight: number, buffer = 200): Entity[] {
    return this.queryRect(cameraX - buffer, 0, viewportWidth + buffer * 2, levelHeight + 500);
  }
}

/** Skip entities entirely outside the camera frustum (narrow phase prep). */
export function isInCameraRange(
  entity: Entity,
  cameraX: number,
  viewportWidth: number,
  buffer = 200,
): boolean {
  const entityRight = entity.pos.x + entity.size.x;
  return entityRight >= cameraX - buffer && entity.pos.x <= cameraX + viewportWidth + buffer;
}
