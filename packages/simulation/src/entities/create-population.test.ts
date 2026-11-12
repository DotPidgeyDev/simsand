import { describe, expect, it } from 'vitest';

import { createSimulationClock } from '../core/clock.js';
import { createSimulationRunner, tickSimulation } from '../core/runner.js';
import { createSimulationWorld } from '../core/world.js';
import { createWorldSnapshot } from '../systems/snapshot.js';
import { capturePersistedWorld } from '../core/persistence.js';
import { createPopulation } from './create-population.js';

function populate(count: number, seed: number) {
  const world = createSimulationWorld();
  createPopulation(world, count, seed);
  return world;
}

describe('createPopulation', () => {
  it('creates the same population from the same seed', () => {
    expect(createWorldSnapshot(populate(20, 12345), 0, 0))
      .toEqual(createWorldSnapshot(populate(20, 12345), 0, 0));
  });

  it('creates a different population from a different seed', () => {
    expect(createWorldSnapshot(populate(20, 1), 0, 0))
      .not.toEqual(createWorldSnapshot(populate(20, 2), 0, 0));
  });

  it('gives each character a unique, padded stable ID', () => {
    const ids = createWorldSnapshot(populate(20, 12345), 0, 0).entities.map((e) => e.id);

    expect(ids[0]).toBe('character-0001');
    expect(ids[19]).toBe('character-0020');
    expect(new Set(ids).size).toBe(20);
  });

  it('places characters inside the world with bounded velocity', () => {
    const world = populate(200, 7);
    const entities = capturePersistedWorld(world, createSimulationClock(), 7).entities;

    for (const entity of entities) {
      expect(entity.x).toBeGreaterThanOrEqual(0);
      expect(entity.x).toBeLessThan(64);
      expect(entity.y).toBeGreaterThanOrEqual(0);
      expect(entity.y).toBeLessThan(64);
      expect(Math.abs(entity.velocityX)).toBeLessThanOrEqual(1);
      expect(Math.abs(entity.velocityY)).toBeLessThanOrEqual(1);
    }
  });

  it('produces identical worlds after running the same seed', () => {
    const runners = [populate(20, 12345), populate(20, 12345)].map((world) =>
      createSimulationRunner(world, createSimulationClock()),
    );

    for (let i = 0; i < 500; i++) {
      runners.forEach(tickSimulation);
    }

    const [a, b] = runners.map((runner) =>
      createWorldSnapshot(runner.world, runner.clock.tick, runner.clock.elapsedSeconds),
    );

    expect(a).toEqual(b);
  });
});
