import { query } from 'bitecs';

import { LIFECYCLE_STATES } from '@simsand/shared';

import { Identity } from '../components/identity.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';
import { Position } from '../components/position.js';
import type { SimulationWorld } from '../core/world.js';

const DEAD = LIFECYCLE_STATES.indexOf('dead');

function tileKey(width: number, x: number, y: number): number {
  return Math.floor(y) * width + Math.floor(x);
}

export function buildOccupancy(world: SimulationWorld): Map<number, number[]> {
  const occupancy = new Map<number, number[]>();
  const width = world.map.width;

  for (const eid of query(world.ecs, [Identity, Position, Lifecycle])) {
    if (Lifecycle.state[eid] === DEAD) continue;

    const key = tileKey(width, Position.x[eid], Position.y[eid]);
    const bucket = occupancy.get(key);

    if (bucket) bucket.push(eid);
    else occupancy.set(key, [eid]);
  }

  return occupancy;
}

export interface NearbyLiving {
  id: string;
  distress: number;
}

// Living characters on the same or neighbouring tile.
export function livingNeighbors(
  world: SimulationWorld,
  eid: number,
  occupancy: Map<number, number[]>,
): NearbyLiving[] {
  const width = world.map.width;
  const originX = Math.floor(Position.x[eid]);
  const originY = Math.floor(Position.y[eid]);
  const nearby: NearbyLiving[] = [];

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const other of occupancy.get(tileKey(width, originX + dx, originY + dy)) ?? []) {
        if (other === eid) continue;

        nearby.push({
          id: Identity.id[other],
          distress: Math.max(Needs.hunger[other], Needs.thirst[other], Needs.fatigue[other]),
        });
      }
    }
  }

  return nearby;
}

// Lowest stable ID among living neighbours.
export function adjacentLivingId(nearby: readonly NearbyLiving[]): string | undefined {
  let best: string | undefined;

  for (const neighbor of nearby) {
    if (best === undefined || neighbor.id < best) best = neighbor.id;
  }

  return best;
}

export function distressOf(world: SimulationWorld, id: string): number {
  const other = world.entityIds.get(id);

  if (other === undefined || Lifecycle.state[other] === DEAD) return 0;

  return Math.max(Needs.hunger[other], Needs.thirst[other], Needs.fatigue[other]);
}

// Highest need among living neighbours. An equal need keeps the lowest stable ID.
export function mostDistressedNeighbor(nearby: readonly NearbyLiving[]): NearbyLiving | undefined {
  let best: NearbyLiving | undefined;

  for (const neighbor of nearby) {
    if (!best || neighbor.distress > best.distress || (neighbor.distress === best.distress && neighbor.id < best.id)) {
      best = neighbor;
    }
  }

  return best;
}

export function isAdjacentLiving(world: SimulationWorld, eid: number, targetId: string): boolean {
  const other = world.entityIds.get(targetId);

  if (other === undefined) return false;
  if (Lifecycle.state[other] === DEAD) return false;

  const dx = Math.floor(Position.x[eid]) - Math.floor(Position.x[other]);
  const dy = Math.floor(Position.y[eid]) - Math.floor(Position.y[other]);

  return Math.max(Math.abs(dx), Math.abs(dy)) <= 1;
}
