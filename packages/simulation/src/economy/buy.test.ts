import { describe, expect, it } from 'vitest';

import { ACTION_IDS } from '@simsand/shared';

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
import { rememberMeeting } from '../social/relationships.js';
import { ACTION_COOLDOWN_SECONDS, MIN_ACTION_SECONDS, readActionOutcome, updateActions } from '../systems/actions.js';
import { FOOD_PRICE, grantItem } from './inventory.js';

function quiet(eid: number) {
  Needs.hunger[eid] = 0.2;
  Needs.thirst[eid] = 0.2;
  Needs.fatigue[eid] = 0.2;
  Personality.curiosity[eid] = 0.5;
  Personality.industriousness[eid] = 0;
  Personality.sociability[eid] = 0;
  Personality.empathy[eid] = 0;
  Personality.loyalty[eid] = 0;
  Personality.honesty[eid] = 0.5;
  Personality.greed[eid] = 1;
}

function pair(met = true): { world: SimulationWorld; left: number; right: number } {
  const world = createSimulationWorld(createWorldMap(8, 8, 'grass'));
  const left = createCharacter(world, {
    id: 'left',
    x: 2.5,
    y: 2.5,
    velocityX: 0,
    velocityY: 0,
    color: 0xffffff,
    sprite: 'wanderer',
  });
  const right = createCharacter(world, {
    id: 'right',
    x: 3.5,
    y: 2.5,
    velocityX: 0,
    velocityY: 0,
    color: 0xffffff,
    sprite: 'scout',
  });

  quiet(left);
  quiet(right);
  Personality.greed[right] = 0;

  for (const id of ['greet', 'comfort', 'keep', 'confide', 'bluff', 'give', 'buy'] as const) {
    Action.cooldown[id][right] = ACTION_COOLDOWN_SECONDS;
  }

  if (met) rememberMeeting(world, 'left', 'right', 'met', 0);

  return { world, left, right };
}

describe('buy', () => {
  it('pays two goods for one food from someone already met', () => {
    const { world, left } = pair();
    grantItem(world, 'left', 'goods', FOOD_PRICE);
    grantItem(world, 'right', 'food', 1);
    Action.kind[left] = ACTION_IDS.indexOf('buy');
    Action.target[left] = 'right';
    Action.elapsed[left] = MIN_ACTION_SECONDS;

    updateActions(world, 0.1);

    expect(readActionOutcome(left)).toEqual({ action: 'buy', result: 'completed' });
    expect(inspectCharacter(world, 'left')?.inventory).toEqual([{ item: 'food', quantity: 1 }]);
    expect(inspectCharacter(world, 'right')?.inventory).toEqual([{ item: 'goods', quantity: FOOD_PRICE }]);
    expect(world.relationships.get('left\tright')?.meetings).toBe(1);
    expect(world.memories.map((memory) => memory.kind)).toEqual(['trading']);
    expect(world.log.filter((event) => event.type === 'item.traded')).toEqual([
      expect.objectContaining({
        participants: ['left', 'right'],
        payload: {
          action: 'buy',
          result: 'completed',
          initiator: 'left',
          item: 'food',
          quantity: 1,
          price: FOOD_PRICE,
        },
      }),
    ]);

    const { world: restored } = restorePersistedWorld(
      structuredClone(capturePersistedWorld(world, createSimulationClock(), 0)),
    );

    expect(restored.inventories.get('left')?.stacks).toEqual([{ item: 'food', quantity: 1 }]);
    expect(restored.inventories.get('right')?.stacks).toEqual([{ item: 'goods', quantity: FOOD_PRICE }]);
  });

  it('chooses the purchase when greed is high and the price is in hand', () => {
    const { world, left } = pair();
    grantItem(world, 'left', 'goods', FOOD_PRICE);
    grantItem(world, 'right', 'food', 1);

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[left]]).toBe('buy');
  });

  it('gives goods away instead of buying when greed is low', () => {
    const { world, left } = pair();
    Personality.greed[left] = 0;
    grantItem(world, 'left', 'goods', FOOD_PRICE);
    grantItem(world, 'right', 'food', 1);

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[left]]).toBe('give');
  });

  it('does not buy from a stranger', () => {
    const { world, left } = pair(false);
    Personality.sociability[left] = 1;
    grantItem(world, 'left', 'goods', FOOD_PRICE);
    grantItem(world, 'right', 'food', 1);

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[left]]).toBe('greet');
  });

  it('does not buy when the goods in hand are short of the price', () => {
    const { world, left } = pair();
    grantItem(world, 'left', 'goods', FOOD_PRICE - 1);
    grantItem(world, 'right', 'food', 1);

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[left]]).not.toBe('buy');
    expect(inspectCharacter(world, 'right')?.inventory).toEqual([{ item: 'food', quantity: 1 }]);
  });

  it('keeps both stacks when fatigue interrupts the purchase', () => {
    const { world, left } = pair();
    grantItem(world, 'left', 'goods', FOOD_PRICE);
    grantItem(world, 'right', 'food', 1);
    Action.kind[left] = ACTION_IDS.indexOf('buy');
    Action.target[left] = 'right';
    Action.elapsed[left] = 1;
    Needs.fatigue[left] = 0.9;

    updateActions(world, 0.1);

    expect(readActionOutcome(left)).toEqual({ action: 'buy', result: 'interrupted' });
    expect(Action.cooldown.buy[left]).toBe(ACTION_COOLDOWN_SECONDS);
    expect(inspectCharacter(world, 'left')?.inventory).toEqual([{ item: 'goods', quantity: FOOD_PRICE }]);
    expect(inspectCharacter(world, 'right')?.inventory).toEqual([{ item: 'food', quantity: 1 }]);
  });

  it('fails the purchase when the seller leaves and moves nothing', () => {
    const { world, left, right } = pair();
    grantItem(world, 'left', 'goods', FOOD_PRICE);
    grantItem(world, 'right', 'food', 1);
    Action.kind[left] = ACTION_IDS.indexOf('buy');
    Action.target[left] = 'right';
    Action.elapsed[left] = 1;
    Position.x[right] = 6.5;

    updateActions(world, 0.1);

    expect(readActionOutcome(left)).toEqual({ action: 'buy', result: 'failed' });
    expect(Action.cooldown.buy[left]).toBe(0);
    expect(inspectCharacter(world, 'left')?.inventory).toEqual([{ item: 'goods', quantity: FOOD_PRICE }]);
    expect(inspectCharacter(world, 'right')?.inventory).toEqual([{ item: 'food', quantity: 1 }]);
    expect(world.memories).toEqual([]);
  });
});
