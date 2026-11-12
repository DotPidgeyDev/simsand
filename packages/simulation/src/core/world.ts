import { createWorld } from 'bitecs';

export interface SimulationWorld {
  ecs: ReturnType<typeof createWorld>;
  // Stable entity IDs are what leave the simulation; bitECS handles are
  // recycled after removal and must not be exposed or persisted.
  entityIds: Map<string, number>;
}

export function createSimulationWorld(): SimulationWorld {
  return {
    ecs: createWorld(),
    entityIds: new Map(),
  };
}
