import { describe, expect, it } from 'vitest';

import { createSimulationClock } from './core/clock.js';
import { capturePersistedWorld, restorePersistedWorld } from './core/persistence.js';
import { createSimulationRunner, tickSimulation } from './core/runner.js';
import { createSimulationWorld } from './core/world.js';
import { createPopulation } from './entities/create-population.js';
import { createWorldDelta } from './systems/delta.js';
import { createWorldSnapshot } from './systems/snapshot.js';

const ENTITY_COUNT = 1000;
const TICKS = 1000;

// At 10 ticks per second each tick has 100 ms. Keep simulation work under
// 10% of that so later systems have room; measured cost is about 0.2 ms.
const TICK_BUDGET_MS = 10;

// Saves run every 30 seconds; measured cost is about 2.5 ms.
const PERSIST_ROUND_TRIP_BUDGET_MS = 100;

describe(`${ENTITY_COUNT}-entity simulation`, () => {
  it('ticks within budget, including snapshot and delta work', () => {
    const world = createSimulationWorld();
    createPopulation(world, ENTITY_COUNT, 12345);
    const runner = createSimulationRunner(world, createSimulationClock());
    const { clock } = runner;

    let previous = createWorldSnapshot(world, clock.tick, clock.elapsedSeconds);
    const start = performance.now();

    for (let i = 0; i < TICKS; i++) {
      tickSimulation(runner);

      // The worker builds a delta every 200 ms, i.e. every second tick.
      if (i % 2 === 1) {
        const current = createWorldSnapshot(world, clock.tick, clock.elapsedSeconds);
        createWorldDelta(previous, current);
        previous = current;
      }
    }

    const averageTickMs = (performance.now() - start) / TICKS;

    expect(averageTickMs).toBeLessThan(TICK_BUDGET_MS);

    const entities = createWorldSnapshot(world, clock.tick, clock.elapsedSeconds).entities;

    expect(entities).toHaveLength(ENTITY_COUNT);
    expect(new Set(entities.map((entity) => entity.id)).size).toBe(ENTITY_COUNT);
    expect(entities.every((e) => e.x >= 0 && e.x <= 64 && e.y >= 0 && e.y <= 64)).toBe(true);
  });

  it('saves and restores within budget', () => {
    const world = createSimulationWorld();
    createPopulation(world, ENTITY_COUNT, 12345);
    const clock = createSimulationClock();

    const start = performance.now();
    const payload = JSON.stringify(capturePersistedWorld(world, clock, 12345));
    const restored = restorePersistedWorld(JSON.parse(payload));
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(PERSIST_ROUND_TRIP_BUDGET_MS);
    expect(restored.world.entityIds.size).toBe(ENTITY_COUNT);
  });
});
