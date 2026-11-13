import { describe, expect, it } from 'vitest';

import { TERRAIN_TYPES } from '@simsand/shared';

import { startingAgeSeconds } from '../characters/profile.js';
import { createCharacter } from '../entities/create-character.js';
import { createPopulation } from '../entities/create-population.js';
import { removeCharacter } from '../entities/remove-character.js';
import { createWorldSnapshot } from '../systems/snapshot.js';
import { createSimulationClock } from './clock.js';
import { generateWorldMap, getTile, toWorldMapData } from './map.js';
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
      version: 9,
      seed: 99,
      tick: 0,
      fixedDeltaSeconds: 0.05,
    });
    expect(persisted.entities).toHaveLength(3);
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

    expect(upgraded.version).toBe(9);
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

    expect(upgraded.version).toBe(9);
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

    expect(upgraded.version).toBe(9);
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

    expect(upgraded.version).toBe(9);
    expect(upgraded.entities[0].ageSeconds).toBe(persisted.entities[0].ageSeconds);
    expect(upgraded.entities[0].action).toBe('move');
  });

  it('rejects an unsupported format version', () => {
    const world = createSimulationWorld();
    const persisted = capturePersistedWorld(world, createSimulationClock(), 1);

    expect(() => restorePersistedWorld({ ...persisted, version: 10 })).toThrow(
      'Unsupported persisted world version: 10',
    );
  });
});
