import { query } from 'bitecs';

import { ACTION_IDS, PERSISTED_WORLD_VERSION } from '@simsand/shared';
import type { ActionId, CharacterProfile, MemoryRecord, PersistedEntity, PersistedWorld, RelationshipRecord, SimulationLogEvent } from '@simsand/shared';

import { generateCharacterProfile, readCharacterProfile, spriteIdFor, startingAgeSeconds } from '../characters/profile.js';
import { Action } from '../components/action.js';
import { emptyCooldowns, readActionOutcome } from '../systems/actions.js';
import { Condition } from '../components/condition.js';
import { FATIGUE_REST_AT, HUNGER_EAT_AT, THIRST_DRINK_AT } from '../systems/needs.js';
import type { SimulationClock } from './clock.js';
import { createSimulationClock } from './clock.js';
import { fromWorldMapData, generateWorldMap, stampCamps, stampRocks, toWorldMapData } from './map.js';
import type { SimulationWorld } from './world.js';
import { createSimulationWorld } from './world.js';

import { Lifecycle } from '../components/lifecycle.js';
import { Identity } from '../components/identity.js';
import { Position } from '../components/position.js';
import { Velocity } from '../components/velocity.js';
import { Appearance } from '../components/appearance.js';
import { createCharacter } from '../entities/create-character.js';
import { pairKey } from '../social/relationships.js';

// Version 1 predates the tile map. Version 2 predates the character profile.
// Version 3 predates the resting flag. Version 4 stores a numeric sprite.
// Version 5 predates the eating and drinking flags. Version 6 predates age.
// Version 7 predates the chosen action. Version 8 predates action cooldowns.
// Version 9 predates the outcome of the previous action.
// Version 10 predates rock. Version 11 predates camps and work.
// Version 12 predates greet, relationships and the character log.
// Version 13 predates memories.
// Version 14 predates comfort.
type PersistedEntityV2 = Omit<
  PersistedEntity,
  keyof CharacterProfile | 'resting' | 'eating' | 'drinking' | 'ageSeconds' | 'action' | 'actionSeconds' | 'cooldowns' | 'outcome'
>;

export type PersistedWorldV14 = Omit<PersistedWorld, 'version' | 'entities'> & {
  version: 14;
  entities: Array<Omit<PersistedEntity, 'cooldowns'> & {
    cooldowns: Omit<PersistedEntity['cooldowns'], 'comfort'>;
  }>;
};

export type PersistedWorldV13 = Omit<PersistedWorldV14, 'version' | 'memories'> & {
  version: 13;
};

export type PersistedWorldV12 = Omit<PersistedWorldV13, 'version' | 'entities' | 'relationships' | 'log'> & {
  version: 12;
  entities: Array<Omit<PersistedEntity, 'actionTarget'>>;
};

export type PersistedWorldV11 = Omit<PersistedWorldV12, 'version' | 'entities'> & {
  version: 11;
  entities: Array<Omit<PersistedWorldV12['entities'][number], 'working'>>;
};

export type PersistedWorldV10 = Omit<PersistedWorldV11, 'version'> & { version: 10 };

export type PersistedWorldV9 = Omit<PersistedWorldV10, 'version' | 'entities'> & {
  version: 9;
  entities: Array<Omit<PersistedEntity, 'outcome'>>;
};

export type PersistedWorldV8 = Omit<PersistedWorldV9, 'version' | 'entities'> & {
  version: 8;
  entities: Array<Omit<PersistedWorldV9['entities'][number], 'cooldowns'>>;
};

export type PersistedWorldV7 = Omit<PersistedWorldV8, 'version' | 'entities'> & {
  version: 7;
  entities: Array<Omit<PersistedWorldV8['entities'][number], 'action' | 'actionSeconds'>>;
};

export type PersistedWorldV6 = Omit<PersistedWorldV7, 'version' | 'entities'> & {
  version: 6;
  entities: Array<Omit<PersistedWorldV7['entities'][number], 'ageSeconds'>>;
};

export type PersistedWorldV5 = Omit<PersistedWorldV6, 'version' | 'entities'> & {
  version: 5;
  entities: Array<Omit<PersistedWorldV6['entities'][number], 'eating' | 'drinking'>>;
};

export type PersistedWorldV4 = Omit<PersistedWorldV5, 'version' | 'entities'> & {
  version: 4;
  entities: Array<Omit<PersistedWorldV5['entities'][number], 'sprite'> & { sprite: number }>;
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

export type UpgradeableWorld =
  | PersistedWorldV1
  | PersistedWorldV2
  | PersistedWorldV3
  | PersistedWorldV4
  | PersistedWorldV5
  | PersistedWorldV6
  | PersistedWorldV7
  | PersistedWorldV8
  | PersistedWorldV9
  | PersistedWorldV10
  | PersistedWorldV11
  | PersistedWorldV12
  | PersistedWorldV13
  | PersistedWorldV14
  | PersistedWorld;

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
      eating: Condition.eating[eid] === 1,
      drinking: Condition.drinking[eid] === 1,
      working: Condition.working[eid] === 1,
      ageSeconds: Lifecycle.ageSeconds[eid],
      action: ACTION_IDS[Action.kind[eid]] ?? 'move',
      actionSeconds: Action.elapsed[eid],
      cooldowns: {
        idle: Action.cooldown.idle[eid],
        move: Action.cooldown.move[eid],
        eat: Action.cooldown.eat[eid],
        rest: Action.cooldown.rest[eid],
        drink: Action.cooldown.drink[eid],
        work: Action.cooldown.work[eid],
        greet: Action.cooldown.greet[eid],
        comfort: Action.cooldown.comfort[eid],
      },
      outcome: readActionOutcome(eid),
      actionTarget: Action.target[eid] ?? '',
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
    relationships: [...world.relationships.values()],
    log: [...world.log],
    memories: [...world.memories],
  };
}

function actionFromFlags(entity: {
  eating: boolean;
  drinking: boolean;
  resting: boolean;
  needs: { hunger: number; thirst: number; fatigue: number };
}): ActionId {
  const ranked: Array<[ActionId, number]> = [];

  if (entity.eating) ranked.push(['eat', entity.needs.hunger]);
  if (entity.drinking) ranked.push(['drink', entity.needs.thirst]);
  if (entity.resting) ranked.push(['rest', entity.needs.fatigue]);
  if (ranked.length === 0) return 'move';

  ranked.sort((left, right) => right[1] - left[1]);
  return ranked[0][0];
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
    const withSprite = {
      ...persisted,
      version: 5 as const,
      entities: persisted.entities.map((entity) => ({
        ...entity,
        sprite: spriteIdFor(persisted.seed, entity.id),
      })),
    } as unknown as PersistedWorldV5;

    return upgradePersistedWorld(withSprite);
  }

  if (persisted.version === 5) {
    const withSustenance = {
      ...persisted,
      version: 6 as const,
      entities: persisted.entities.map((entity) => ({
        ...entity,
        eating: entity.needs.hunger >= HUNGER_EAT_AT,
        drinking: entity.needs.thirst >= THIRST_DRINK_AT,
      })),
    } as unknown as PersistedWorldV6;

    return upgradePersistedWorld(withSustenance);
  }

  if (persisted.version === 6) {
    const withAge = {
      ...persisted,
      version: 7 as const,
      entities: persisted.entities.map((entity) => ({
        ...entity,
        ageSeconds: startingAgeSeconds(persisted.seed, entity.id, entity.attributes.constitution),
      })),
    } as unknown as PersistedWorldV7;

    return upgradePersistedWorld(withAge);
  }

  if (persisted.version === 7) {
    const withAction = {
      ...persisted,
      version: 8 as const,
      entities: persisted.entities.map((entity) => ({
        ...entity,
        action: actionFromFlags(entity),
        actionSeconds: 0,
      })),
    } as unknown as PersistedWorldV8;

    return upgradePersistedWorld(withAction);
  }

  if (persisted.version === 8) {
    const withCooldowns = {
      ...persisted,
      version: 9 as const,
      entities: persisted.entities.map((entity) => ({
        ...entity,
        cooldowns: emptyCooldowns(),
      })),
    } as unknown as PersistedWorldV9;

    return upgradePersistedWorld(withCooldowns);
  }

  if (persisted.version === 9) {
    return upgradePersistedWorld({
      ...persisted,
      version: 10,
      entities: persisted.entities.map((entity) => ({
        ...entity,
        outcome: null,
      })),
    });
  }

  if (persisted.version === 10) {
    const map = fromWorldMapData(persisted.map);
    const occupied = new Set<number>();

    for (const entity of persisted.entities) {
      const tileX = Math.min(map.width - 1, Math.max(0, Math.floor(entity.x)));
      const tileY = Math.min(map.height - 1, Math.max(0, Math.floor(entity.y)));

      occupied.add(tileY * map.width + tileX);
    }

    stampRocks(map, persisted.seed, occupied);

    return upgradePersistedWorld({
      ...persisted,
      version: 11,
      map: toWorldMapData(map),
    });
  }

  if (persisted.version === 11) {
    const map = fromWorldMapData(persisted.map);
    const occupied = new Set<number>();

    for (const entity of persisted.entities) {
      const tileX = Math.min(map.width - 1, Math.max(0, Math.floor(entity.x)));
      const tileY = Math.min(map.height - 1, Math.max(0, Math.floor(entity.y)));

      occupied.add(tileY * map.width + tileX);
    }

    stampCamps(map, persisted.seed, occupied);

    return upgradePersistedWorld({
      ...persisted,
      version: 12,
      map: toWorldMapData(map),
      entities: persisted.entities.map((entity) => ({
        ...entity,
        cooldowns: { ...entity.cooldowns, work: 0 },
        working: false,
      })),
    });
  }

  if (persisted.version === 12) {
    return upgradePersistedWorld({
      ...persisted,
      version: 13,
      relationships: [],
      log: [],
      entities: persisted.entities.map((entity) => ({
        ...entity,
        cooldowns: { ...entity.cooldowns, greet: 0 },
        actionTarget: '',
      })),
    });
  }

  if (persisted.version === 13) {
    return upgradePersistedWorld({
      ...persisted,
      version: 14,
      memories: [],
    });
  }

  if (persisted.version === 14) {
    return {
      ...persisted,
      version: PERSISTED_WORLD_VERSION,
      entities: persisted.entities.map((entity) => ({
        ...entity,
        cooldowns: { ...entity.cooldowns, comfort: 0 },
      })),
    };
  }

  return persisted as PersistedWorld;
}

function nextIdFrom(ids: string[], prefix: string): number {
  let max = 0;

  for (const id of ids) {
    const match = new RegExp(`^${prefix}-(\\d+)$`).exec(id);

    if (match) max = Math.max(max, Number(match[1]));
  }

  return max + 1;
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

  world.tick = persisted.tick;
  world.elapsedSeconds = persisted.elapsedSeconds;
  world.log = persisted.log.map((event) => ({ ...event, participants: [...event.participants] }));
  world.nextLogId = nextIdFrom(world.log.map((event) => event.eventId), 'log');
  world.memories = persisted.memories.map((memory: MemoryRecord) => ({
    ...memory,
    participants: [...memory.participants],
  }));
  world.nextMemoryId = nextIdFrom(world.memories.map((memory) => memory.memoryId), 'mem');
  world.relationships = new Map(
    persisted.relationships.map((record: RelationshipRecord) => [
      pairKey(record.a, record.b),
      { ...record },
    ]),
  );

  return { world, clock };
}
