import type {
  EntitySnapshot,
  InventoryStack,
  ResourceNode,
  WorldDelta,
  WorldSnapshot,
} from '@simsand/shared';

function sameInventory(
  previous: readonly InventoryStack[],
  current: readonly InventoryStack[],
): boolean {
  if (previous.length !== current.length) return false;

  for (let i = 0; i < previous.length; i++) {
    if (
      previous[i]!.item !== current[i]!.item
      || previous[i]!.quantity !== current[i]!.quantity
    ) {
      return false;
    }
  }

  return true;
}

function sameNodes(
  previous: readonly ResourceNode[],
  current: readonly ResourceNode[],
): boolean {
  if (previous.length !== current.length) return false;

  for (let i = 0; i < previous.length; i++) {
    const left = previous[i]!;
    const right = current[i]!;

    if (
      left.x !== right.x
      || left.y !== right.y
      || left.item !== right.item
      || left.quantity !== right.quantity
    ) {
      return false;
    }
  }

  return true;
}

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
    previous.working !== current.working ||
    previous.lifecycle !== current.lifecycle ||
    !sameInventory(previous.inventory, current.inventory)
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

  const delta: WorldDelta = {
    tick: current.tick,
    entities: changedEntities,
    removed,
  };

  if (!sameNodes(previous.nodes, current.nodes)) {
    delta.nodes = current.nodes;
  }

  return delta;
}
