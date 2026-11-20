import type { ResourceNode } from '@simsand/shared';

import { generateResourceNodes } from '../core/map.js';
import type { SimulationWorld } from '../core/world.js';

export function placeGeneratedNodes(world: SimulationWorld): void {
  world.nodes = new Map(
    generateResourceNodes(world.map, world.seed).map((node) => [
      nodeKey(world.map.width, node.x, node.y),
      node,
    ]),
  );
}

export function nodeKey(width: number, x: number, y: number): number {
  return Math.floor(y) * width + Math.floor(x);
}

export function nodeAt(world: SimulationWorld, x: number, y: number): ResourceNode | undefined {
  return world.nodes.get(nodeKey(world.map.width, x, y));
}

// Removes one unit from the pile under this point. A pile that reaches zero
// leaves the map.
export function takeResource(world: SimulationWorld, x: number, y: number): ResourceNode | undefined {
  const key = nodeKey(world.map.width, x, y);
  const node = world.nodes.get(key);

  if (!node || node.quantity < 1) return undefined;

  node.quantity -= 1;

  if (node.quantity === 0) world.nodes.delete(key);

  return { x: node.x, y: node.y, item: node.item, quantity: 1 };
}
