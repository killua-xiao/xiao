import { Entity, EntityType } from '../types';

/** Scale canvas backing store for device pixel ratio; return 2D context in logical coords. */
export function prepareCanvas2D(
  canvas: HTMLCanvasElement,
  logicalWidth: number,
  logicalHeight: number,
): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const physicalWidth = Math.floor(logicalWidth * dpr);
  const physicalHeight = Math.floor(logicalHeight * dpr);

  if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
    canvas.width = physicalWidth;
    canvas.height = physicalHeight;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** Draw checkpoint saved banner and distance hint to the next unchecked checkpoint. */
export function drawCheckpointOverlay(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  tileSize: number,
  playerX: number,
  entities: Entity[],
  showSavedBanner: boolean,
): void {
  if (showSavedBanner) {
    ctx.fillStyle = '#FFF';
    ctx.font = '16px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('CHECKPOINT!', canvasWidth / 2, 100);
    ctx.textAlign = 'left';
  }

  const nextCheckpoint = entities.find(
    e => e.type === EntityType.CHECKPOINT && !e.isChecked && !e.isDead,
  );
  if (!nextCheckpoint) return;

  const dist = nextCheckpoint.pos.x - playerX;
  if (Math.abs(dist) <= 80 || Math.abs(dist) >= 2500) return;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(canvasWidth / 2 - 90, 6, 180, 24);
  ctx.fillStyle = '#FACC15';
  ctx.font = '10px "Press Start 2P"';
  ctx.textAlign = 'center';
  const label = dist > 0
    ? `存档点 → ${Math.round(dist / tileSize)}m`
    : `← 存档点 ${Math.round(-dist / tileSize)}m`;
  ctx.fillText(label, canvasWidth / 2, 22);
  ctx.textAlign = 'left';
}
