import { query } from 'bitecs';

import { LIFECYCLE_STATES } from '@simsand/shared';

import type { SimulationWorld } from '../core/world.js';

import { Attributes } from '../components/attributes.js';
import { Condition } from '../components/condition.js';
import { Lifecycle } from '../components/lifecycle.js';

const DEAD = LIFECYCLE_STATES.indexOf('dead');

// Provisional, like the need rates: a life is short enough to observe.
// Constitution 10 lives ten times as long as constitution 1. Nothing replaces
// the dead yet.
export const LIFESPAN_PER_CONSTITUTION_SECONDS = 600;

export function lifespanSeconds(constitution: number): number {
  return LIFESPAN_PER_CONSTITUTION_SECONDS * constitution;
}

// Runs before needs and movement, so the tick a character dies is also the
// tick they stop recovering and stop moving.
export function updateLifecycle(world: SimulationWorld, deltaSeconds: number): void {
  const entities = query(world.ecs, [Lifecycle, Attributes, Condition]);

  for (const eid of entities) {
    if (Lifecycle.state[eid] === DEAD) continue;

    Lifecycle.ageSeconds[eid] += deltaSeconds;

    if (Lifecycle.ageSeconds[eid] < lifespanSeconds(Attributes.constitution[eid])) continue;

    Lifecycle.state[eid] = DEAD;
    Condition.resting[eid] = 0;
    Condition.eating[eid] = 0;
    Condition.drinking[eid] = 0;
  }
}
