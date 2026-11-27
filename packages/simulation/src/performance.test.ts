import { describe, expect, it } from 'vitest';

import { createSimulationClock } from './core/clock.js';
import { capturePersistedWorld, restorePersistedWorld } from './core/persistence.js';
import { createSimulationRunner, tickSimulation } from './core/runner.js';
import { createSimulationWorld } from './core/world.js';
import { Personality } from './components/personality.js';
import { createPopulation } from './entities/create-population.js';
import { rememberMeeting } from './social/relationships.js';
import { createWorldDelta } from './systems/delta.js';
import { createWorldSnapshot } from './systems/snapshot.js';

const ENTITY_COUNT = 1000;
const TICKS = 1000;
const SEEKING_TICKS = 200;

// At 10 ticks per second each tick has 100 ms. Keep simulation work under
// 10% of that so later systems have room. After Milestone 07 a 1,000-entity
// tick is about 4–5 ms (mostly updateActions). The Milestone 01 figure of
// ~0.2 ms described a bounce-only world and is not the current baseline.
const TICK_BUDGET_MS = 10;

// Saves run every 30 seconds off the tick path. Budget 100 ms; after
// Milestone 07 a 1,000-entity round trip is about 15–25 ms (early ~2.5 ms).
const PERSIST_ROUND_TRIP_BUDGET_MS = 100;

describe(`${ENTITY_COUNT}-entity simulation`, () => {
  // 1000 entities × 1000 ticks plus snapshot work can exceed Vitest's
  // default 5 s wall clock on a loaded machine even when the average
  // tick stays under budget.
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
  }, 20_000);

  // The worst case for routes to people: everyone prefers company, knows
  // three others, and walks toward someone who is also moving. Only the
  // first 200 ticks are timed. After that, rising needs stop the search.
  it('ticks within budget when everyone walks to someone they know', () => {
    const world = createSimulationWorld();
    createPopulation(world, ENTITY_COUNT, 12345);
    const runner = createSimulationRunner(world, createSimulationClock());
    const ids = [...world.entityIds.keys()];

    ids.forEach((id, index) => {
      const eid = world.entityIds.get(id)!;
      Personality.loyalty[eid] = 1;
      Personality.industriousness[eid] = 0;
      Personality.curiosity[eid] = 0.5;

      for (const step of [1, 7, 31]) {
        rememberMeeting(world, id, ids[(index + step) % ids.length], 'met', 0);
      }
    });

    const start = performance.now();

    for (let i = 0; i < SEEKING_TICKS; i++) {
      tickSimulation(runner);
    }

    expect((performance.now() - start) / SEEKING_TICKS).toBeLessThan(TICK_BUDGET_MS);
  }, 20_000);

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
