import type { CharacterRelationship, RelationshipRecord } from '@simsand/shared';

import type { SimulationWorld } from '../core/world.js';
import { indexRelationship, relationshipsFor as recordsFor } from '../history/records.js';

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}\t${b}` : `${b}\t${a}`;
}

export function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function rememberMeeting(
  world: SimulationWorld,
  a: string,
  b: string,
  eventId: string,
  tick: number,
): RelationshipRecord {
  const [left, right] = sortedPair(a, b);
  const key = pairKey(left, right);
  const existing = world.relationships.get(key);

  if (existing) {
    existing.meetings += 1;
    existing.lastEventId = eventId;
    existing.lastTick = tick;
    return existing;
  }

  const created: RelationshipRecord = {
    a: left,
    b: right,
    meetings: 1,
    lastEventId: eventId,
    lastTick: tick,
  };

  world.relationships.set(key, created);
  indexRelationship(world, created);
  return created;
}

// Lowest stable ID among neighbours this character has already met.
export function knownNeighborId(
  world: SimulationWorld,
  selfId: string,
  nearby: readonly { id: string }[],
): string | undefined {
  let best: string | undefined;

  for (const neighbor of nearby) {
    const record = world.relationships.get(pairKey(selfId, neighbor.id));

    if (!record || record.meetings < 1) continue;
    if (best === undefined || neighbor.id < best) best = neighbor.id;
  }

  return best;
}

export function relationshipsFor(world: SimulationWorld, id: string): CharacterRelationship[] {
  const result: CharacterRelationship[] = [];

  for (const record of recordsFor(world, id)) {
    result.push({
      otherId: record.a === id ? record.b : record.a,
      meetings: record.meetings,
      lastEventId: record.lastEventId,
      lastTick: record.lastTick,
    });
  }

  result.sort((left, right) => left.otherId.localeCompare(right.otherId));
  return result;
}
