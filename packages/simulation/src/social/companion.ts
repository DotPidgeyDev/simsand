import { LIFECYCLE_STATES } from '@simsand/shared';

import { Lifecycle } from '../components/lifecycle.js';
import { Position } from '../components/position.js';
import { routeToTile } from '../core/map.js';
import type { TerrainRoute } from '../core/map.js';
import type { SimulationWorld } from '../core/world.js';
import { relationshipsFor } from '../history/records.js';

const DEAD = LIFECYCLE_STATES.indexOf('dead');

export interface CompanionRoute {
  id: string;
  route: TerrainRoute;
}

// Someone this character has met, alive and on another tile, with the next
// step toward where they stand now. Most meetings first; a tie keeps the
// lowest stable ID. Missing when nobody they know can be reached.
export function companionRoute(world: SimulationWorld, eid: number, selfId: string): CompanionRoute | undefined {  const known = relationshipsFor(world, selfId)
    .map((record) => ({ id: record.a === selfId ? record.b : record.a, meetings: record.meetings }))
    .filter((other) => other.meetings >= 1)
    .sort((left, right) => right.meetings - left.meetings || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

  for (const { id } of known) {
    const other = world.entityIds.get(id);

    if (other === undefined || Lifecycle.state[other] === DEAD) continue;

    const route = routeToTile(world.map, Position.x[eid], Position.y[eid], Position.x[other], Position.y[other]);

    if (route && route.distance > 0) return { id, route };
  }

  return undefined;
}
