import { createWorld } from 'bitecs';

import type { InventoryRecord, MemoryRecord, RelationshipRecord, ResourceNode, SimulationLogEvent } from '@simsand/shared';

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
  // Derived from `relationships`. One record stays one fact; each
  // participant's list points at that same object.
  relationshipsByParticipant: Map<string, RelationshipRecord[]>;
  log: SimulationLogEvent[];
  nextLogId: number;
  // Events the live log has dropped and the store has not confirmed.
  // They are not indexed and not part of the snapshot body.
  pendingLog: SimulationLogEvent[];
  // Derived from `log`. Built when an event is written, dropped when
  // the cap removes it. Not saved.
  logByParticipant: Map<string, SimulationLogEvent[]>;
  logByPair: Map<string, SimulationLogEvent[]>;
  memories: MemoryRecord[];
  nextMemoryId: number;
  // Derived from `memories`. The pair-and-kind map is the first-memory check.
  memoriesByParticipant: Map<string, MemoryRecord[]>;
  memoryByPairKind: Map<string, MemoryRecord>;
  // Sparse: a holder appears only once they carry something.
  inventories: Map<string, InventoryRecord>;
  // Sparse: a tile appears only while its pile has quantity left.
  nodes: Map<number, ResourceNode>;
  // Tile key to the elapsed time when that pile returns at full stock.
  returning: Map<number, number>;
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
    relationshipsByParticipant: new Map(),
    log: [],
    nextLogId: 1,
    pendingLog: [],
    logByParticipant: new Map(),
    logByPair: new Map(),
    memories: [],
    nextMemoryId: 1,
    memoriesByParticipant: new Map(),
    memoryByPairKind: new Map(),
    inventories: new Map(),
    nodes: new Map(),
    returning: new Map(),
  };
}
