import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSimulationWorld } from './world.js';
import { createSimulationClock } from './clock.js';
import { createSimulationRunner } from './runner.js';
import {
  createSimulationLoop,
  getSimulationLoopTiming,
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

  it('limits catch-up after a stall and drops the excess time', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let nowMs = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);

    const clock = createSimulationClock();
    const loop = createSimulationLoop(createSimulationRunner(createSimulationWorld(), clock));

    startSimulationLoop(loop, { maxCatchUpTicks: 5 });

    nowMs = 2050;
    vi.advanceTimersByTime(10);

    expect(clock.tick).toBe(5);
    expect(loop.accumulatorSeconds).toBeCloseTo(0.05);
    expect(getSimulationLoopTiming(loop)).toMatchObject({ ticksRun: 5, ticksDropped: 15 });

    nowMs = 2060;
    vi.advanceTimersByTime(10);

    expect(clock.tick).toBe(5);

    stopSimulationLoop(loop);
    vi.restoreAllMocks();
  });

  it('reports tick timing over the most recent minute of ticks', () => {
    vi.useFakeTimers();

    const loop = createSimulationLoop(
      createSimulationRunner(createSimulationWorld(), createSimulationClock()),
    );

    expect(getSimulationLoopTiming(loop)).toEqual({
      ticksRun: 0,
      ticksDropped: 0,
      recentTicks: 0,
      meanTickMs: 0,
      maxTickMs: 0,
    });

    startSimulationLoop(loop);
    vi.advanceTimersByTime(70_000);
    stopSimulationLoop(loop);

    const timing = getSimulationLoopTiming(loop);

    expect(timing.ticksRun).toBeGreaterThanOrEqual(699);
    expect(timing.recentTicks).toBe(600);
    expect(timing.ticksDropped).toBe(0);
    expect(timing.maxTickMs).toBeGreaterThanOrEqual(timing.meanTickMs);
  });

  it('rejects invalid loop options', () => {
    const loop = createSimulationLoop(
      createSimulationRunner(createSimulationWorld(), createSimulationClock()),
    );

    expect(() => startSimulationLoop(loop, { maxCatchUpTicks: 0 })).toThrow(
      'Invalid simulation loop options',
    );
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