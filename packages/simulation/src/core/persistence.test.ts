import { describe, expect, it } from 'vitest';

import { PERSISTED_WORLD_VERSION, PROFESSION_IDS, TERRAIN_TYPES } from '@simsand/shared';

import { professionFor, startingAgeSeconds } from '../characters/profile.js';
import { createCharacter } from '../entities/create-character.js';
import { createPopulation } from '../entities/create-population.js';
import { removeCharacter } from '../entities/remove-character.js';
import { createWorldSnapshot } from '../systems/snapshot.js';
import { createSimulationClock } from './clock.js';
import { fromWorldMapData, generateResourceNodes, generateWorldMap, getTile, toWorldMapData } from './map.js';
import {
  capturePersistedWorld,
  restorePersistedWorld,
  upgradePersistedWorld,
} from './persistence.js';
import { createSimulationRunner, tickSimulation } from './runner.js';
import { createSimulationWorld } from './world.js';

function runTicks(runner: ReturnType<typeof createSimulationRunner>, count: number) {
  for (let i = 0; i < count; i++) {
    tickSimulation(runner);
  }
}

describe('world persistence', () => {
  it('resumes exactly where the original world would have continued', () => {
    const world = createSimulationWorld();
    createPopulation(world, 20, 12345);
    const original = createSimulationRunner(world, createSimulationClock());
    runTicks(original, 50);

    const persisted = capturePersistedWorld(world, original.clock, 12345);
    const { world: restoredWorld, clock: restoredClock } = restorePersistedWorld(
      structuredClone(persisted),
    );
    const restored = createSimulationRunner(restoredWorld, restoredClock);

    expect(restoredClock.tick).toBe(50);

    runTicks(original, 30);
    runTicks(restored, 30);

    expect(createWorldSnapshot(restoredWorld, restoredClock.tick, restoredClock.elapsedSeconds))
      .toEqual(createWorldSnapshot(world, original.clock.tick, original.clock.elapsedSeconds));
  });

  it('records the seed and clock settings', () => {
    const world = createSimulationWorld();
    createPopulation(world, 3, 99);

    const persisted = capturePersistedWorld(world, createSimulationClock(0.05), 99);

    expect(persisted).toMatchObject({
      version: PERSISTED_WORLD_VERSION,
      seed: 99,
      tick: 0,
      fixedDeltaSeconds: 0.05,
    });
    expect(persisted.entities).toHaveLength(3);
  });

  it('gives a version 14 save a comfort cooldown of zero', () => {
    const world = createSimulationWorld();
    createPopulation(world, 1, 99);
    const saved = capturePersistedWorld(world, createSimulationClock(), 99);
    const legacy = {
      ...saved,
      version: 14 as const,
      entities: saved.entities.map((entity) => {
        const { comfort: _comfort, ...cooldowns } = entity.cooldowns;

        return { ...entity, cooldowns };
      }),
    };

    const upgraded = upgradePersistedWorld(legacy);

    expect(upgraded.version).toBe(PERSISTED_WORLD_VERSION);
    expect(upgraded.entities[0]?.cooldowns.comfort).toBe(0);
    expect(upgraded.memories).toEqual(saved.memories);
  });

  it('gives a version 15 save cooldowns of zero for keep, confide and bluff', () => {
    const world = createSimulationWorld();
    createPopulation(world, 1, 99);
    const saved = capturePersistedWorld(world, createSimulationClock(), 99);
    const legacy = {
      ...saved,
      version: 15 as const,
      entities: saved.entities.map((entity) => {
        const { keep: _keep, confide: _confide, bluff: _bluff, ...cooldowns } = entity.cooldowns;

        return { ...entity, cooldowns };
      }),
    };

    const upgraded = upgradePersistedWorld(legacy);

    expect(upgraded.version).toBe(PERSISTED_WORLD_VERSION);
    expect(upgraded.entities[0]?.cooldowns.keep).toBe(0);
    expect(upgraded.entities[0]?.cooldowns.confide).toBe(0);
    expect(upgraded.entities[0]?.cooldowns.bluff).toBe(0);
    expect(upgraded.entities[0]?.cooldowns.comfort).toBe(saved.entities[0]?.cooldowns.comfort);
    expect(upgraded.inventories).toEqual([]);
  });

  it('gives a version 16 save an empty inventory list', () => {
    const world = createSimulationWorld();
    createPopulation(world, 1, 99);
    const saved = capturePersistedWorld(world, createSimulationClock(), 99);
    const { inventories: _inventories, ...legacy } = saved;

    const upgraded = upgradePersistedWorld({ ...legacy, version: 16 });

    expect(upgraded.version).toBe(PERSISTED_WORLD_VERSION);
    expect(upgraded.inventories).toEqual([]);
    expect(upgraded.entities).toEqual(saved.entities);
  });

  it('gives a version 17 save a give cooldown of zero', () => {
    const world = createSimulationWorld();
    createPopulation(world, 1, 99);
    const saved = capturePersistedWorld(world, createSimulationClock(), 99);
    const holderId = saved.entities[0].id;
    saved.inventories = [{ holderId, stacks: [{ item: 'goods', quantity: 2 }] }];
    const legacy = {
      ...saved,
      version: 17 as const,
      entities: saved.entities.map((entity) => {
        const { give: _give, ...cooldowns } = entity.cooldowns;

        return { ...entity, cooldowns };
      }),
    };

    const upgraded = upgradePersistedWorld(legacy);

    expect(upgraded.version).toBe(PERSISTED_WORLD_VERSION);
    expect(upgraded.entities[0]?.cooldowns.give).toBe(0);
    expect(upgraded.inventories).toEqual(saved.inventories);
  });

  it('gives a version 18 save resource nodes and a gather cooldown of zero', () => {
    const world = createSimulationWorld();
    createPopulation(world, 1, 99);
    const saved = capturePersistedWorld(world, createSimulationClock(), 99);
    const legacy = {
      ...saved,
      version: 18 as const,
      nodes: undefined,
      entities: saved.entities.map((entity) => {
        const { gather: _gather, ...cooldowns } = entity.cooldowns;

        return { ...entity, cooldowns };
      }),
    };

    const upgraded = upgradePersistedWorld(legacy);

    expect(upgraded.version).toBe(PERSISTED_WORLD_VERSION);
    expect(upgraded.entities[0]?.cooldowns.gather).toBe(0);
    expect(upgraded.entities[0]?.cooldowns.craft).toBe(0);
    expect(upgraded.entities[0]?.cooldowns.give).toBe(saved.entities[0]?.cooldowns.give);
    expect(upgraded.nodes).toEqual(generateResourceNodes(fromWorldMapData(saved.map), 99));
  });

  it('gives a version 19 save a craft cooldown of zero', () => {
    const world = createSimulationWorld();
    createPopulation(world, 1, 99);
    const saved = capturePersistedWorld(world, createSimulationClock(), 99);
    const legacy = {
      ...saved,
      version: 19 as const,
      entities: saved.entities.map((entity) => {
        const { craft: _craft, ...cooldowns } = entity.cooldowns;

        return { ...entity, cooldowns };
      }),
    };

    const upgraded = upgradePersistedWorld(legacy);

    expect(upgraded.version).toBe(PERSISTED_WORLD_VERSION);
    expect(upgraded.entities[0]?.cooldowns.craft).toBe(0);
    expect(upgraded.entities[0]?.cooldowns.dine).toBe(0);
    expect(upgraded.entities[0]?.cooldowns.gather).toBe(saved.entities[0]?.cooldowns.gather);
    expect(upgraded.nodes).toEqual(saved.nodes);
  });

  it('gives a version 20 save a dine cooldown of zero', () => {
    const world = createSimulationWorld();
    createPopulation(world, 1, 99);
    const saved = capturePersistedWorld(world, createSimulationClock(), 99);
    const legacy = {
      ...saved,
      version: 20 as const,
      entities: saved.entities.map((entity) => {
        const { dine: _dine, ...cooldowns } = entity.cooldowns;

        return { ...entity, cooldowns };
      }),
    };

    const upgraded = upgradePersistedWorld(legacy);

    expect(upgraded.version).toBe(PERSISTED_WORLD_VERSION);
    expect(upgraded.entities[0]?.cooldowns.dine).toBe(0);
    expect(upgraded.entities[0]?.cooldowns.buy).toBe(0);
    expect(upgraded.entities[0]?.cooldowns.craft).toBe(saved.entities[0]?.cooldowns.craft);
    expect(upgraded.nodes).toEqual(saved.nodes);
  });

  it('gives a version 21 save a buy cooldown of zero', () => {
    const world = createSimulationWorld();
    createPopulation(world, 1, 99);
    const saved = capturePersistedWorld(world, createSimulationClock(), 99);
    const legacy = {
      ...saved,
      version: 21 as const,
      entities: saved.entities.map((entity) => {
        const { buy: _buy, ...cooldowns } = entity.cooldowns;

        return { ...entity, cooldowns };
      }),
    };

    const upgraded = upgradePersistedWorld(legacy);

    expect(upgraded.version).toBe(PERSISTED_WORLD_VERSION);
    expect(upgraded.entities[0]?.cooldowns.buy).toBe(0);
    expect(upgraded.entities[0]?.cooldowns.dine).toBe(saved.entities[0]?.cooldowns.dine);
    expect(upgraded.nodes).toEqual(saved.nodes);
  });

  it('gives a version 22 save an empty pile-return list', () => {
    const world = createSimulationWorld();
    createPopulation(world, 1, 99);
    const saved = capturePersistedWorld(world, createSimulationClock(), 99);
    const { returning: _returning, ...withoutReturn } = saved;
    const legacy = { ...withoutReturn, version: 22 as const };

    const upgraded = upgradePersistedWorld(legacy);

    expect(upgraded.version).toBe(PERSISTED_WORLD_VERSION);
    expect(upgraded.returning).toEqual([]);
    expect(upgraded.nodes).toEqual(saved.nodes);
    expect(upgraded.entities[0]?.cooldowns.buy).toBe(saved.entities[0]?.cooldowns.buy);
  });

  it('rebuilds the stable ID map so restored characters can be removed', () => {
    const world = createSimulationWorld();
    createPopulation(world, 2, 1);

    const { world: restoredWorld } = restorePersistedWorld(
      capturePersistedWorld(world, createSimulationClock(), 1),
    );

    expect(removeCharacter(restoredWorld, 'character-0001')).toBe(true);
    expect(createWorldSnapshot(restoredWorld, 0, 0).entities.map((e) => e.id))
      .toEqual(['character-0002']);
  });

  it('restores the saved terrain rather than regenerating it', () => {
    const map = generateWorldMap(7);
    map.tiles[0] = TERRAIN_TYPES.indexOf('water');
    const world = createSimulationWorld(map);

    const { world: restoredWorld } = restorePersistedWorld(
      structuredClone(capturePersistedWorld(world, createSimulationClock(), 7)),
    );

    expect(getTile(restoredWorld.map, 0, 0)).toBe('water');
    expect(restoredWorld.map.tiles).toEqual(map.tiles);
  });

  it('upgrades a version 1 world with the map generated from its seed', () => {
    const { map: _map, ...current } = capturePersistedWorld(
      createSimulationWorld(),
      createSimulationClock(),
      42,
    );

    const upgraded = upgradePersistedWorld({ ...current, version: 1 });

    expect(upgraded.version).toBe(PERSISTED_WORLD_VERSION);
    expect(upgraded.map).toEqual(toWorldMapData(generateWorldMap(42)));
    expect(() => restorePersistedWorld(upgraded)).not.toThrow();
  });

  it('upgrades a version 2 world with each character profile generated from the seed', () => {
    const world = createSimulationWorld();
    createPopulation(world, 2, 42);
    const persisted = capturePersistedWorld(world, createSimulationClock(), 42);
    const withoutProfiles = {
      ...persisted,
      version: 2 as const,
      entities: persisted.entities.map((entity) => {
        const { name: _name, attributes: _attributes, personality: _personality, needs: _needs, lifecycle: _lifecycle, ...base } = entity;
        return base;
      }),
    };

    const upgraded = upgradePersistedWorld(withoutProfiles);

    expect(upgraded.version).toBe(PERSISTED_WORLD_VERSION);
    expect(upgraded.entities.map((entity) => entity.name)).toEqual(
      persisted.entities.map((entity) => entity.name),
    );
    expect(capturePersistedWorld(
      restorePersistedWorld(upgraded).world,
      createSimulationClock(),
      42,
    ).entities).toEqual(persisted.entities);
  });

  it('upgrades a version 5 world by deriving eating and drinking from needs', () => {
    const world = createSimulationWorld();
    createCharacter(world, {
      id: 'diner',
      x: 1,
      y: 1,
      velocityX: 0,
      velocityY: 0,
      color: 1,
      sprite: 'wanderer',
      name: 'Din Er',
      attributes: {
        strength: 5, dexterity: 5, intelligence: 5, wisdom: 5, constitution: 5, perception: 5, charisma: 5,
      },
      personality: {
        aggression: 0.5, sociability: 0.5, greed: 0.5, ambition: 0.5, loyalty: 0.5,
        curiosity: 0.5, courage: 0.5, honesty: 0.5, industriousness: 0.5, empathy: 0.5,
      },
      needs: { hunger: 0.9, thirst: 0.2, fatigue: 0.2 },
      lifecycle: 'alive',
    });

    const persisted = capturePersistedWorld(world, createSimulationClock(), 1);
    const withoutSustenance = {
      ...persisted,
      version: 5 as const,
      entities: persisted.entities.map((entity) => {
        const { eating: _eating, drinking: _drinking, ...rest } = entity;
        return rest;
      }),
    };

    const upgraded = upgradePersistedWorld(withoutSustenance);

    expect(upgraded.version).toBe(PERSISTED_WORLD_VERSION);
    expect(upgraded.entities[0].eating).toBe(true);
    expect(upgraded.entities[0].drinking).toBe(false);
    expect(upgraded.entities[0].needs.hunger).toBe(0.9);
    expect(upgraded.entities[0].ageSeconds).toBe(startingAgeSeconds(1, 'diner', 5));
    expect(upgraded.entities[0].action).toBe('eat');
    expect(upgraded.entities[0].actionSeconds).toBe(0);
  });

  it('upgrades a version 6 world with a seeded age', () => {
    const world = createSimulationWorld();
    createPopulation(world, 1, 42);
    const persisted = capturePersistedWorld(world, createSimulationClock(), 42);
    const withoutAge = {
      ...persisted,
      version: 6 as const,
      entities: persisted.entities.map((entity) => {
        const { ageSeconds: _ageSeconds, ...rest } = entity;
        return rest;
      }),
    };

    const upgraded = upgradePersistedWorld(withoutAge);

    expect(upgraded.version).toBe(PERSISTED_WORLD_VERSION);
    expect(upgraded.entities[0].ageSeconds).toBe(persisted.entities[0].ageSeconds);
    expect(upgraded.entities[0].action).toBe('move');
  });

  it('gives a version 23 save no viewer, and keeps a viewer across a save', () => {
    const world = createSimulationWorld();
    createCharacter(world, {
      id: 'ada',
      x: 1,
      y: 1,
      velocityX: 0,
      velocityY: 0,
      color: 1,
      sprite: 'wanderer',
      viewerId: 'viewer-1',
    });
    const saved = capturePersistedWorld(world, createSimulationClock(), world.seed);
    const legacy = {
      ...saved,
      version: 23 as const,
      entities: saved.entities.map((entity) => {
        const { viewerId: _viewerId, ...rest } = entity;
        return rest;
      }),
    };

    expect(upgradePersistedWorld(legacy).entities[0]?.viewerId).toBeNull();

    const restored = restorePersistedWorld(saved).world;

    expect(restored.characterByViewer.get('viewer-1')).toBe('ada');
    expect(capturePersistedWorld(restored, createSimulationClock(), world.seed).entities[0]?.viewerId).toBe('viewer-1');
  });

  it('rejects an unsupported format version', () => {
    const world = createSimulationWorld();
    const persisted = capturePersistedWorld(world, createSimulationClock(), 1);

    expect(() => restorePersistedWorld({ ...persisted, version: 27 })).toThrow(
      'Unsupported persisted world version: 27',
    );
  });

  it('gives a version 25 save each character its seeded profession, then keeps the stored one', () => {
    const world = createSimulationWorld();
    createPopulation(world, 3, 99);
    const saved = capturePersistedWorld(world, createSimulationClock(), 99);
    const legacy = {
      ...saved,
      version: 25 as const,
      entities: saved.entities.map(({ profession: _profession, ...entity }) => entity),
    };

    const upgraded = upgradePersistedWorld(legacy);

    expect(upgraded.version).toBe(PERSISTED_WORLD_VERSION);
    expect(upgraded.entities.map((entity) => entity.profession))
      .toEqual(saved.entities.map((entity) => professionFor(99, entity.id)));

    const changed = PROFESSION_IDS.find((id) => id !== saved.entities[0]!.profession)!;
    const restored = restorePersistedWorld({
      ...saved,
      entities: saved.entities.map((entity, index) => (index === 0 ? { ...entity, profession: changed } : entity)),
    }).world;

    expect(capturePersistedWorld(restored, createSimulationClock(), 99).entities[0]?.profession).toBe(changed);
  });

  it('gives a version 24 save an empty director and keeps director memory across a save', () => {
    const world = createSimulationWorld();
    createPopulation(world, 1, 99);
    const saved = capturePersistedWorld(world, createSimulationClock(), 99);
    const { director: _director, ...rest } = saved;

    expect(upgradePersistedWorld({ ...rest, version: 24 })).toMatchObject({
      version: PERSISTED_WORLD_VERSION,
      director: { lastActAt: null, targeted: [], hungrySince: [], cursedHoldings: [] },
    });

    world.director.lastActAt = 120;
    world.director.cursedHoldings.set('character-0001', 14);
    world.director.targeted.set('character-0001', 120);
    world.director.hungrySince.set('character-0001', 30);

    const restored = restorePersistedWorld(capturePersistedWorld(world, createSimulationClock(), 99)).world;

    expect(restored.director).toEqual(world.director);
  });
});
