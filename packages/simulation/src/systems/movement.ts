import { query } from 'bitecs';

import type { SimulationWorld } from '../core/world.js';

import { Position } from '../components/position.js';
import { Velocity } from '../components/velocity.js';

// update the movement of every char in the world
// we have their current pos and their vel, and clamp it to the map size.
export function updateMovement(
  world: SimulationWorld,
  deltaSeconds: number,
  worldWidth = 64,
  worldHeight = 64,
): void {
  const entities = query(world.ecs, [Position, Velocity]);

  for (const eid of entities) {
    const nextX = Position.x[eid] + Velocity.x[eid] * deltaSeconds;
    const nextY = Position.y[eid] + Velocity.y[eid] * deltaSeconds;

    Position.x[eid] = Math.max(0, Math.min(worldWidth, nextX));
    Position.y[eid] = Math.max(0, Math.min(worldHeight, nextY));
  }
}