import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../constants';

export interface Star {
  x: number;
  y: number;
  phase: number;
  size: number;
}

export const STAR_FIELD: Star[] = Array.from({ length: 50 }, (_, i) => ({
  x: (i * 123) % CANVAS_WIDTH,
  y: (i * 87) % CANVAS_HEIGHT,
  phase: i * 0.7,
  size: i % 7 === 0 ? 2 : 1,
}));
