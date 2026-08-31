import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants';
import { WeatherType } from '../types';

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  speedX: number;
  speedY: number;
  size: number;
  life: number;
  color?: string;
  alpha?: number;
  isScreenSpace?: boolean;
}

export const MAX_PARTICLES = 300;

export function createParticlePool(size: number = MAX_PARTICLES): Particle[] {
  return Array.from({ length: size }, () => ({
    active: false,
    x: 0,
    y: 0,
    speedX: 0,
    speedY: 0,
    size: 0,
    life: 0,
  }));
}

export function resetParticlePool(pool: Particle[]): void {
  for (let i = 0; i < pool.length; i++) {
    pool[i].active = false;
  }
}

/** Reuse an inactive slot in place to avoid per-spawn allocations. */
export function spawnParticle(pool: Particle[], opts: Partial<Omit<Particle, 'active'>>): boolean {
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (!p.active) {
      p.active = true;
      p.x = opts.x || 0;
      p.y = opts.y || 0;
      p.speedX = opts.speedX || 0;
      p.speedY = opts.speedY || 0;
      p.size = opts.size || 2;
      p.life = opts.life || 1;
      p.color = opts.color;
      p.alpha = opts.alpha;
      p.isScreenSpace = opts.isScreenSpace || false;
      return true;
    }
  }
  return false;
}

export function countActiveParticles(pool: Particle[]): number {
  let n = 0;
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].active) n++;
  }
  return n;
}

export function updateParticles(pool: Particle[], weather: WeatherType): void {
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (!p.active) continue;

    p.x += p.speedX;
    p.y += p.speedY;

    if (p.color && !p.color.startsWith('rgba') && p.color !== '#D97706' && p.color !== '#FFFFFF') {
      p.life -= 0.05;
      p.size *= 0.95;
    } else if (weather === 'SEA' && p.y < 0) {
      p.active = false;
      continue;
    }

    if (p.y > CANVAS_HEIGHT && weather !== 'SEA') {
      if (p.isScreenSpace) {
        p.y = -10;
        p.x = Math.random() * CANVAS_WIDTH;
      } else {
        p.active = false;
      }
    } else if (p.life <= 0) {
      p.active = false;
    }
  }
}
