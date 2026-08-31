import {
  CANVAS_WIDTH,
  CAMERA_LERP_NORMAL,
  CAMERA_LERP_FAST,
  CAMERA_FAST_SPEED_THRESHOLD,
} from '../constants';
import { Player } from '../types';
import { CameraState } from './types';

export function addShake(camera: CameraState, amount: number): void {
  camera.shake = amount;
}

export function updateCameraDecay(camera: CameraState): void {
  if (camera.shake > 0) {
    camera.shake *= 0.9;
    if (camera.shake < 0.5) camera.shake = 0;
  }
}

export function updateCameraFollow(camera: CameraState, player: Player, levelWidth: number): void {
  const targetLookAhead = player.facingRight ? 100 : -50;
  camera.lookAheadOffset += (targetLookAhead - camera.lookAheadOffset) * 0.05;

  const speed = Math.abs(player.vel.x);
  const lerp = speed >= CAMERA_FAST_SPEED_THRESHOLD ? CAMERA_LERP_FAST : CAMERA_LERP_NORMAL;

  const targetCamX = player.pos.x - CANVAS_WIDTH / 3 + camera.lookAheadOffset;
  camera.x += (targetCamX - camera.x) * lerp;

  if (camera.x < 0) camera.x = 0;
  const maxCamX = levelWidth - CANVAS_WIDTH;
  if (camera.x > maxCamX) camera.x = maxCamX;
}
