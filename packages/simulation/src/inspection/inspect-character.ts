import type { EntityInspection } from '@simsand/shared';

import { readCharacterProfile } from '../characters/profile.js';
import { Condition } from '../components/condition.js';
import { Attributes } from '../components/attributes.js';
import { derivedStats } from '../systems/needs.js';
import { getTile } from '../core/map.js';
import type { SimulationWorld } from '../core/world.js';

import { Appearance } from '../components/appearance.js';
import { Position } from '../components/position.js';
import { Velocity } from '../components/velocity.js';

export function inspectCharacter(
  world: SimulationWorld,
  id: string,
): EntityInspection | undefined {
  const eid = world.entityIds.get(id);

  if (eid === undefined) {
    return undefined;
  }

  const x = Position.x[eid];
  const y = Position.y[eid];
  const tileX = Math.min(world.map.width - 1, Math.max(0, Math.floor(x)));
  const tileY = Math.min(world.map.height - 1, Math.max(0, Math.floor(y)));

  return {
    id,
    x,
    y,
    velocityX: Velocity.x[eid],
    velocityY: Velocity.y[eid],
    color: Appearance.color[eid],
    sprite: Appearance.sprite[eid],
    ...readCharacterProfile(eid),
    resting: Condition.resting[eid] === 1,
    eating: Condition.eating[eid] === 1,
    drinking: Condition.drinking[eid] === 1,
    derived: derivedStats(Attributes.constitution[eid]),
    tile: { x: tileX, y: tileY, terrain: getTile(world.map, tileX, tileY)! },
  };
}
