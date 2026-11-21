import { describe, expect, it } from 'vitest';

import { ACTION_IDS, TERRAIN_TYPES } from '@simsand/shared';

import { Action } from '../components/action.js';
import { Needs } from '../components/needs.js';
import { Personality } from '../components/personality.js';
import { Position } from '../components/position.js';
import { createWorldMap } from '../core/map.js';
import { createSimulationWorld } from '../core/world.js';
import type { SimulationWorld } from '../core/world.js';
import { createCharacter } from '../entities/create-character.js';
import { inspectCharacter } from '../inspection/inspect-character.js';
import { ACTION_COOLDOWN_SECONDS, MIN_ACTION_SECONDS, readActionOutcome, updateActions } from '../systems/actions.js';
import { HUNGER_RESUME_AT } from '../systems/needs.js';
import { grantItem } from './inventory.js';

function land(food = 0): { world: SimulationWorld; eid: number } {
  const map = createWorldMap(8, 8, 'grass');
  const world = createSimulationWorld(map, 1);
  const eid = createCharacter(world, {
    id: 'eater',
    x: 3.5,
    y: 2.5,
    velocityX: 0,
    velocityY: 1,
    color: 0xffffff,
    sprite: 'wanderer',
  });

  Needs.hunger[eid] = 0.6;
  Needs.thirst[eid] = 0.2;
  Needs.fatigue[eid] = 0.2;
  Personality.curiosity[eid] = 0;
  Personality.industriousness[eid] = 0;
  Personality.sociability[eid] = 0;
  Personality.empathy[eid] = 0;
  Personality.loyalty[eid] = 0;
  Personality.honesty[eid] = 0.5;
  Personality.greed[eid] = 0;

  if (food > 0) grantItem(world, 'eater', 'food', food);

  return { world, eid };
}

describe('dine', () => {
  it('dines when food is in hand', () => {
    const { world, eid } = land(1);

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('dine');
  });

  it('keeps the free meal when nothing is held', () => {
    const { world, eid } = land(0);

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('eat');
  });

  it('spends one food and brings hunger down to the quiet line', () => {
    const { world, eid } = land(2);
    Action.kind[eid] = ACTION_IDS.indexOf('dine');
    Action.elapsed[eid] = MIN_ACTION_SECONDS;

    updateActions(world, 0.1);

    expect(readActionOutcome(eid)).toEqual({ action: 'dine', result: 'completed' });
    expect(Needs.hunger[eid]).toBe(HUNGER_RESUME_AT);
    expect(inspectCharacter(world, 'eater')?.inventory).toEqual([{ item: 'food', quantity: 1 }]);
  });

  it('keeps the food when fatigue interrupts the meal', () => {
    const { world, eid } = land(1);
    Action.kind[eid] = ACTION_IDS.indexOf('dine');
    Action.elapsed[eid] = 1;
    Needs.fatigue[eid] = 0.9;

    updateActions(world, 0.1);

    expect(readActionOutcome(eid)).toEqual({ action: 'dine', result: 'interrupted' });
    expect(Action.cooldown.dine[eid]).toBe(ACTION_COOLDOWN_SECONDS);
    expect(Needs.hunger[eid]).toBe(0.6);
    expect(inspectCharacter(world, 'eater')?.inventory).toEqual([{ item: 'food', quantity: 1 }]);
  });

  it('fails the meal in the water and spends nothing', () => {
    const map = createWorldMap(8, 8, 'grass');
    map.tiles[2 * 8 + 3] = TERRAIN_TYPES.indexOf('water');
    const world = createSimulationWorld(map, 1);
    const eid = createCharacter(world, {
      id: 'eater',
      x: 3.5,
      y: 2.5,
      velocityX: 0,
      velocityY: 1,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    Needs.hunger[eid] = 0.6;
    Needs.thirst[eid] = 0.2;
    Needs.fatigue[eid] = 0.2;
    grantItem(world, 'eater', 'food', 1);
    Action.kind[eid] = ACTION_IDS.indexOf('dine');
    Action.elapsed[eid] = 1;
    Position.x[eid] = 3.5;
    Position.y[eid] = 2.5;

    updateActions(world, 0.1);

    expect(readActionOutcome(eid)).toEqual({ action: 'dine', result: 'failed' });
    expect(Action.cooldown.dine[eid]).toBe(0);
    expect(Needs.hunger[eid]).toBe(0.6);
    expect(inspectCharacter(world, 'eater')?.inventory).toEqual([{ item: 'food', quantity: 1 }]);
  });
});
