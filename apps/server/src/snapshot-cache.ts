import type { WorldDelta, WorldSnapshot } from '@simsand/shared';

export function applyDeltaToSnapshot(
  snapshot: WorldSnapshot,
  delta: WorldDelta,
): WorldSnapshot {
  const updates = new Map(
    delta.entities.map((entity) => [entity.id, entity]),
  );

  const entities = snapshot.entities.map((entity) => {
    return updates.get(entity.id) ?? entity;
  });

  for (const entity of delta.entities) {
    if (!snapshot.entities.some((existing) => existing.id === entity.id)) {
      entities.push(entity);
    }
  }

  return {
    ...snapshot,
    tick: delta.tick,
    entities,
  };
}
