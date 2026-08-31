export type KeyMap = { [key: string]: boolean };

export interface DigitalInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  shoot: boolean;
}

export function isJumpCode(code: string): boolean {
  return code === 'Space' || code === 'ArrowUp' || code === 'KeyW';
}

export function readDigitalInput(keys: KeyMap): DigitalInput {
  const left = !!(keys['ArrowLeft'] || keys['KeyA']);
  const right = !!(keys['ArrowRight'] || keys['KeyD']);
  const up = !!(keys['ArrowUp'] || keys['KeyW']);
  const down = !!(keys['ArrowDown'] || keys['KeyS']);
  return {
    left,
    right,
    up,
    down,
    jump: !!(keys['Space'] || up),
    shoot: !!(keys['KeyF'] || keys['KeyJ']),
  };
}

/**
 * Maps a connected gamepad onto the same key table the keyboard uses.
 * Stick / d-pad write ArrowLeft/Right; face buttons write Space / KeyF.
 */
export function pollGamepad(keys: KeyMap, gamePadIndexRef: { current: number | null }): void {
  const gamepads = navigator.getGamepads();
  if (!gamepads) return;

  if (gamePadIndexRef.current === null) {
    for (const gp of gamepads) {
      if (gp && gp.connected) {
        gamePadIndexRef.current = gp.index;
        break;
      }
    }
  }

  if (gamePadIndexRef.current === null) return;

  const gp = gamepads[gamePadIndexRef.current];
  if (!gp) return;

  if (gp.axes[0] < -0.5) {
    keys['ArrowLeft'] = true;
  } else if (gp.axes[0] > 0.5) {
    keys['ArrowRight'] = true;
  } else {
    if (!keys['KeyA'] && !keys['ArrowLeft_K']) keys['ArrowLeft'] = false;
    if (!keys['KeyD'] && !keys['ArrowRight_K']) keys['ArrowRight'] = false;
  }

  if (gp.buttons[14]?.pressed) keys['ArrowLeft'] = true;
  if (gp.buttons[15]?.pressed) keys['ArrowRight'] = true;

  if (gp.buttons[0]?.pressed) {
    if (!keys['Space_Held']) {
      keys['Space'] = true;
      keys['Space_Held'] = true;
      keys['JumpPressed'] = true;
    }
  } else {
    keys['Space'] = false;
    keys['Space_Held'] = false;
  }

  keys['KeyF'] = !!(gp.buttons[2]?.pressed || gp.buttons[1]?.pressed);
}
