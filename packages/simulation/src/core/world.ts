import { createWorld } from 'bitecs';

export interface SimulationWorld {
  ecs: ReturnType<typeof createWorld>;
}

export function createSimulationWorld(): SimulationWorld {
  return {
    ecs: createWorld(),
  };
}