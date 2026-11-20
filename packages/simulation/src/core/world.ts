import { createWorld } from 'bitecs';

import type { InventoryRecord, MemoryRecord, RelationshipRecord, SimulationLogEvent } from '@simsand/shared';

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
  tick: number;
  elapsedSeconds: number;
  relationships: Map<string, RelationshipRecord>;
  log: SimulationLogEvent[];
  nextLogId: number;
  memories: MemoryRecord[];
  nextMemoryId: number;
  // Sparse: a holder appears only once they carry something.
  inventories: Map<string, InventoryRecord>;
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
    tick: 0,
    elapsedSeconds: 0,
    relationships: new Map(),
    log: [],
    nextLogId: 1,
    memories: [],
    nextMemoryId: 1,
    inventories: new Map(),
  };
}
