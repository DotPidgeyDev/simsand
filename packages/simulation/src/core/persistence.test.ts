import { describe, expect, it } from 'vitest';

import { createPopulation } from '../entities/create-population.js';
import { removeCharacter } from '../entities/remove-character.js';
import { createWorldSnapshot } from '../systems/snapshot.js';
import { createSimulationClock } from './clock.js';
import { capturePersistedWorld, restorePersistedWorld } from './persistence.js';
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
      version: 1,
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

  it('rejects an unsupported format version', () => {
    const world = createSimulationWorld();
    const persisted = capturePersistedWorld(world, createSimulationClock(), 1);

    expect(() => restorePersistedWorld({ ...persisted, version: 2 })).toThrow(
      'Unsupported persisted world version: 2',
    );
  });
});
