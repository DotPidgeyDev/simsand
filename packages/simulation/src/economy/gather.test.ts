import { describe, expect, it } from 'vitest';

import { ACTION_IDS } from '@simsand/shared';

import { Action } from '../components/action.js';
import { Needs } from '../components/needs.js';
import { Personality } from '../components/personality.js';
import { Velocity } from '../components/velocity.js';
import { createSimulationClock } from '../core/clock.js';
import { createWorldMap } from '../core/map.js';
import { capturePersistedWorld, restorePersistedWorld } from '../core/persistence.js';
import { createSimulationWorld } from '../core/world.js';
import type { SimulationWorld } from '../core/world.js';
import { createCharacter } from '../entities/create-character.js';
import { inspectCharacter } from '../inspection/inspect-character.js';
import { ACTION_COOLDOWN_SECONDS, MIN_ACTION_SECONDS, readActionOutcome, updateActions } from '../systems/actions.js';
import { nodeKey } from './nodes.js';

function pile(quantity = 3): { world: SimulationWorld; eid: number } {
  const map = createWorldMap(8, 8, 'grass');
  const world = createSimulationWorld(map, 1);
  world.nodes.set(nodeKey(map.width, 3, 2), { x: 3, y: 2, item: 'material', quantity });
  const eid = createCharacter(world, {
    id: 'picker',
    x: 3.5,
    y: 2.5,
    velocityX: 1,
    velocityY: 0,
    color: 0xffffff,
    sprite: 'wanderer',
  });

  Needs.hunger[eid] = 0.2;
  Needs.thirst[eid] = 0.2;
  Needs.fatigue[eid] = 0.2;
  Personality.curiosity[eid] = 0.5;
  Personality.industriousness[eid] = 1;
  Personality.sociability[eid] = 0;
  Personality.empathy[eid] = 0;
  Personality.loyalty[eid] = 0;
  Personality.honesty[eid] = 0.5;
  Personality.greed[eid] = 0;

  return { world, eid };
}

describe('gather', () => {
  it('takes one material from the pile underfoot when the visit ends', () => {
    const { world, eid } = pile();
    Action.kind[eid] = ACTION_IDS.indexOf('gather');
    Action.elapsed[eid] = MIN_ACTION_SECONDS;
    Needs.hunger[eid] = 0.6;

    updateActions(world, 0.1);

    expect(readActionOutcome(eid)).toEqual({ action: 'gather', result: 'completed' });
    expect(inspectCharacter(world, 'picker')?.inventory).toEqual([{ item: 'material', quantity: 1 }]);
    expect(inspectCharacter(world, 'picker')?.node).toEqual({ item: 'material', quantity: 2 });

    const { world: restored } = restorePersistedWorld(
      structuredClone(capturePersistedWorld(world, createSimulationClock(), 1)),
    );

    expect(restored.nodes.get(nodeKey(8, 3, 2))).toEqual({ x: 3, y: 2, item: 'material', quantity: 2 });
    expect(restored.inventories.get('picker')?.stacks).toEqual([{ item: 'material', quantity: 1 }]);
  });

  it('removes the pile once the last unit is taken', () => {
    const { world, eid } = pile(1);
    Action.kind[eid] = ACTION_IDS.indexOf('gather');
    Action.elapsed[eid] = MIN_ACTION_SECONDS;
    Needs.hunger[eid] = 0.6;

    updateActions(world, 0.1);

    expect(world.nodes.size).toBe(0);
    expect(inspectCharacter(world, 'picker')?.node).toBeNull();
    expect(inspectCharacter(world, 'picker')?.inventory).toEqual([{ item: 'material', quantity: 1 }]);
  });

  it('fails the visit when the pile is already empty and takes nothing', () => {
    const { world, eid } = pile(1);
    world.nodes.clear();
    Action.kind[eid] = ACTION_IDS.indexOf('gather');
    Action.elapsed[eid] = 1;

    updateActions(world, 0.1);

    expect(readActionOutcome(eid)).toEqual({ action: 'gather', result: 'failed' });
    expect(Action.cooldown.gather[eid]).toBe(0);
    expect(inspectCharacter(world, 'picker')?.inventory).toEqual([]);
  });

  it('does not take material when hunger interrupts the visit', () => {
    const { world, eid } = pile();
    Action.kind[eid] = ACTION_IDS.indexOf('gather');
    Action.elapsed[eid] = 1;
    Needs.hunger[eid] = 0.9;

    updateActions(world, 0.1);

    expect(readActionOutcome(eid)).toEqual({ action: 'gather', result: 'interrupted' });
    expect(Action.cooldown.gather[eid]).toBe(ACTION_COOLDOWN_SECONDS);
    expect(world.nodes.get(nodeKey(8, 3, 2))?.quantity).toBe(3);
    expect(inspectCharacter(world, 'picker')?.inventory).toEqual([]);
  });

  it('does not walk toward a pile on another tile', () => {
    const map = createWorldMap(8, 8, 'grass');
    const world = createSimulationWorld(map, 1);
    world.nodes.set(nodeKey(map.width, 6, 2), { x: 6, y: 2, item: 'material', quantity: 3 });
    const eid = createCharacter(world, {
      id: 'distant',
      x: 1.5,
      y: 2.5,
      velocityX: 0,
      velocityY: 1,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    Needs.hunger[eid] = 0.2;
    Needs.thirst[eid] = 0.2;
    Needs.fatigue[eid] = 0.2;
    Personality.curiosity[eid] = 0;
    Personality.industriousness[eid] = 1;
    Action.elapsed[eid] = 0;

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('idle');
    expect(Velocity.x[eid]).toBe(0);
    expect(Velocity.y[eid]).toBe(1);
    expect(world.nodes.get(nodeKey(8, 6, 2))?.quantity).toBe(3);
  });
});
