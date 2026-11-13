import type { SimulationRunner } from './runner.js';
import { tickSimulation } from './runner.js';

// Tick durations are kept for this many recent ticks (one minute at 10 Hz).
const RECENT_TICK_WINDOW = 600;

export interface SimulationLoopStats {
  ticksRun: number;
  // Whole ticks discarded because the catch-up limit was reached.
  ticksDropped: number;
  recentTickMs: Float64Array;
  recentTickCount: number;
  nextRecentIndex: number;
}

export interface SimulationLoop {
  runner: SimulationRunner;
  running: boolean;
  accumulatorSeconds: number;
  lastTimeMs: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  stats: SimulationLoopStats;
}

export interface SimulationLoopOptions {
  pollIntervalMs?: number;
  maxCatchUpTicks?: number;
}

export interface SimulationLoopTiming {
  ticksRun: number;
  ticksDropped: number;
  recentTicks: number;
  meanTickMs: number;
  maxTickMs: number;
}

export function createSimulationLoop(
  runner: SimulationRunner,
): SimulationLoop {
  return {
    runner,
    running: false,
    accumulatorSeconds: 0,
    lastTimeMs: 0,
    timer: undefined,
    stats: {
      ticksRun: 0,
      ticksDropped: 0,
      recentTickMs: new Float64Array(RECENT_TICK_WINDOW),
      recentTickCount: 0,
      nextRecentIndex: 0,
    },
  };
}

export function startSimulationLoop(
  loop: SimulationLoop,
  options: SimulationLoopOptions = {},
): void {
  if (loop.running) return;

  const pollIntervalMs = options.pollIntervalMs ?? 10;
  const maxCatchUpTicks = options.maxCatchUpTicks ?? 5;

  if (pollIntervalMs <= 0 || maxCatchUpTicks < 1) {
    throw new Error('Invalid simulation loop options');
  }

  loop.running = true;
  loop.lastTimeMs = performance.now();

  const frame = (): void => {
    if (!loop.running) return;

    const now = performance.now();
    const elapsedSeconds = Math.max(
      0,
      (now - loop.lastTimeMs) / 1000,
    );

    loop.lastTimeMs = now;
    loop.accumulatorSeconds += elapsedSeconds;

    const fixedDelta = loop.runner.clock.fixedDeltaSeconds;
    let ticks = 0;

    while (
      loop.accumulatorSeconds >= fixedDelta &&
      ticks < maxCatchUpTicks
    ) {
      const tickStart = performance.now();
      tickSimulation(loop.runner);
      recordTick(loop.stats, performance.now() - tickStart);

      loop.accumulatorSeconds -= fixedDelta;
      ticks++;
    }

    // Discard excess whole ticks if the catch-up limit is reached.
    // This prevents the simulation from entering an endless catch-up cycle.
    if (ticks === maxCatchUpTicks && loop.accumulatorSeconds >= fixedDelta) {
      loop.stats.ticksDropped += Math.floor(loop.accumulatorSeconds / fixedDelta);
      loop.accumulatorSeconds %= fixedDelta;
    }

    loop.timer = setTimeout(frame, pollIntervalMs);
  };

  loop.timer = setTimeout(frame, pollIntervalMs);
}

export function stopSimulationLoop(loop: SimulationLoop): void {
  loop.running = false;

  if (loop.timer !== undefined) {
    clearTimeout(loop.timer);
    loop.timer = undefined;
  }
}

export function getSimulationLoopTiming(loop: SimulationLoop): SimulationLoopTiming {
  const { ticksRun, ticksDropped, recentTickMs, recentTickCount } = loop.stats;
  let total = 0;
  let max = 0;

  for (let i = 0; i < recentTickCount; i++) {
    total += recentTickMs[i];
    max = Math.max(max, recentTickMs[i]);
  }

  return {
    ticksRun,
    ticksDropped,
    recentTicks: recentTickCount,
    meanTickMs: recentTickCount > 0 ? total / recentTickCount : 0,
    maxTickMs: max,
  };
}

function recordTick(stats: SimulationLoopStats, durationMs: number): void {
  stats.ticksRun++;
  stats.recentTickMs[stats.nextRecentIndex] = durationMs;
  stats.nextRecentIndex = (stats.nextRecentIndex + 1) % stats.recentTickMs.length;
  stats.recentTickCount = Math.min(stats.recentTickCount + 1, stats.recentTickMs.length);
}
