import type { SimulationWorld } from '../core/world.js';
import { nodeKey } from '../economy/nodes.js';
import { recordIntervention } from '../log/events.js';
import { refuse } from './outcome.js';
import type { InterventionCause, InterventionOutcome } from './outcome.js';

// Adds material to a natural pile site. A depleted site comes back early
// with the bounty instead of waiting to return. A tile that has never held
// a pile is refused, because every pile that runs out returns as material
// on its own tile.
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
  } else if (world.returning.has(key)) {
    world.returning.delete(key);
    world.nodes.set(key, { x, y, item: 'material', quantity });
  } else {
    return refuse('tile_unavailable', `Tile (${x}, ${y}) is not a pile site`);
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
