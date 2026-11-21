import type { MemoryKind, MemoryRecord, RelationshipRecord, SimulationLogEvent } from '@simsand/shared';

import type { SimulationWorld } from '../core/world.js';

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\t${b}` : `${b}\t${a}`;
}

export function memoryKey(kind: MemoryKind, a: string, b: string): string {
  return `${kind}\t${pairKey(a, b)}`;
}

function listFor<T>(index: Map<string, T[]>, key: string): T[] {
  const existing = index.get(key);

  if (existing) return existing;

  const created: T[] = [];
  index.set(key, created);
  return created;
}

function detach<T>(index: Map<string, T[]>, key: string, value: T): void {
  const list = index.get(key);

  if (!list) return;

  if (list[0] === value) {
    list.shift();
  } else {
    const at = list.indexOf(value);

    if (at >= 0) list.splice(at, 1);
  }

  if (list.length === 0) index.delete(key);
}

function eachParticipant(ids: readonly string[], visit: (id: string) => void): void {
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) continue;

    seen.add(id);
    visit(id);
  }
}

export function indexLogEvent(world: SimulationWorld, event: SimulationLogEvent): void {
  eachParticipant(event.participants, (id) => {
    listFor(world.logByParticipant, id).push(event);
  });

  if (event.participants.length >= 2 && event.participants[0] !== event.participants[1]) {
    listFor(world.logByPair, pairKey(event.participants[0], event.participants[1])).push(event);
  }
}

export function unindexLogEvent(world: SimulationWorld, event: SimulationLogEvent): void {
  eachParticipant(event.participants, (id) => {
    detach(world.logByParticipant, id, event);
  });

  if (event.participants.length >= 2 && event.participants[0] !== event.participants[1]) {
    detach(world.logByPair, pairKey(event.participants[0], event.participants[1]), event);
  }
}

export function eventsFor(world: SimulationWorld, id: string): SimulationLogEvent[] {
  return [...(world.logByParticipant.get(id) ?? [])];
}

export function eventsForPair(world: SimulationWorld, a: string, b: string): SimulationLogEvent[] {
  return [...(world.logByPair.get(pairKey(a, b)) ?? [])];
}

export function indexMemory(world: SimulationWorld, memory: MemoryRecord): void {
  const [first, second] = memory.participants;
  const key = memoryKey(memory.kind, first, second ?? first);

  if (!world.memoryByPairKind.has(key)) {
    world.memoryByPairKind.set(key, memory);
  }

  eachParticipant(memory.participants, (id) => {
    listFor(world.memoriesByParticipant, id).push(memory);
  });
}

export function memoryForPair(
  world: SimulationWorld,
  kind: MemoryKind,
  a: string,
  b: string,
): MemoryRecord | undefined {
  return world.memoryByPairKind.get(memoryKey(kind, a, b));
}

export function memoriesFor(world: SimulationWorld, id: string): MemoryRecord[] {
  return [...(world.memoriesByParticipant.get(id) ?? [])];
}

export function indexRelationship(world: SimulationWorld, record: RelationshipRecord): void {
  listFor(world.relationshipsByParticipant, record.a).push(record);

  if (record.b !== record.a) {
    listFor(world.relationshipsByParticipant, record.b).push(record);
  }
}

export function relationshipsFor(world: SimulationWorld, id: string): RelationshipRecord[] {
  return [...(world.relationshipsByParticipant.get(id) ?? [])];
}

// Indexes are derived. A restored world rebuilds them from the saved lists.
export function acknowledgePendingLog(world: SimulationWorld, eventIds: readonly string[]): void {
  if (eventIds.length === 0 || world.pendingLog.length === 0) return;

  const saved = new Set(eventIds);

  world.pendingLog = world.pendingLog.filter((event) => !saved.has(event.eventId));
}

export function rebuildHistoryIndexes(world: SimulationWorld): void {
  world.logByParticipant.clear();
  world.logByPair.clear();
  world.memoriesByParticipant.clear();
  world.memoryByPairKind.clear();
  world.relationshipsByParticipant.clear();

  for (const event of world.log) indexLogEvent(world, event);
  for (const memory of world.memories) indexMemory(world, memory);
  for (const record of world.relationships.values()) indexRelationship(world, record);
}
