import { DIRECTOR_REASONS } from '@simsand/shared';
import type { DirectorReason } from '@simsand/shared';

import { readTuningNumber } from '../tuning.js';

export interface DirectorSettings {
  rules: Record<DirectorReason, boolean>;
  checkSeconds: number;
  // At most one act in this long, across the whole world.
  actSeconds: number;
  // At most one act on the same character in this long.
  targetSeconds: number;
  mercyAfterSeconds: number;
  mercyRadius: number;
  kindnessWindowSeconds: number;
  kindnessActs: number;
  hoardMinItems: number;
  hoardFactor: number;
  scarcityBounty: number;
}

export const directorDefaults: Readonly<DirectorSettings> = Object.freeze({
  rules: Object.freeze({ mercy: true, scarcity: true, kindness: true, hubris: true }),
  checkSeconds: 5,
  actSeconds: 60,
  targetSeconds: 300,
  mercyAfterSeconds: 60,
  mercyRadius: 8,
  kindnessWindowSeconds: 300,
  kindnessActs: 3,
  hoardMinItems: 12,
  hoardFactor: 3,
  scarcityBounty: 3,
});

type NumericSetting = Exclude<keyof DirectorSettings, 'rules'>;

const NUMBER_ENV: Record<NumericSetting, { name: string; allowZero: boolean; integer?: boolean }> = {
  checkSeconds: { name: 'SIMSAND_DIRECTOR_CHECK_SECONDS', allowZero: false },
  actSeconds: { name: 'SIMSAND_DIRECTOR_ACT_SECONDS', allowZero: true },
  targetSeconds: { name: 'SIMSAND_DIRECTOR_TARGET_SECONDS', allowZero: true },
  mercyAfterSeconds: { name: 'SIMSAND_DIRECTOR_MERCY_AFTER_SECONDS', allowZero: true },
  mercyRadius: { name: 'SIMSAND_DIRECTOR_MERCY_RADIUS', allowZero: true },
  kindnessWindowSeconds: { name: 'SIMSAND_DIRECTOR_KINDNESS_WINDOW_SECONDS', allowZero: false },
  kindnessActs: { name: 'SIMSAND_DIRECTOR_KINDNESS_ACTS', allowZero: false, integer: true },
  hoardMinItems: { name: 'SIMSAND_DIRECTOR_HOARD_MIN_ITEMS', allowZero: false, integer: true },
  hoardFactor: { name: 'SIMSAND_DIRECTOR_HOARD_FACTOR', allowZero: false },
  scarcityBounty: { name: 'SIMSAND_DIRECTOR_SCARCITY_BOUNTY', allowZero: false, integer: true },
};

// The director runs unless SIMSAND_DIRECTOR=off. SIMSAND_DIRECTOR_RULES
// takes a comma-separated list of the rules to keep; the rest default
// to directorDefaults and take the matching SIMSAND_DIRECTOR_ variable.
export function readDirectorSettings(
  env: Record<string, string | undefined> = process.env,
): DirectorSettings | null {
  if (env.SIMSAND_DIRECTOR?.trim() === 'off') return null;

  const settings: DirectorSettings = { ...directorDefaults, rules: readRules(env.SIMSAND_DIRECTOR_RULES) };

  for (const key of Object.keys(NUMBER_ENV) as NumericSetting[]) {
    const { name, allowZero, integer } = NUMBER_ENV[key];
    const value = readTuningNumber(name, env[name], directorDefaults[key], allowZero);

    if (integer && !Number.isInteger(value)) throw new Error(`${name} must be a whole number`);
    settings[key] = value;
  }

  return settings;
}

function readRules(raw: string | undefined): Record<DirectorReason, boolean> {
  if (raw === undefined || raw.trim() === '') return { ...directorDefaults.rules };

  const named = raw.split(',').map((rule) => rule.trim()).filter((rule) => rule !== '');

  for (const rule of named) {
    if (!(DIRECTOR_REASONS as readonly string[]).includes(rule)) {
      throw new Error(`SIMSAND_DIRECTOR_RULES names an unknown rule: ${rule} (expected ${DIRECTOR_REASONS.join(', ')})`);
    }
  }

  return Object.fromEntries(
    DIRECTOR_REASONS.map((rule) => [rule, named.includes(rule)]),
  ) as Record<DirectorReason, boolean>;
}
