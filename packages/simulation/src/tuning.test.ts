import { afterEach, describe, expect, it } from 'vitest';

import { lifespanSeconds } from './systems/lifecycle.js';
import { applyTuning, tuning, tuningDefaults } from './tuning.js';

describe('applyTuning', () => {
  afterEach(() => {
    applyTuning({});
  });

  it('keeps the defaults when the environment does not say otherwise', () => {
    applyTuning({});

    expect(tuning.lifespanPerConstitutionSeconds).toBe(tuningDefaults.lifespanPerConstitutionSeconds);
    expect(lifespanSeconds(1)).toBe(6 * 60 * 60);
    expect(lifespanSeconds(10)).toBe(lifespanSeconds(1) * 10);
    expect(tuning.hungerGainPerSecond).toBe(0.004);
    expect(tuning.thirstRecoveryPerSecond).toBe(0.02);
  });

  it('reads a lifespan and a need rate from the environment', () => {
    applyTuning({
      SIMSAND_LIFESPAN_PER_CONSTITUTION_SECONDS: '600',
      SIMSAND_HUNGER_GAIN_PER_SECOND: '0.001',
    });

    expect(tuning.lifespanPerConstitutionSeconds).toBe(600);
    expect(lifespanSeconds(1)).toBe(600);
    expect(tuning.hungerGainPerSecond).toBe(0.001);
    expect(tuning.fatigueGainPerSecond).toBe(tuningDefaults.fatigueGainPerSecond);
  });

  it('rejects a lifespan of zero and a rate that is not a number', () => {
    expect(() => applyTuning({ SIMSAND_LIFESPAN_PER_CONSTITUTION_SECONDS: '0' })).toThrow(
      'SIMSAND_LIFESPAN_PER_CONSTITUTION_SECONDS must be a finite number greater than zero',
    );
    expect(() => applyTuning({ SIMSAND_THIRST_GAIN_PER_SECOND: 'fast' })).toThrow(
      'SIMSAND_THIRST_GAIN_PER_SECOND must be a finite number zero or more',
    );
  });
});
