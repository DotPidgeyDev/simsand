import { query } from 'bitecs';

import { ATTRIBUTE_MAX, LIFECYCLE_STATES } from '@simsand/shared';
import type { DerivedStats } from '@simsand/shared';

import type { SimulationWorld } from '../core/world.js';
import { tuning, tuningDefaults } from '../tuning.js';
import { lifespanSeconds } from './lifecycle.js';

import { Attributes } from '../components/attributes.js';
import { Condition } from '../components/condition.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';

const DEAD = LIFECYCLE_STATES.indexOf('dead');

// The per-second rates live in tuning.ts and can be overridden from the
// environment. These names are the defaults. The thresholds stay here because
// they decide when an action starts and stops, not how fast a need moves.
export const FATIGUE_GAIN_PER_SECOND = tuningDefaults.fatigueGainPerSecond;
export const FATIGUE_RECOVERY_PER_SECOND = tuningDefaults.fatigueRecoveryPerSecond;
export const FATIGUE_REST_AT = 0.8;
export const FATIGUE_RESUME_AT = 0.3;

export const HUNGER_GAIN_PER_SECOND = tuningDefaults.hungerGainPerSecond;
export const HUNGER_RECOVERY_PER_SECOND = tuningDefaults.hungerRecoveryPerSecond;
export const HUNGER_EAT_AT = 0.8;
export const HUNGER_RESUME_AT = 0.3;

export const THIRST_GAIN_PER_SECOND = tuningDefaults.thirstGainPerSecond;
export const THIRST_RECOVERY_PER_SECOND = tuningDefaults.thirstRecoveryPerSecond;
export const THIRST_DRINK_AT = 0.8;
export const THIRST_RESUME_AT = 0.3;

// Constitution 10 tires at a tenth of the rate of constitution 1.
export function fatigueGainPerSecond(constitution: number): number {
  return tuning.fatigueGainPerSecond * (ATTRIBUTE_MAX + 1 - constitution) / ATTRIBUTE_MAX;
}

export function derivedStats(constitution: number): DerivedStats {
  return {
    fatigueGainPerSecond: fatigueGainPerSecond(constitution),
    fatigueRecoveryPerSecond: tuning.fatigueRecoveryPerSecond,
    lifespanSeconds: lifespanSeconds(constitution),
  };
}

function applyNeed(
  value: number,
  active: number,
  gainPerSecond: number,
  recoveryPerSecond: number,
  deltaSeconds: number,
): number {
  if (active === 1) return Math.max(0, value - recoveryPerSecond * deltaSeconds);

  return Math.min(1, value + gainPerSecond * deltaSeconds);
}

// Runs after the action choice. The flags say which need is recovering.
// This system does not start or stop an action.
export function updateNeeds(world: SimulationWorld, deltaSeconds: number): void {
  const entities = query(world.ecs, [Needs, Attributes, Lifecycle, Condition]);

  for (const eid of entities) {
    if (Lifecycle.state[eid] === DEAD) continue;

    Needs.fatigue[eid] = applyNeed(
      Needs.fatigue[eid],
      Condition.resting[eid],
      fatigueGainPerSecond(Attributes.constitution[eid]),
      tuning.fatigueRecoveryPerSecond,
      deltaSeconds,
    );
    Needs.hunger[eid] = applyNeed(
      Needs.hunger[eid],
      Condition.eating[eid],
      tuning.hungerGainPerSecond,
      tuning.hungerRecoveryPerSecond,
      deltaSeconds,
    );
    Needs.thirst[eid] = applyNeed(
      Needs.thirst[eid],
      Condition.drinking[eid],
      tuning.thirstGainPerSecond,
      tuning.thirstRecoveryPerSecond,
      deltaSeconds,
    );
  }
}
