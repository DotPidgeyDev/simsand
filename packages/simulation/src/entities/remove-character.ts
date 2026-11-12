import { removeEntity } from 'bitecs';

import type { SimulationWorld } from '../core/world.js';

// remove a char by its stable id. returns false if no char has that id.
export function removeCharacter(
  world: SimulationWorld,
  id: string,
): boolean {
  const eid = world.entityIds.get(id);

  if (eid === undefined) {
    return false;
  }

  removeEntity(world.ecs, eid);
  world.entityIds.delete(id);

  return true;
}
