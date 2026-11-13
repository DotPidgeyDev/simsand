import type {
  EntitySnapshot,
  WorldDelta,
  WorldSnapshot,
} from '@simsand/shared';

function hasChanged(
  previous: EntitySnapshot,
  current: EntitySnapshot,
): boolean {
  return (
    previous.x !== current.x ||
    previous.y !== current.y ||
    previous.color !== current.color ||
    previous.sprite !== current.sprite ||
    previous.resting !== current.resting ||
    previous.eating !== current.eating ||
    previous.drinking !== current.drinking ||
    previous.lifecycle !== current.lifecycle
  );
}

export function createWorldDelta(
  previous: WorldSnapshot,
  current: WorldSnapshot,
): WorldDelta {
  const previousEntities = new Map(
    previous.entities.map((entity) => [entity.id, entity]),
  );

  const changedEntities = current.entities.filter((entity) => {
    const previousEntity = previousEntities.get(entity.id);

    return (
      previousEntity === undefined ||
      hasChanged(previousEntity, entity)
    );
  });

  const currentIds = new Set(current.entities.map((entity) => entity.id));

  const removed = previous.entities
    .filter((entity) => !currentIds.has(entity.id))
    .map((entity) => entity.id);

  return {
    tick: current.tick,
    entities: changedEntities,
    removed,
  };
}