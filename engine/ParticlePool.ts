import { Particle } from './types';

export const MAX_PARTICLES = 300;

export class ParticlePool {
  readonly pool: Particle[];
  activeCount = 0;

  constructor(maxParticles = MAX_PARTICLES) {
    this.pool = new Array(maxParticles).fill(null).map(() => ({
      active: false,
      x: 0,
      y: 0,
      speedX: 0,
      speedY: 0,
      size: 0,
      life: 0,
    }));
  }

  spawn(opts: Partial<Omit<Particle, 'active'>>): void {
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        this.pool[i] = {
          active: true,
          x: opts.x ?? 0,
          y: opts.y ?? 0,
          speedX: opts.speedX ?? 0,
          speedY: opts.speedY ?? 0,
          size: opts.size ?? 2,
          life: opts.life ?? 1,
          color: opts.color,
          alpha: opts.alpha,
          isScreenSpace: opts.isScreenSpace ?? false,
        };
        this.activeCount++;
        return;
      }
    }
  }

  deactivate(particle: Particle): void {
    if (!particle.active) return;
    particle.active = false;
    this.activeCount = Math.max(0, this.activeCount - 1);
  }

  reset(): void {
    for (const particle of this.pool) {
      particle.active = false;
    }
    this.activeCount = 0;
  }
}
