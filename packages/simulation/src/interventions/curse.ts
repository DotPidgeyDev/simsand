import type { BasicNeed } from '@simsand/shared';

import { Needs } from '../components/needs.js';
import { Position } from '../components/position.js';
import type { SimulationWorld } from '../core/world.js';
import { recordIntervention } from '../log/events.js';
import { FATIGUE_REST_AT, HUNGER_EAT_AT, THIRST_DRINK_AT } from '../systems/needs.js';
import { livingTarget } from './outcome.js';
import type { InterventionCause, InterventionOutcome } from './outcome.js';

// The line where each need interrupts whatever the character is doing.
const URGENT_AT: Record<BasicNeed, number> = {
  hunger: HUNGER_EAT_AT,
  thirst: THIRST_DRINK_AT,
  fatigue: FATIGUE_REST_AT,
};

// Raises one need to its urgent line. A need already past it stays put.
// The ordinary interruption rule does the rest.
export function curseCharacter(
  world: SimulationWorld,
  characterId: string,
  need: BasicNeed,
  cause: InterventionCause,
): InterventionOutcome {
  const target = livingTarget(world, characterId);

  if (!('eid' in target)) return target;

  const level = Math.max(Needs[need][target.eid], URGENT_AT[need]);
  Needs[need][target.eid] = level;

  return {
    status: 'applied',
    event: recordIntervention(
      world,
      'intervention.cursed',
      [characterId],
      { x: Position.x[target.eid], y: Position.y[target.eid] },
      { ...cause, target: characterId, need, level },
    ),
  };
}
