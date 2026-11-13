import { describe, expect, it } from 'vitest';

import { ATTRIBUTE_NAMES, BASIC_NEEDS, PERSONALITY_TRAITS } from '@simsand/shared';

import { assertCharacterProfile, generateCharacterProfile } from './profile.js';

describe('generateCharacterProfile', () => {
  it('is determined by the world seed and the character ID', () => {
    const profile = generateCharacterProfile(12345, 'character-0001');

    expect(generateCharacterProfile(12345, 'character-0001')).toEqual(profile);
    expect(generateCharacterProfile(12345, 'character-0002')).not.toEqual(profile);
    expect(generateCharacterProfile(99, 'character-0001')).not.toEqual(profile);
  });

  it('stays inside the valid ranges and starts the character alive and comfortable', () => {
    const profile = generateCharacterProfile(12345, 'character-0001');

    expect(profile.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(profile.lifecycle).toBe('alive');

    for (const name of ATTRIBUTE_NAMES) {
      expect(profile.attributes[name]).toBeGreaterThanOrEqual(1);
      expect(profile.attributes[name]).toBeLessThanOrEqual(10);
    }

    for (const trait of PERSONALITY_TRAITS) {
      expect(profile.personality[trait]).toBeGreaterThanOrEqual(0);
      expect(profile.personality[trait]).toBeLessThan(1);
    }

    for (const need of BASIC_NEEDS) {
      expect(profile.needs[need]).toBeGreaterThanOrEqual(0.15);
      expect(profile.needs[need]).toBeLessThan(0.45);
    }

    expect(assertCharacterProfile(profile)).toEqual(profile);
    expect(JSON.parse(JSON.stringify(profile))).toEqual(profile);
  });
});

describe('assertCharacterProfile', () => {
  const valid = generateCharacterProfile(1, 'character-0001');

  it.each([
    [{ ...valid, name: '   ' }, 'Character name must be 1-64 characters'],
    [{ ...valid, attributes: { ...valid.attributes, strength: 11 } }, 'Character attributes are missing or out of range'],
    [{ ...valid, attributes: { ...valid.attributes, strength: 1.5 } }, 'Character attributes are missing or out of range'],
    [{ ...valid, personality: { ...valid.personality, greed: 1.1 } }, 'Character personality is missing or out of range'],
    [{ ...valid, needs: { hunger: 0, thirst: 0 } }, 'Character needs are missing or out of range'],
    [{ ...valid, lifecycle: 'asleep' }, 'Unknown lifecycle state: asleep'],
  ])('rejects invalid profile %#', (profile, message) => {
    expect(() => assertCharacterProfile(profile)).toThrow(message);
  });
});
