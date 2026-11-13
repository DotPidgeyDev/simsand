import { query } from 'bitecs';

import { ATTRIBUTE_MAX, LIFECYCLE_STATES } from '@simsand/shared';
import type { DerivedStats } from '@simsand/shared';

import type { SimulationWorld } from '../core/world.js';
import { lifespanSeconds } from './lifecycle.js';

import { Attributes } from '../components/attributes.js';
import { Condition } from '../components/condition.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';

const DEAD = LIFECYCLE_STATES.indexOf('dead');

// Provisional rates, chosen so a cycle is visible within a minute or two.
// Hunger and thirst recover because the world feeds and waters a character
// once the need is pressing. Seeking a source, and choosing between needs,
// comes later. A need that only rose would pin everyone at critical.
export const FATIGUE_GAIN_PER_SECOND = 0.015;
export const FATIGUE_RECOVERY_PER_SECOND = 0.025;
export const FATIGUE_REST_AT = 0.8;
export const FATIGUE_RESUME_AT = 0.3;

export const HUNGER_GAIN_PER_SECOND = 0.004;
export const HUNGER_RECOVERY_PER_SECOND = 0.02;
export const HUNGER_EAT_AT = 0.8;
export const HUNGER_RESUME_AT = 0.3;

export const THIRST_GAIN_PER_SECOND = 0.004;
export const THIRST_RECOVERY_PER_SECOND = 0.02;
export const THIRST_DRINK_AT = 0.8;
export const THIRST_RESUME_AT = 0.3;

// Constitution 10 tires at a tenth of the rate of constitution 1.
export function fatigueGainPerSecond(constitution: number): number {
  return FATIGUE_GAIN_PER_SECOND * (ATTRIBUTE_MAX + 1 - constitution) / ATTRIBUTE_MAX;
}

export function derivedStats(constitution: number): DerivedStats {
  return {
    fatigueGainPerSecond: fatigueGainPerSecond(constitution),
    fatigueRecoveryPerSecond: FATIGUE_RECOVERY_PER_SECOND,
    lifespanSeconds: lifespanSeconds(constitution),
  };
}

// The same need value occurs on the way up and the way down, so the flag is
// what says which side of the gap the character is on.
function trackNeed(
  value: number,
  active: number,
  gainPerSecond: number,
  recoveryPerSecond: number,
  startAt: number,
  resumeAt: number,
  deltaSeconds: number,
): { value: number; active: number } {
  if (active === 1) {
    const next = Math.max(0, value - recoveryPerSecond * deltaSeconds);
    return { value: next, active: next <= resumeAt ? 0 : 1 };
  }

  const next = Math.min(1, value + gainPerSecond * deltaSeconds);
  return { value: next, active: next >= startAt ? 1 : 0 };
}

// Runs before movement. Crossing a threshold stops the character on the same
// tick, and recovering past the resume threshold lets them move again.
export function updateNeeds(world: SimulationWorld, deltaSeconds: number): void {
  const entities = query(world.ecs, [Needs, Attributes, Lifecycle, Condition]);

  for (const eid of entities) {
    if (Lifecycle.state[eid] === DEAD) continue;

    const fatigue = trackNeed(
      Needs.fatigue[eid],
      Condition.resting[eid],
      fatigueGainPerSecond(Attributes.constitution[eid]),
      FATIGUE_RECOVERY_PER_SECOND,
      FATIGUE_REST_AT,
      FATIGUE_RESUME_AT,
      deltaSeconds,
    );
    Needs.fatigue[eid] = fatigue.value;
    Condition.resting[eid] = fatigue.active;

    const hunger = trackNeed(
      Needs.hunger[eid],
      Condition.eating[eid],
      HUNGER_GAIN_PER_SECOND,
      HUNGER_RECOVERY_PER_SECOND,
      HUNGER_EAT_AT,
      HUNGER_RESUME_AT,
      deltaSeconds,
    );
    Needs.hunger[eid] = hunger.value;
    Condition.eating[eid] = hunger.active;

    const thirst = trackNeed(
      Needs.thirst[eid],
      Condition.drinking[eid],
      THIRST_GAIN_PER_SECOND,
      THIRST_RECOVERY_PER_SECOND,
      THIRST_DRINK_AT,
      THIRST_RESUME_AT,
      deltaSeconds,
    );
    Needs.thirst[eid] = thirst.value;
    Condition.drinking[eid] = thirst.active;
  }
}
