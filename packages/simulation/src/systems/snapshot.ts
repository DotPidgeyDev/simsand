import { query } from 'bitecs';

import { toWorldMapData } from '../core/map.js';
import type { SimulationWorld } from '../core/world.js';

import { Condition } from '../components/condition.js';
import { Identity } from '../components/identity.js';
import { Position } from '../components/position.js';
import { Appearance } from '../components/appearance.js';

import type { EntitySnapshot, WorldSnapshot } from '@simsand/shared';

export function createWorldSnapshot(
  world: SimulationWorld,
  tick: number,
  elapsedSeconds: number,
): WorldSnapshot {
  const entities = query(world.ecs, [
    Identity,
    Position,
    Appearance,
  ]);

  const entitySnapshots: EntitySnapshot[] = [];

  for (const eid of entities) {
    entitySnapshots.push({
      id: Identity.id[eid],
      x: Position.x[eid],
      y: Position.y[eid],
      color: Appearance.color[eid],
      sprite: Appearance.sprite[eid],
      resting: Condition.resting[eid] === 1,
      eating: Condition.eating[eid] === 1,
      drinking: Condition.drinking[eid] === 1,
    });
  }

  return {
    tick,
    elapsedSeconds,
    map: toWorldMapData(world.map),
    entities: entitySnapshots,
  };
}