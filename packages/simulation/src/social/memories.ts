import type { MemoryKind, MemoryRecord } from '@simsand/shared';

import type { SimulationWorld } from '../core/world.js';
import { indexMemory, memoriesFor as memoriesForParticipant, memoryForPair } from '../history/records.js';
import { sortedPair } from './relationships.js';

function nextMemoryId(world: SimulationWorld): string {
  return `mem-${world.nextMemoryId++}`;
}

export function rememberEvent(
  world: SimulationWorld,
  kind: MemoryKind,
  eventId: string,
  a: string,
  b: string,
): MemoryRecord {
  const participants = sortedPair(a, b);
  const existing = memoryForPair(world, kind, participants[0], participants[1]);

  if (existing) return existing;

  const created: MemoryRecord = {
    memoryId: nextMemoryId(world),
    kind,
    eventId,
    tick: world.tick,
    participants,
  };

  world.memories.push(created);
  indexMemory(world, created);
  return created;
}

export function memoriesFor(world: SimulationWorld, id: string): MemoryRecord[] {
  return memoriesForParticipant(world, id);
}
