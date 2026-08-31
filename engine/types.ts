/** Shared engine-level types (decorative + runtime). */

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

export interface Trail {
  x: number;
  y: number;
  facingRight: boolean;
  alpha: number;
  type: 'BEAR' | 'DASH';
}

export interface Cloud {
  x: number;
  y: number;
  speed: number;
  size: number;
}

export interface Tree {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface Planet {
  x: number;
  y: number;
  size: number;
  color: string;
  type: 'RING' | 'GAS' | 'CRATER' | 'SOLID';
  speed: number;
}

export interface CaveSpike {
  x: number;
  height: number;
  type: 'CEILING' | 'FLOOR';
  width: number;
}

export interface SunRay {
  x: number;
  width: number;
  angle: number;
  speed: number;
  alpha: number;
}

export interface CameraState {
  x: number;
  y: number;
  shake: number;
  lookAheadOffset: number;
}

export interface PendingStats {
  score: number;
  coins: number;
}
