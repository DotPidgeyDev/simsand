import { describe, expect, it } from 'vitest';

import { ACTION_IDS, TERRAIN_TYPES } from '@simsand/shared';

import { Action } from '../components/action.js';
import { Needs } from '../components/needs.js';
import { Personality } from '../components/personality.js';
import { createSimulationClock } from '../core/clock.js';
import { createWorldMap } from '../core/map.js';
import { capturePersistedWorld, restorePersistedWorld } from '../core/persistence.js';
import { createSimulationWorld } from '../core/world.js';
import type { SimulationWorld } from '../core/world.js';
import { createCharacter } from '../entities/create-character.js';
import { removeCharacter } from '../entities/remove-character.js';
import { inspectCharacter } from '../inspection/inspect-character.js';
import { MIN_ACTION_SECONDS, updateActions } from '../systems/actions.js';

function campWorld(): { world: SimulationWorld; eid: number } {
  const map = createWorldMap(8, 8, 'grass');
  map.tiles[2 * 8 + 3] = TERRAIN_TYPES.indexOf('camp');
  const world = createSimulationWorld(map);
  const eid = createCharacter(world, {
    id: 'worker',
    x: 3.5,
    y: 2.5,
    velocityX: 0,
    velocityY: 0,
    color: 0xffffff,
    sprite: 'wanderer',
  });

  Needs.hunger[eid] = 0.2;
  Needs.thirst[eid] = 0.2;
  Needs.fatigue[eid] = 0.2;
  Personality.curiosity[eid] = 0;
  Personality.industriousness[eid] = 1;
  Action.kind[eid] = ACTION_IDS.indexOf('work');
  Action.elapsed[eid] = MIN_ACTION_SECONDS;

  return { world, eid };
}

describe('camp yield', () => {
  it('adds one goods to the worker when a camp visit completes', () => {
    const { world, eid } = campWorld();
    Needs.hunger[eid] = 0.6;

    updateActions(world, 0.1);

    expect(inspectCharacter(world, 'worker')?.inventory).toEqual([{ item: 'goods', quantity: 1 }]);
    expect(world.inventories.size).toBe(1);
  });

  it('stacks a second completed visit on the same record', () => {
    const { world, eid } = campWorld();
    Needs.hunger[eid] = 0.6;

    updateActions(world, 0.1);
    Action.kind[eid] = ACTION_IDS.indexOf('work');
    Action.elapsed[eid] = MIN_ACTION_SECONDS;
    updateActions(world, 0.1);

    expect(inspectCharacter(world, 'worker')?.inventory).toEqual([{ item: 'goods', quantity: 2 }]);
    expect(world.inventories.size).toBe(1);
  });

  it('does not yield when hunger interrupts the visit', () => {
    const { world, eid } = campWorld();
    Needs.hunger[eid] = 0.9;

    updateActions(world, 0.1);

    expect(inspectCharacter(world, 'worker')?.inventory).toEqual([]);
    expect(world.inventories.size).toBe(0);
  });

  it('keeps another character on the same camp from sharing the stack', () => {
    const { world, eid } = campWorld();
    const other = createCharacter(world, {
      id: 'other',
      x: 3.2,
      y: 2.2,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'scout',
    });

    Needs.hunger[eid] = 0.6;
    Needs.hunger[other] = 0.2;
    Needs.thirst[other] = 0.2;
    Needs.fatigue[other] = 0.2;
    Personality.industriousness[other] = 1;
    Action.kind[other] = ACTION_IDS.indexOf('work');
    Action.elapsed[other] = 1;
    updateActions(world, 0.1);

    expect(inspectCharacter(world, 'worker')?.inventory).toEqual([{ item: 'goods', quantity: 1 }]);
    expect(inspectCharacter(world, 'other')?.inventory).toEqual([]);
  });

  it('saves the stack and drops it when the holder is removed', () => {
    const { world, eid } = campWorld();
    Needs.hunger[eid] = 0.6;
    updateActions(world, 0.1);

    const { world: restored } = restorePersistedWorld(
      structuredClone(capturePersistedWorld(world, createSimulationClock(), 0)),
    );

    expect(restored.inventories.get('worker')?.stacks).toEqual([{ item: 'goods', quantity: 1 }]);

    expect(removeCharacter(restored, 'worker')).toBe(true);
    expect(restored.inventories.has('worker')).toBe(false);
  });
});
