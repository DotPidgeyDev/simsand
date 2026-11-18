import type { MemoryKind, MemoryRecord } from '@simsand/shared';

import type { SimulationWorld } from '../core/world.js';
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
  const existing = world.memories.find((memory) => (
    memory.kind === kind
    && memory.participants[0] === participants[0]
    && memory.participants[1] === participants[1]
  ));

  if (existing) return existing;

  const created: MemoryRecord = {
    memoryId: nextMemoryId(world),
    kind,
    eventId,
    tick: world.tick,
    participants,
  };

  world.memories.push(created);
  return created;
}

export function memoriesFor(world: SimulationWorld, id: string): MemoryRecord[] {
  return world.memories.filter((memory) => memory.participants.includes(id));
}
