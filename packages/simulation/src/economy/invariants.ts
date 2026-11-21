import { ITEM_IDS } from '@simsand/shared';
import type { ItemId } from '@simsand/shared';

import type { SimulationWorld } from '../core/world.js';
import { nodeKey } from './nodes.js';

export interface EconomyTally {
  held: Record<ItemId, number>;
  piled: Record<ItemId, number>;
}

function emptyCounts(): Record<ItemId, number> {
  return { goods: 0, material: 0, food: 0 };
}

function knownItem(item: string): item is ItemId {
  return (ITEM_IDS as readonly string[]).includes(item);
}

// Sum of every stack and every pile. Work creates goods. Dine spends food.
// The other completed actions move or convert these counts.
export function tallyEconomy(world: SimulationWorld): EconomyTally {
  const held = emptyCounts();
  const piled = emptyCounts();

  for (const record of world.inventories.values()) {
    for (const stack of record.stacks) {
      if (knownItem(stack.item)) held[stack.item] += stack.quantity;
    }
  }

  for (const node of world.nodes.values()) {
    if (knownItem(node.item)) piled[node.item] += node.quantity;
  }

  return { held, piled };
}

// A holder or a pile with nothing is absent. A quantity is a positive integer.
// One holder has at most one stack of each item, and a pile sits on its own tile.
export function economyViolations(world: SimulationWorld): string[] {
  const violations: string[] = [];

  for (const [holderId, record] of world.inventories) {
    if (record.holderId !== holderId) {
      violations.push(`Inventory for ${holderId} is stored on ${record.holderId}`);
    }

    if (record.stacks.length === 0) violations.push(`Empty inventory for ${holderId}`);

    const seen = new Set<string>();

    for (const stack of record.stacks) {
      if (!knownItem(stack.item)) violations.push(`Unknown item ${stack.item} on ${holderId}`);
      if (!Number.isInteger(stack.quantity) || stack.quantity < 1) {
        violations.push(`Quantity of ${stack.item} on ${holderId} is ${stack.quantity}`);
      }

      if (seen.has(stack.item)) violations.push(`Duplicate ${stack.item} stack on ${holderId}`);
      seen.add(stack.item);
    }
  }

  for (const [key, node] of world.nodes) {
    if (!knownItem(node.item)) violations.push(`Unknown piled item ${node.item}`);
    if (!Number.isInteger(node.quantity) || node.quantity < 1) {
      violations.push(`Pile quantity at ${node.x},${node.y} is ${node.quantity}`);
    }

    if (
      !Number.isInteger(node.x)
      || !Number.isInteger(node.y)
      || node.x < 0
      || node.y < 0
      || node.x >= world.map.width
      || node.y >= world.map.height
    ) {
      violations.push(`Pile at ${node.x},${node.y} is outside the map`);
      continue;
    }

    if (nodeKey(world.map.width, node.x, node.y) !== key) {
      violations.push(`Pile at ${node.x},${node.y} is stored on the wrong tile`);
    }
  }

  for (const [key, at] of world.returning) {
    const x = key % world.map.width;
    const y = Math.floor(key / world.map.width);

    if (!Number.isFinite(at) || at < 0) {
      violations.push(`Pile at ${x},${y} returns at ${at}`);
    }

    if (x < 0 || y < 0 || x >= world.map.width || y >= world.map.height) {
      violations.push(`Returning pile at ${x},${y} is outside the map`);
      continue;
    }

    if (world.nodes.has(key)) {
      violations.push(`Pile at ${x},${y} is waiting to return while it is still here`);
    }
  }

  return violations;
}
