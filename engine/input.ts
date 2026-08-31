/** Normalized input helpers — merge keyboard, gamepad, and touch. */

export interface GamepadInputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  fire: boolean;
}

export const EMPTY_GAMEPAD_STATE: GamepadInputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  fire: false,
};

export function pollGamepadState(index: number | null): GamepadInputState {
  const state = { ...EMPTY_GAMEPAD_STATE };
  if (index === null) return state;

  const gamepads = navigator.getGamepads();
  const gp = gamepads?.[index];
  if (!gp) return state;

  if (gp.axes[0] < -0.5) state.left = true;
  if (gp.axes[0] > 0.5) state.right = true;

  if (gp.buttons[14]?.pressed) state.left = true;
  if (gp.buttons[15]?.pressed) state.right = true;

  if (gp.buttons[0]?.pressed) {
    state.jump = true;
    state.up = true;
  }
  if (gp.buttons[2]?.pressed || gp.buttons[1]?.pressed) {
    state.fire = true;
  }

  return state;
}

export function isMoveLeft(keys: Record<string, boolean>, gamepad: GamepadInputState): boolean {
  return !!(keys['ArrowLeft'] || keys['KeyA'] || gamepad.left);
}

export function isMoveRight(keys: Record<string, boolean>, gamepad: GamepadInputState): boolean {
  return !!(keys['ArrowRight'] || keys['KeyD'] || gamepad.right);
}

export function isMoveUp(keys: Record<string, boolean>, gamepad: GamepadInputState): boolean {
  return !!(keys['ArrowUp'] || keys['Space'] || gamepad.up);
}

export function isMoveDown(keys: Record<string, boolean>, gamepad: GamepadInputState): boolean {
  return !!(keys['ArrowDown'] || keys['KeyS'] || gamepad.down);
}

export function isJumpHeld(keys: Record<string, boolean>, gamepad: GamepadInputState): boolean {
  return !!(keys['Space'] || keys['ArrowUp'] || gamepad.jump);
}

export function isFireHeld(keys: Record<string, boolean>, gamepad: GamepadInputState): boolean {
  return !!(keys['KeyF'] || keys['KeyJ'] || gamepad.fire);
}
