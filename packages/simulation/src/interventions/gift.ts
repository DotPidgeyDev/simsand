import type { ItemId } from '@simsand/shared';

import { Position } from '../components/position.js';
import type { SimulationWorld } from '../core/world.js';
import { grantItem } from '../economy/inventory.js';
import { recordIntervention } from '../log/events.js';
import { livingTarget } from './outcome.js';
import type { InterventionCause, InterventionOutcome } from './outcome.js';

// Items from nowhere into one living character's inventory.
export function giftCharacter(
  world: SimulationWorld,
  characterId: string,
  item: ItemId,
  quantity: number,
  cause: InterventionCause,
): InterventionOutcome {
  const target = livingTarget(world, characterId);

  if (!('eid' in target)) return target;

  grantItem(world, characterId, item, quantity);

  return {
    status: 'applied',
    event: recordIntervention(
      world,
      'intervention.gifted',
      [characterId],
      { x: Position.x[target.eid], y: Position.y[target.eid] },
      { ...cause, target: characterId, item, quantity },
    ),
  };
}
