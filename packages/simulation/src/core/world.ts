import { createWorld } from 'bitecs';

import type { WorldMap } from './map.js';
import { createWorldMap } from './map.js';

export interface SimulationWorld {
  ecs: ReturnType<typeof createWorld>;
  // Stable entity IDs are what leave the simulation; bitECS handles are
  // recycled after removal and must not be exposed or persisted.
  entityIds: Map<string, number>;
  map: WorldMap;
  // Used to derive a new character's profile. Population generation and
  // restoring a save both set it.
  seed: number;
}

export function createSimulationWorld(
  map: WorldMap = createWorldMap(),
  seed = 0,
): SimulationWorld {
  return {
    ecs: createWorld(),
    entityIds: new Map(),
    map,
    seed,
  };
}
