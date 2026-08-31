import { describe, expect, it } from 'vitest';
import { EntityType } from '../types';
import { checkCollision, checkSweptCollision, SpatialGrid } from './collision';

const makeEntity = (x: number, y: number, w: number, h: number) => ({
  id: 'e',
  type: EntityType.PLATFORM,
  pos: { x, y },
  size: { x: w, y: h },
  vel: { x: 0, y: 0 },
});

describe('checkCollision', () => {
  it('detects overlapping boxes', () => {
    expect(checkCollision(makeEntity(0, 0, 10, 10), makeEntity(5, 5, 10, 10))).toBe(true);
  });

  it('returns false for separated boxes', () => {
    expect(checkCollision(makeEntity(0, 0, 10, 10), makeEntity(20, 0, 10, 10))).toBe(false);
  });
});

describe('checkSweptCollision', () => {
  it('detects a hit that static AABB would miss after fast horizontal motion', () => {
    const bullet = { pos: { x: 0, y: 0 }, size: { x: 4, y: 8 } };
    const wall = makeEntity(8, 0, 4, 10);
    const velocity = { x: 12, y: 0 };

    expect(checkCollision({ ...makeEntity(12, 0, 4, 8), vel: velocity }, wall)).toBe(false);
    expect(checkSweptCollision(bullet, velocity, wall)).toBe(true);
  });
});

describe('SpatialGrid', () => {
  it('returns unique entities in queried cells', () => {
    const grid = new SpatialGrid(40);
    const a = makeEntity(10, 10, 20, 20);
    const b = makeEntity(200, 10, 20, 20);
    grid.rebuild([a, b]);

    const near = grid.queryRect(0, 0, 50, 50);
    expect(near).toHaveLength(1);
    expect(near[0]).toBe(a);
  });

  it('skips dead entities on insert', () => {
    const grid = new SpatialGrid(40);
    const dead = { ...makeEntity(0, 0, 20, 20), isDead: true };
    grid.insert(dead);
    expect(grid.queryRect(0, 0, 40, 40)).toHaveLength(0);
  });
});
