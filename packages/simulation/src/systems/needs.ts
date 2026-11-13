import { query } from 'bitecs';

import { ATTRIBUTE_MAX, LIFECYCLE_STATES } from '@simsand/shared';
import type { DerivedStats } from '@simsand/shared';

import type { SimulationWorld } from '../core/world.js';

import { Attributes } from '../components/attributes.js';
import { Condition } from '../components/condition.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';

const DEAD = LIFECYCLE_STATES.indexOf('dead');

// Provisional rates, chosen so a resting cycle is visible within a minute
// or two. Hunger and thirst are not changed: nothing can feed a character yet,
// and a need that only rises would pin everyone at critical.
export const FATIGUE_GAIN_PER_SECOND = 0.015;
export const FATIGUE_RECOVERY_PER_SECOND = 0.025;
export const FATIGUE_REST_AT = 0.8;
export const FATIGUE_RESUME_AT = 0.3;

// Constitution 10 tires at a tenth of the rate of constitution 1.
export function fatigueGainPerSecond(constitution: number): number {
  return FATIGUE_GAIN_PER_SECOND * (ATTRIBUTE_MAX + 1 - constitution) / ATTRIBUTE_MAX;
}

export function derivedStats(constitution: number): DerivedStats {
  return {
    fatigueGainPerSecond: fatigueGainPerSecond(constitution),
    fatigueRecoveryPerSecond: FATIGUE_RECOVERY_PER_SECOND,
  };
}

// Runs before movement. Crossing the rest threshold stops the character on
// the same tick, and recovering past the resume threshold lets them move again.
export function updateNeeds(world: SimulationWorld, deltaSeconds: number): void {
  const entities = query(world.ecs, [Needs, Attributes, Lifecycle, Condition]);

  for (const eid of entities) {
    if (Lifecycle.state[eid] === DEAD) continue;

    if (Condition.resting[eid] === 1) {
      Needs.fatigue[eid] = Math.max(0, Needs.fatigue[eid] - FATIGUE_RECOVERY_PER_SECOND * deltaSeconds);

      if (Needs.fatigue[eid] <= FATIGUE_RESUME_AT) {
        Condition.resting[eid] = 0;
      }
    } else {
      const gain = fatigueGainPerSecond(Attributes.constitution[eid]);
      Needs.fatigue[eid] = Math.min(1, Needs.fatigue[eid] + gain * deltaSeconds);

      if (Needs.fatigue[eid] >= FATIGUE_REST_AT) {
        Condition.resting[eid] = 1;
      }
    }
  }
}
