import type { ResourceNode } from '@simsand/shared';

import { generateResourceNodes, RESOURCE_NODE_STOCK, routesToward } from '../core/map.js';
import type { TerrainRoute } from '../core/map.js';
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

const nodeRoutes = new WeakMap<SimulationWorld, { stamp: string; field: Array<TerrainRoute | undefined> }>();

function nodeStamp(world: SimulationWorld): string {
  return [...world.nodes.keys()].sort((left, right) => left - right).join(',');
}

// The next step toward the nearest pile. Missing when rock, or a gap, blocks
// every pile. Rebuilt only when a pile appears or disappears.
export function nearestNodeTile(world: SimulationWorld, x: number, y: number): TerrainRoute | undefined {
  const stamp = nodeStamp(world);
  let cached = nodeRoutes.get(world);

  if (!cached || cached.stamp !== stamp) {
    const goals = new Set(world.nodes.keys());
    cached = { stamp, field: routesToward(world.map, (index) => goals.has(index)) };
    nodeRoutes.set(world, cached);
  }

  const tileX = Math.min(world.map.width - 1, Math.max(0, Math.floor(x)));
  const tileY = Math.min(world.map.height - 1, Math.max(0, Math.floor(y)));

  return cached.field[tileY * world.map.width + tileX];
}

// Hunger rises from satisfied to the quiet line in 75 seconds at the default
// rate (0.3 / 0.004). A pile stays gone longer than that, then returns here.
export const PILE_RETURN_SECONDS = 90;

// Removes one unit from the pile under this point. A pile that reaches zero
// leaves the map and is due back on this tile after the return delay.
export function takeResource(world: SimulationWorld, x: number, y: number): ResourceNode | undefined {
  const key = nodeKey(world.map.width, x, y);
  const node = world.nodes.get(key);

  if (!node || node.quantity < 1) return undefined;

  node.quantity -= 1;

  if (node.quantity === 0) {
    world.nodes.delete(key);
    world.returning.set(key, world.elapsedSeconds + PILE_RETURN_SECONDS);
  }

  return { x: node.x, y: node.y, item: node.item, quantity: 1 };
}

export function renewPiles(world: SimulationWorld): void {
  const due: number[] = [];

  for (const [key, at] of world.returning) {
    if (world.elapsedSeconds >= at) due.push(key);
  }

  for (const key of due) {
    world.returning.delete(key);
    if (world.nodes.has(key)) continue;

    const x = key % world.map.width;
    const y = Math.floor(key / world.map.width);
    world.nodes.set(key, { x, y, item: 'material', quantity: RESOURCE_NODE_STOCK });
  }
}
