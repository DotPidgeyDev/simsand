// we need to introduce an internal timing system independent of the system its running on
export interface SimulationClock {
  tick: number;
  elapsedSeconds: number;
  fixedDeltaSeconds: number;
}

export function createSimulationClock(
  fixedDeltaSeconds = 0.1,
): SimulationClock {
  if (fixedDeltaSeconds <= 0) {
    throw new Error('Fixed timestep must be greater than zero');
  }

  return {
    tick: 0,
    elapsedSeconds: 0,
    fixedDeltaSeconds,
  };
}

export function advanceClock(clock: SimulationClock): void {
  clock.tick += 1;
  clock.elapsedSeconds += clock.fixedDeltaSeconds;
}