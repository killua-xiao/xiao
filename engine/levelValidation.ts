import { LevelData, EntityType } from '../types';

export interface LevelValidationIssue {
  levelId: number;
  message: string;
}

/** Validate level data invariants; throws in dev when issues are found. */
export function validateLevels(levels: LevelData[]): LevelValidationIssue[] {
  const issues: LevelValidationIssue[] = [];
  const seenIds = new Set<number>();

  for (const level of levels) {
    if (seenIds.has(level.id)) {
      issues.push({ levelId: level.id, message: `Duplicate level id ${level.id}` });
    }
    seenIds.add(level.id);

    if (level.width <= 0 || level.height <= 0) {
      issues.push({ levelId: level.id, message: 'Level width/height must be positive' });
    }

    if (level.spawnPoint.x < 0 || level.spawnPoint.x > level.width) {
      issues.push({ levelId: level.id, message: 'Spawn point X outside level width' });
    }

    const entityIds = new Set<string>();
    let hasGround = false;
    let hasGoal = false;

    for (const ent of level.entities) {
      if (entityIds.has(ent.id)) {
        issues.push({ levelId: level.id, message: `Duplicate entity id "${ent.id}"` });
      }
      entityIds.add(ent.id);

      if (ent.pos.x < -200 || ent.pos.x > level.width + 200) {
        issues.push({ levelId: level.id, message: `Entity "${ent.id}" far outside level width` });
      }

      if (ent.type === EntityType.PLATFORM || ent.type === EntityType.SPIKE) {
        hasGround = true;
      }
      if (ent.type === EntityType.TROPHY) {
        hasGoal = true;
      }
    }

    if (!hasGround && level.id !== 999) {
      issues.push({ levelId: level.id, message: 'Level has no platform/spike ground entities' });
    }

    if (!hasGoal && level.id !== 999) {
      issues.push({ levelId: level.id, message: 'Level has no trophy/goal entity' });
    }

    const checkpoints = level.entities.filter(e => e.type === EntityType.CHECKPOINT);
    if (checkpoints.length < 2 && level.id >= 1 && level.id <= 7) {
      issues.push({
        levelId: level.id,
        message: `Expected at least 2 checkpoints, found ${checkpoints.length}`,
      });
    }
  }

  return issues;
}

export function assertValidLevels(levels: LevelData[]): void {
  const issues = validateLevels(levels);
  if (issues.length === 0) return;

  const summary = issues.map(i => `[Level ${i.levelId}] ${i.message}`).join('\n');
  throw new Error(`Level validation failed:\n${summary}`);
}
