import { ITEM_IDS } from '@simsand/shared';
import type { InventoryStack, ItemId } from '@simsand/shared';

import type { SimulationWorld } from '../core/world.js';

// What a completed camp visit yields. The working flag only says they are working.
export const CAMP_YIELD: ItemId = 'goods';
export const CAMP_YIELD_QUANTITY = 1;

// A camp visit that already holds material. Work stays the visit with no input.
export const CRAFT_INPUT: ItemId = 'material';
export const CRAFT_OUTPUT: ItemId = 'food';
export const CRAFT_QUANTITY = 1;

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

export function heldQuantity(world: SimulationWorld, holderId: string, item: ItemId): number {
  const stack = world.inventories.get(holderId)?.stacks.find((entry) => entry.item === item);

  return stack?.quantity ?? 0;
}

// Moves quantity from one holder to another. One transfer, one stock change
// on each side. A holder left with nothing drops out of the map.
export function transferItem(
  world: SimulationWorld,
  fromId: string,
  toId: string,
  item: ItemId,
  quantity: number,
): boolean {
  if (fromId === toId) return false;
  if (!(ITEM_IDS as readonly string[]).includes(item)) {
    throw new Error(`Unknown item: ${item}`);
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error('Item quantity must be a positive integer');
  }

  const existing = world.inventories.get(fromId);
  const stacks = existing ? existing.stacks.map((stack) => ({ ...stack })) : [];
  const stack = stacks.find((entry) => entry.item === item);

  if (!stack || stack.quantity < quantity) return false;

  stack.quantity -= quantity;
  const remaining = stacks.filter((entry) => entry.quantity > 0);

  if (remaining.length === 0) world.inventories.delete(fromId);
  else world.inventories.set(fromId, { holderId: fromId, stacks: remaining });

  grantItem(world, toId, item, quantity);
  return true;
}

// Removes quantity from one holder. A holder left with nothing drops out of the map.
export function spendItem(
  world: SimulationWorld,
  holderId: string,
  item: ItemId,
  quantity: number,
): boolean {
  if (!(ITEM_IDS as readonly string[]).includes(item)) {
    throw new Error(`Unknown item: ${item}`);
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error('Item quantity must be a positive integer');
  }

  const existing = world.inventories.get(holderId);
  const stacks = existing ? existing.stacks.map((stack) => ({ ...stack })) : [];
  const stack = stacks.find((entry) => entry.item === item);

  if (!stack || stack.quantity < quantity) return false;

  stack.quantity -= quantity;
  const remaining = stacks.filter((entry) => entry.quantity > 0);

  if (remaining.length === 0) world.inventories.delete(holderId);
  else world.inventories.set(holderId, { holderId, stacks: remaining });

  return true;
}

export function inventoryFor(world: SimulationWorld, holderId: string): InventoryStack[] {
  const record = world.inventories.get(holderId);

  return record ? record.stacks.map((stack) => ({ ...stack })) : [];
}
