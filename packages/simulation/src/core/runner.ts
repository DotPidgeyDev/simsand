import type { SimulationWorld } from './world.js';
import type { SimulationClock } from './clock.js';

import { advanceClock } from './clock.js';
import { updateLifecycle } from '../systems/lifecycle.js';
import { updateMovement } from '../systems/movement.js';
import { updateNeeds } from '../systems/needs.js';

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

  updateLifecycle(runner.world, deltaSeconds);
  updateNeeds(runner.world, deltaSeconds);
  updateMovement(runner.world, deltaSeconds);
  advanceClock(runner.clock);
}