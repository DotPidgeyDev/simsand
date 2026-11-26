import type { SimulationWorld } from './world.js';
import type { SimulationClock } from './clock.js';

import { advanceClock } from './clock.js';
import { updateDirector } from '../director/director.js';
import { directorDefaults } from '../director/settings.js';
import type { DirectorSettings } from '../director/settings.js';
import { updateActions } from '../systems/actions.js';
import { updateLifecycle } from '../systems/lifecycle.js';
import { updateMovement } from '../systems/movement.js';
import { renewPiles } from '../economy/nodes.js';
import { updateNeeds } from '../systems/needs.js';

export interface SimulationRunner {
  world: SimulationWorld;
  clock: SimulationClock;
  paused: boolean;
  // Off (null) unless asked for, so a test world behaves only by its own rules.
  director: Readonly<DirectorSettings> | null;
}

export function createSimulationRunner(
  world: SimulationWorld,
  clock: SimulationClock,
  options: { director?: boolean | Readonly<DirectorSettings> | null } = {},
): SimulationRunner {
  const { director = null } = options;

  return {
    world,
    clock,
    paused: false,
    director: director === true ? directorDefaults : director || null,
  };
}

// this is what simulates a "tick" in our world.
export function tickSimulation(runner: SimulationRunner): void {
  if (runner.paused) {
    return;
  }

  const deltaSeconds = runner.clock.fixedDeltaSeconds;

  runner.world.tick = runner.clock.tick;
  runner.world.elapsedSeconds = runner.clock.elapsedSeconds;
  renewPiles(runner.world);

  updateLifecycle(runner.world, deltaSeconds);
  updateActions(runner.world, deltaSeconds);
  updateNeeds(runner.world, deltaSeconds);
  updateMovement(runner.world, deltaSeconds);
  if (runner.director) updateDirector(runner.world, runner.clock, runner.director);
  advanceClock(runner.clock);
}