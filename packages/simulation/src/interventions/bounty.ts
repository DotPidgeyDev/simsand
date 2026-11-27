import { TERRAIN_TYPES } from '@simsand/shared';

import type { SimulationWorld } from '../core/world.js';
import { nodeKey } from '../economy/nodes.js';
import { recordIntervention } from '../log/events.js';
import { refuse } from './outcome.js';
import type { InterventionCause, InterventionOutcome } from './outcome.js';

const GRASS = TERRAIN_TYPES.indexOf('grass');

// Adds material to a pile site. A depleted site comes back early with the
// bounty instead of waiting to return. Bare grass becomes a new site: once
// that pile runs out it returns on its tile like any other. Other terrain is
// refused, because generated piles only sit on grass.
export function placeBounty(
  world: SimulationWorld,
  x: number,
  y: number,
  quantity: number,
  cause: InterventionCause,
): InterventionOutcome {
  if (x >= world.map.width || y >= world.map.height) {
    return refuse('out_of_bounds', `Tile (${x}, ${y}) is outside the world`);
  }

  const key = nodeKey(world.map.width, x, y);
  const pile = world.nodes.get(key);

  if (pile) {
    pile.quantity += quantity;
  } else if (world.returning.has(key) || world.map.tiles[key] === GRASS) {
    world.returning.delete(key);
    world.nodes.set(key, { x, y, item: 'material', quantity });
  } else {
    return refuse('tile_unavailable', `Tile (${x}, ${y}) is not grass`);
  }

  return {
    status: 'applied',
    event: recordIntervention(
      world,
      'intervention.bounty',
      [],
      { x: x + 0.5, y: y + 0.5 },
      { ...cause, item: 'material', quantity },
    ),
  };
}
