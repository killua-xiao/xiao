import { describe, expect, it } from 'vitest';
import {
  isMoveLeft,
  isMoveRight,
  isMoveUp,
  isMoveDown,
  isJumpHeld,
  isFireHeld,
  EMPTY_GAMEPAD_STATE,
} from './input';

describe('input helpers', () => {
  const emptyKeys: Record<string, boolean> = {};

  it('maps KeyA and KeyD to horizontal movement', () => {
    expect(isMoveLeft({ KeyA: true }, EMPTY_GAMEPAD_STATE)).toBe(true);
    expect(isMoveRight({ KeyD: true }, EMPTY_GAMEPAD_STATE)).toBe(true);
  });

  it('merges keyboard and gamepad for movement', () => {
    expect(isMoveLeft(emptyKeys, { ...EMPTY_GAMEPAD_STATE, left: true })).toBe(true);
    expect(isMoveRight(emptyKeys, { ...EMPTY_GAMEPAD_STATE, right: true })).toBe(true);
  });

  it('handles vertical movement and jump/fire', () => {
    expect(isMoveUp({ Space: true }, EMPTY_GAMEPAD_STATE)).toBe(true);
    expect(isMoveDown({ KeyS: true }, EMPTY_GAMEPAD_STATE)).toBe(true);
    expect(isJumpHeld({ ArrowUp: true }, EMPTY_GAMEPAD_STATE)).toBe(true);
    expect(isFireHeld({ KeyF: true }, EMPTY_GAMEPAD_STATE)).toBe(true);
  });
});
