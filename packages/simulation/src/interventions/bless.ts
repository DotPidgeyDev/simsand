import { BASIC_NEEDS } from '@simsand/shared';

import { Needs } from '../components/needs.js';
import { Position } from '../components/position.js';
import type { SimulationWorld } from '../core/world.js';
import { recordIntervention } from '../log/events.js';
import { livingTarget } from './outcome.js';
import type { InterventionCause, InterventionOutcome } from './outcome.js';

// Every need back to satisfied. What they do next is still their choice.
export function blessCharacter(
  world: SimulationWorld,
  characterId: string,
  cause: InterventionCause,
): InterventionOutcome {
  const target = livingTarget(world, characterId);

  if (!('eid' in target)) return target;

  for (const need of BASIC_NEEDS) Needs[need][target.eid] = 0;

  return {
    status: 'applied',
    event: recordIntervention(
      world,
      'intervention.blessed',
      [characterId],
      { x: Position.x[target.eid], y: Position.y[target.eid] },
      { ...cause, target: characterId },
    ),
  };
}
