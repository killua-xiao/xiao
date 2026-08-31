import { describe, expect, it } from 'vitest';
import { validateLevels } from './levelValidation';
import { levels } from '../levels';

describe('levelValidation', () => {
  it('passes for shipped levels', () => {
    expect(validateLevels(levels)).toEqual([]);
  });
});
