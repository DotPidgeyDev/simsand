import { describe, expect, it } from 'vitest';

import { createSimulationClock } from '../core/clock.js';
import { RESOURCE_NODE_STOCK, createWorldMap } from '../core/map.js';
import { capturePersistedWorld, restorePersistedWorld } from '../core/persistence.js';
import { createSimulationRunner, tickSimulation } from '../core/runner.js';
import { createSimulationWorld } from '../core/world.js';
import { economyViolations } from './invariants.js';
import { PILE_RETURN_SECONDS, nodeAt, nodeKey, renewPiles, takeResource } from './nodes.js';

describe('pile return', () => {
  it('keeps a depleted pile off the map until the delay, then restores full stock', () => {
    const map = createWorldMap(4, 4, 'grass');
    const world = createSimulationWorld(map, 1);
    const key = nodeKey(map.width, 1, 2);
    world.nodes.set(key, { x: 1, y: 2, item: 'material', quantity: 1 });

    expect(takeResource(world, 1.2, 2.8)).toEqual({ x: 1, y: 2, item: 'material', quantity: 1 });
    expect(nodeAt(world, 1, 2)).toBeUndefined();
    expect(world.returning.get(key)).toBe(PILE_RETURN_SECONDS);
    expect(economyViolations(world)).toEqual([]);

    world.elapsedSeconds = PILE_RETURN_SECONDS - 0.1;
    renewPiles(world);

    expect(nodeAt(world, 1, 2)).toBeUndefined();
    expect(world.returning.has(key)).toBe(true);

    world.elapsedSeconds = PILE_RETURN_SECONDS;
    renewPiles(world);

    expect(nodeAt(world, 1, 2)).toEqual({ x: 1, y: 2, item: 'material', quantity: RESOURCE_NODE_STOCK });
    expect(world.returning.size).toBe(0);
    expect(economyViolations(world)).toEqual([]);
  });

  it('keeps the return time across a save', () => {
    const map = createWorldMap(4, 4, 'grass');
    const world = createSimulationWorld(map, 1);
    world.elapsedSeconds = 10;
    world.nodes.set(nodeKey(map.width, 0, 0), { x: 0, y: 0, item: 'material', quantity: 1 });
    takeResource(world, 0, 0);

    const { world: restored } = restorePersistedWorld(
      structuredClone(capturePersistedWorld(world, createSimulationClock(), 1)),
    );

    expect(restored.nodes.size).toBe(0);
    expect(restored.returning.get(nodeKey(4, 0, 0))).toBe(10 + PILE_RETURN_SECONDS);

    restored.elapsedSeconds = 10 + PILE_RETURN_SECONDS;
    renewPiles(restored);

    expect(nodeAt(restored, 0, 0)?.quantity).toBe(RESOURCE_NODE_STOCK);
  });

  it('returns a due pile on the simulation tick', () => {
    const map = createWorldMap(4, 4, 'grass');
    const world = createSimulationWorld(map, 1);
    world.nodes.set(nodeKey(map.width, 2, 2), { x: 2, y: 2, item: 'material', quantity: 1 });
    takeResource(world, 2, 2);

    const clock = createSimulationClock();
    clock.elapsedSeconds = PILE_RETURN_SECONDS;
    tickSimulation(createSimulationRunner(world, clock));

    expect(nodeAt(world, 2, 2)?.quantity).toBe(RESOURCE_NODE_STOCK);
  });
});
