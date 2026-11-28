import { describe, expect, it } from 'vitest';

import { ACTION_IDS, TERRAIN_TYPES } from '@simsand/shared';

import { Action } from '../components/action.js';
import { Needs } from '../components/needs.js';
import { Personality } from '../components/personality.js';
import { Position } from '../components/position.js';
import { createSimulationClock } from '../core/clock.js';
import { createWorldMap } from '../core/map.js';
import { capturePersistedWorld, restorePersistedWorld } from '../core/persistence.js';
import { createSimulationWorld } from '../core/world.js';
import type { SimulationWorld } from '../core/world.js';
import { createCharacter } from '../entities/create-character.js';
import { inspectCharacter } from '../inspection/inspect-character.js';
import { ACTION_COOLDOWN_SECONDS, MIN_ACTION_SECONDS, readActionOutcome, updateActions } from '../systems/actions.js';
import { grantItem } from './inventory.js';

function camp(material = 0): { world: SimulationWorld; eid: number } {
  const map = createWorldMap(8, 8, 'grass');
  map.tiles[2 * 8 + 3] = TERRAIN_TYPES.indexOf('camp');
  const world = createSimulationWorld(map, 1);
  const eid = createCharacter(world, {
    id: 'maker',
    x: 3.5,
    y: 2.5,
    velocityX: 1,
    velocityY: 0,
    color: 0xffffff,
    sprite: 'wanderer',
    profession: 'crafter',
  });

  Needs.hunger[eid] = 0.2;
  Needs.thirst[eid] = 0.2;
  Needs.fatigue[eid] = 0.2;
  Personality.curiosity[eid] = 0;
  Personality.industriousness[eid] = 1;
  Personality.sociability[eid] = 0;
  Personality.empathy[eid] = 0;
  Personality.loyalty[eid] = 0;
  Personality.honesty[eid] = 0.5;
  Personality.greed[eid] = 0;

  if (material > 0) grantItem(world, 'maker', 'material', material);

  return { world, eid };
}

describe('craft', () => {
  it('crafts at a camp when material is already in hand', () => {
    const { world, eid } = camp(1);

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('craft');
  });

  it('keeps working at a camp when nothing is held', () => {
    const { world, eid } = camp(0);

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('work');
  });

  it('spends one material and adds one food when the visit ends', () => {
    const { world, eid } = camp(2);
    Action.kind[eid] = ACTION_IDS.indexOf('craft');
    Action.elapsed[eid] = MIN_ACTION_SECONDS;
    Needs.hunger[eid] = 0.6;

    updateActions(world, 0.1);

    expect(readActionOutcome(eid)).toEqual({ action: 'craft', result: 'completed' });
    expect(inspectCharacter(world, 'maker')?.inventory).toEqual([
      { item: 'material', quantity: 1 },
      { item: 'food', quantity: 1 },
    ]);

    const { world: restored } = restorePersistedWorld(
      structuredClone(capturePersistedWorld(world, createSimulationClock(), 1)),
    );

    expect(restored.inventories.get('maker')?.stacks).toEqual([
      { item: 'material', quantity: 1 },
      { item: 'food', quantity: 1 },
    ]);
  });

  it('keeps the material when hunger interrupts the visit', () => {
    const { world, eid } = camp(1);
    Action.kind[eid] = ACTION_IDS.indexOf('craft');
    Action.elapsed[eid] = 1;
    Needs.hunger[eid] = 0.9;

    updateActions(world, 0.1);

    expect(readActionOutcome(eid)).toEqual({ action: 'craft', result: 'interrupted' });
    expect(Action.cooldown.craft[eid]).toBe(ACTION_COOLDOWN_SECONDS);
    expect(inspectCharacter(world, 'maker')?.inventory).toEqual([{ item: 'material', quantity: 1 }]);
  });

  it('fails the visit when they leave the camp and spends nothing', () => {
    const { world, eid } = camp(1);
    Action.kind[eid] = ACTION_IDS.indexOf('craft');
    Action.elapsed[eid] = 1;
    Position.x[eid] = 1.5;

    updateActions(world, 0.1);

    expect(readActionOutcome(eid)).toEqual({ action: 'craft', result: 'failed' });
    expect(Action.cooldown.craft[eid]).toBe(0);
    expect(inspectCharacter(world, 'maker')?.inventory).toEqual([{ item: 'material', quantity: 1 }]);
  });
});
