import type { SimulationRunner } from './runner.js';
import { tickSimulation } from './runner.js';

export interface SimulationLoop {
  runner: SimulationRunner;
  running: boolean;
  accumulatorSeconds: number;
  lastTimeMs: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}

export interface SimulationLoopOptions {
  pollIntervalMs?: number;
  maxCatchUpTicks?: number;
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
      tickSimulation(loop.runner);
      loop.accumulatorSeconds -= fixedDelta;
      ticks++;
    }

    // Discard excess whole ticks if the catch-up limit is reached.
    // This prevents the simulation from entering an endless catch-up cycle.
    if (ticks === maxCatchUpTicks && loop.accumulatorSeconds >= fixedDelta) {
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