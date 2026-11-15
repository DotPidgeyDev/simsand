import { query } from 'bitecs';

import { ACTION_IDS, LIFECYCLE_STATES } from '@simsand/shared';

import { nearestTerrainTile } from '../core/map.js';
import type { SimulationWorld } from '../core/world.js';

import { Action } from '../components/action.js';
import { Condition } from '../components/condition.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Position } from '../components/position.js';
import { Velocity } from '../components/velocity.js';

const DEAD = LIFECYCLE_STATES.indexOf('dead');
const MOVE = ACTION_IDS.indexOf('move');

// Point the current speed at the nearest tile of that kind. A wanderer keeps
// the velocity they already have. Speed is unchanged, so a seeker is no faster
// than anyone else.
export function steerToward(world: SimulationWorld, eid: number, kind: 'water' | 'land'): void {
  const target = nearestTerrainTile(world.map, Position.x[eid], Position.y[eid], kind);

  if (!target || target.distance === 0) return;

  const dx = target.x + 0.5 - Position.x[eid];
  const dy = target.y + 0.5 - Position.y[eid];
  const distance = Math.hypot(dx, dy);

  if (distance < 1e-6) return;

  const speed = Math.hypot(Velocity.x[eid], Velocity.y[eid]) || 1;

  Velocity.x[eid] = (dx / distance) * speed;
  Velocity.y[eid] = (dy / distance) * speed;
}

// update the movement of every char in the world
// we have their current pos and their vel, and bounce them off the map edges.
export function updateMovement(
  world: SimulationWorld,
  deltaSeconds: number,
): void {
  const { width: worldWidth, height: worldHeight } = world.map;
  const entities = query(world.ecs, [Position, Velocity]);

  for (const eid of entities) {
    // Idle, rest, eat and drink all hold the character still. The recovery
    // flags are checked as well so a saved rest stops them on the first tick.
    if (
      Lifecycle.state[eid] === DEAD
      || Action.kind[eid] !== MOVE
      || Condition.resting[eid] === 1
      || Condition.eating[eid] === 1
      || Condition.drinking[eid] === 1
    ) continue;

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
