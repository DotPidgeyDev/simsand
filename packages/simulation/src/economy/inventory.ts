import { ITEM_IDS } from '@simsand/shared';
import type { InventoryStack, ItemId } from '@simsand/shared';

import type { SimulationWorld } from '../core/world.js';

// What a completed camp visit yields. The working flag only says they are working.
export const CAMP_YIELD: ItemId = 'goods';
export const CAMP_YIELD_QUANTITY = 1;

export function grantItem(
  world: SimulationWorld,
  holderId: string,
  item: ItemId,
  quantity: number,
): void {
  if (!(ITEM_IDS as readonly string[]).includes(item)) {
    throw new Error(`Unknown item: ${item}`);
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error('Item quantity must be a positive integer');
  }

  const existing = world.inventories.get(holderId);
  const stacks = existing ? existing.stacks.map((stack) => ({ ...stack })) : [];
  const stack = stacks.find((entry) => entry.item === item);

  if (stack) stack.quantity += quantity;
  else stacks.push({ item, quantity });

  world.inventories.set(holderId, { holderId, stacks });
}

export function inventoryFor(world: SimulationWorld, holderId: string): InventoryStack[] {
  const record = world.inventories.get(holderId);

  return record ? record.stacks.map((stack) => ({ ...stack })) : [];
}
