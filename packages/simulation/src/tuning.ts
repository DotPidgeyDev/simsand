// Provisional speeds for the needs and the lifespan. The defaults keep a meal
// visible within a few minutes. A life is 6 hours per constitution point, so
// constitution 1 lives 6 hours and constitution 10 lives 60. Override any of
// them with the matching SIMSAND_ environment variable when starting the server.
export const tuningDefaults = {
  lifespanPerConstitutionSeconds: 6 * 60 * 60,
  fatigueGainPerSecond: 0.015,
  fatigueRecoveryPerSecond: 0.025,
  hungerGainPerSecond: 0.004,
  hungerRecoveryPerSecond: 0.02,
  thirstGainPerSecond: 0.004,
  thirstRecoveryPerSecond: 0.02,
};

export const tuning = { ...tuningDefaults };

const RATE_ENV = {
  lifespanPerConstitutionSeconds: 'SIMSAND_LIFESPAN_PER_CONSTITUTION_SECONDS',
  fatigueGainPerSecond: 'SIMSAND_FATIGUE_GAIN_PER_SECOND',
  fatigueRecoveryPerSecond: 'SIMSAND_FATIGUE_RECOVERY_PER_SECOND',
  hungerGainPerSecond: 'SIMSAND_HUNGER_GAIN_PER_SECOND',
  hungerRecoveryPerSecond: 'SIMSAND_HUNGER_RECOVERY_PER_SECOND',
  thirstGainPerSecond: 'SIMSAND_THIRST_GAIN_PER_SECOND',
  thirstRecoveryPerSecond: 'SIMSAND_THIRST_RECOVERY_PER_SECOND',
} as const;

export function applyTuning(env: Record<string, string | undefined> = process.env): void {
  for (const key of Object.keys(tuningDefaults) as (keyof typeof tuningDefaults)[]) {
    const allowZero = key !== 'lifespanPerConstitutionSeconds';
    tuning[key] = readTuningNumber(RATE_ENV[key], env[RATE_ENV[key]], tuningDefaults[key], allowZero);
  }
}

export function readTuningNumber(
  name: string,
  raw: string | undefined,
  fallback: number,
  allowZero: boolean,
): number {
  if (raw === undefined || raw.trim() === '') return fallback;

  const value = Number(raw);

  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    const bound = allowZero ? 'zero or more' : 'greater than zero';
    throw new Error(`${name} must be a finite number ${bound}`);
  }

  return value;
}
