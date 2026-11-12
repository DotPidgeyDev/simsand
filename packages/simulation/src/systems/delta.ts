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
    previous.sprite !== current.sprite
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

  return {
    tick: current.tick,
    entities: changedEntities,
  };
}