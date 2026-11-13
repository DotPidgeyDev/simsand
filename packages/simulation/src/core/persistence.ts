import { query } from 'bitecs';

import { PERSISTED_WORLD_VERSION } from '@simsand/shared';
import type { CharacterProfile, PersistedEntity, PersistedWorld } from '@simsand/shared';

import { generateCharacterProfile, readCharacterProfile, spriteIdFor } from '../characters/profile.js';
import { Condition } from '../components/condition.js';
import { FATIGUE_REST_AT } from '../systems/needs.js';
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

// Version 1 predates the tile map. Version 2 predates the character profile.
// Version 3 predates the resting flag. Version 4 stores a numeric sprite.
type PersistedEntityV2 = Omit<PersistedEntity, keyof CharacterProfile | 'resting'>;

export type PersistedWorldV4 = Omit<PersistedWorld, 'version' | 'entities'> & {
  version: 4;
  entities: Array<Omit<PersistedEntity, 'sprite'> & { sprite: number }>;
};

export type PersistedWorldV3 = Omit<PersistedWorldV4, 'version' | 'entities'> & {
  version: 3;
  entities: Array<Omit<PersistedWorldV4['entities'][number], 'resting'>>;
};

export type PersistedWorldV2 = Omit<PersistedWorld, 'version' | 'entities'> & {
  version: 2;
  entities: PersistedEntityV2[];
};

export type PersistedWorldV1 = Omit<PersistedWorldV2, 'version' | 'map'> & { version: 1 };

export type UpgradeableWorld = PersistedWorldV1 | PersistedWorldV2 | PersistedWorldV3 | PersistedWorldV4 | PersistedWorld;

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
      ...readCharacterProfile(eid),
      color: Appearance.color[eid],
      sprite: Appearance.sprite[eid],
      resting: Condition.resting[eid] === 1,
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

// Older saves are filled in from their seed: version 1 gets its map, and
// version 2 gets each character's profile. The next save stores both.
export function upgradePersistedWorld(persisted: UpgradeableWorld): PersistedWorld {
  if (persisted.version === 1) {
    const withMap: PersistedWorldV2 = {
      ...persisted,
      version: 2,
      map: toWorldMapData(generateWorldMap(persisted.seed)),
    };

    return upgradePersistedWorld(withMap);
  }

  if (persisted.version === 2) {
    const withProfile = {
      ...persisted,
      version: 3 as const,
      entities: persisted.entities.map((entity) => ({
        ...entity,
        ...generateCharacterProfile(persisted.seed, entity.id),
      })),
    } as unknown as PersistedWorldV3;

    return upgradePersistedWorld(withProfile);
  }

  if (persisted.version === 3) {
    const withRest = {
      ...persisted,
      version: 4 as const,
      entities: persisted.entities.map((entity) => ({
        ...entity,
        resting: entity.needs.fatigue >= FATIGUE_REST_AT,
      })),
    } as PersistedWorldV4;

    return upgradePersistedWorld(withRest);
  }

  if (persisted.version === 4) {
    return {
      ...persisted,
      version: PERSISTED_WORLD_VERSION,
      entities: persisted.entities.map((entity) => ({
        ...entity,
        sprite: spriteIdFor(persisted.seed, entity.id),
      })),
    };
  }

  return persisted as PersistedWorld;
}

export function restorePersistedWorld(persisted: PersistedWorld): {
  world: SimulationWorld;
  clock: SimulationClock;
} {
  if (persisted.version !== PERSISTED_WORLD_VERSION) {
    throw new Error(`Unsupported persisted world version: ${persisted.version}`);
  }

  const world = createSimulationWorld(fromWorldMapData(persisted.map), persisted.seed);
  const clock = createSimulationClock(persisted.fixedDeltaSeconds);

  clock.tick = persisted.tick;
  clock.elapsedSeconds = persisted.elapsedSeconds;

  for (const entity of persisted.entities) {
    createCharacter(world, entity);
  }

  return { world, clock };
}
