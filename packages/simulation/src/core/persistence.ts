import { query } from 'bitecs';

import { PERSISTED_WORLD_VERSION } from '@simsand/shared';
import type { PersistedEntity, PersistedWorld } from '@simsand/shared';

import type { SimulationClock } from './clock.js';
import { createSimulationClock } from './clock.js';
import { fromWorldMapData, generateWorldMap, toWorldMapData } from './map.js';
import type { SimulationWorld } from './world.js';
import { createSimulationWorld } from './world.js';

import { Identity } from '../components/identity.js';
import { Position } from '../components/position.js';
import { Velocity } from '../components/velocity.js';
import { Appearance } from '../components/appearance.js';
import { createCharacter } from '../entities/create-character.js';

// Version 1 predates the tile map.
export type PersistedWorldV1 = Omit<PersistedWorld, 'version' | 'map'> & { version: 1 };

// Must be called between ticks so the captured state is one coherent point.
export function capturePersistedWorld(
  world: SimulationWorld,
  clock: SimulationClock,
  seed: number,
): PersistedWorld {
  const entities: PersistedEntity[] = [];

  for (const eid of query(world.ecs, [Identity, Position, Velocity, Appearance])) {
    entities.push({
      id: Identity.id[eid],
      x: Position.x[eid],
      y: Position.y[eid],
      velocityX: Velocity.x[eid],
      velocityY: Velocity.y[eid],
      color: Appearance.color[eid],
      sprite: Appearance.sprite[eid],
    });
  }

  return {
    version: PERSISTED_WORLD_VERSION,
    seed,
    tick: clock.tick,
    elapsedSeconds: clock.elapsedSeconds,
    fixedDeltaSeconds: clock.fixedDeltaSeconds,
    map: toWorldMapData(world.map),
    entities,
  };
}

// Version 1 worlds had no stored terrain, so they get the map their seed
// generates. Saving the upgraded world stores that map from then on.
export function upgradePersistedWorld(persisted: PersistedWorldV1 | PersistedWorld): PersistedWorld {
  if (persisted.version !== 1) {
    return persisted as PersistedWorld;
  }

  return {
    ...persisted,
    version: PERSISTED_WORLD_VERSION,
    map: toWorldMapData(generateWorldMap(persisted.seed)),
  };
}

export function restorePersistedWorld(persisted: PersistedWorld): {
  world: SimulationWorld;
  clock: SimulationClock;
} {
  if (persisted.version !== PERSISTED_WORLD_VERSION) {
    throw new Error(`Unsupported persisted world version: ${persisted.version}`);
  }

  const world = createSimulationWorld(fromWorldMapData(persisted.map));
  const clock = createSimulationClock(persisted.fixedDeltaSeconds);

  clock.tick = persisted.tick;
  clock.elapsedSeconds = persisted.elapsedSeconds;

  for (const entity of persisted.entities) {
    createCharacter(world, entity);
  }

  return { world, clock };
}
