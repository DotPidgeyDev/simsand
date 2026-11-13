import { query } from 'bitecs';

import { LIFECYCLE_STATES } from '@simsand/shared';

import type { SimulationWorld } from '../core/world.js';

import { Lifecycle } from '../components/lifecycle.js';
import { Position } from '../components/position.js';
import { Velocity } from '../components/velocity.js';

const DEAD = LIFECYCLE_STATES.indexOf('dead');

// update the movement of every char in the world
// we have their current pos and their vel, and bounce them off the map edges.
export function updateMovement(
  world: SimulationWorld,
  deltaSeconds: number,
): void {
  const { width: worldWidth, height: worldHeight } = world.map;
  const entities = query(world.ecs, [Position, Velocity]);

  for (const eid of entities) {
    if (Lifecycle.state[eid] === DEAD) continue;

    const x = bounce(Position.x[eid] + Velocity.x[eid] * deltaSeconds, worldWidth);
    const y = bounce(Position.y[eid] + Velocity.y[eid] * deltaSeconds, worldHeight);

    Position.x[eid] = x.position;
    Position.y[eid] = y.position;

    if (x.reflected) Velocity.x[eid] = -Velocity.x[eid];
    if (y.reflected) Velocity.y[eid] = -Velocity.y[eid];
  }
}

// Clamping alone would leave the velocity pointing out of the map, pinning
// characters against the edge until they slide into a corner.
function bounce(next: number, max: number): { position: number; reflected: boolean } {
  if (next < 0) {
    return { position: Math.min(max, -next), reflected: true };
  }

  if (next > max) {
    return { position: Math.max(0, 2 * max - next), reflected: true };
  }

  return { position: next, reflected: false };
}
