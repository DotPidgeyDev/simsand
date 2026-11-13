import { createWorld } from 'bitecs';

import type { WorldMap } from './map.js';
import { createWorldMap } from './map.js';

export interface SimulationWorld {
  ecs: ReturnType<typeof createWorld>;
  // Stable entity IDs are what leave the simulation; bitECS handles are
  // recycled after removal and must not be exposed or persisted.
  entityIds: Map<string, number>;
  map: WorldMap;
}

export function createSimulationWorld(map: WorldMap = createWorldMap()): SimulationWorld {
  return {
    ecs: createWorld(),
    entityIds: new Map(),
    map,
  };
}
