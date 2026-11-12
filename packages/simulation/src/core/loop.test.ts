import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSimulationWorld } from './world.js';
import { createSimulationClock } from './clock.js';
import { createSimulationRunner } from './runner.js';
import {
  createSimulationLoop,
  startSimulationLoop,
  stopSimulationLoop,
} from './loop.js';

describe('simulation loop', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('advances simulation ticks over time', () => {
    vi.useFakeTimers();

    const world = createSimulationWorld();
    const clock = createSimulationClock();
    const runner = createSimulationRunner(world, clock);
    const loop = createSimulationLoop(runner);

    startSimulationLoop(loop);

    vi.advanceTimersByTime(250);

    expect(clock.tick).toBe(2);

    stopSimulationLoop(loop);
  });

  it('stops advancing when stopped', () => {
    vi.useFakeTimers();

    const world = createSimulationWorld();
    const clock = createSimulationClock();
    const runner = createSimulationRunner(world, clock);
    const loop = createSimulationLoop(runner);

    startSimulationLoop(loop);

    vi.advanceTimersByTime(50);
    stopSimulationLoop(loop);

    const tickAtStop = clock.tick;

    vi.advanceTimersByTime(500);

    expect(clock.tick).toBe(tickAtStop);
    expect(loop.running).toBe(false);
  });

  it('does not start twice', () => {
    vi.useFakeTimers();

    const world = createSimulationWorld();
    const clock = createSimulationClock();
    const runner = createSimulationRunner(world, clock);
    const loop = createSimulationLoop(runner);

    startSimulationLoop(loop);
    startSimulationLoop(loop);

    expect(loop.running).toBe(true);

    stopSimulationLoop(loop);
  });
});