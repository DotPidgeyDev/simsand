import type { SimulationWorld } from './world.js';
import type { SimulationClock } from './clock.js';

import { advanceClock } from './clock.js';
import { updateMovement } from '../systems/movement.js';

export interface SimulationRunner {
  world: SimulationWorld;
  clock: SimulationClock;
  paused: boolean;
}

export function createSimulationRunner(
  world: SimulationWorld,
  clock: SimulationClock,
): SimulationRunner {
  return {
    world,
    clock,
    paused: false,
  };
}

// this is what simulates a "tick" in our world.
export function tickSimulation(runner: SimulationRunner): void {
  if (runner.paused) {
    return;
  }

  const deltaSeconds = runner.clock.fixedDeltaSeconds;

  updateMovement(runner.world, deltaSeconds);
  advanceClock(runner.clock);
}