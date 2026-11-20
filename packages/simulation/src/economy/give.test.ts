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
import { grantItem } from './inventory.js';

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
  Personality.greed[eid] = 0;
}

function pair(): { world: SimulationWorld; left: number; right: number } {
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
  Personality.greed[right] = 1;

  for (const id of ['greet', 'comfort', 'keep', 'confide', 'bluff', 'give'] as const) {
    Action.cooldown[id][right] = ACTION_COOLDOWN_SECONDS;
  }

  rememberMeeting(world, 'left', 'right', 'met', 0);
  return { world, left, right };
}

describe('give', () => {
  it('hands one goods to someone already met', () => {
    const { world, left } = pair();
    grantItem(world, 'left', 'goods', 1);
    Action.kind[left] = ACTION_IDS.indexOf('give');
    Action.target[left] = 'right';
    Action.elapsed[left] = MIN_ACTION_SECONDS;

    updateActions(world, 0.1);

    expect(readActionOutcome(left)).toEqual({ action: 'give', result: 'completed' });
    expect(inspectCharacter(world, 'left')?.inventory).toEqual([]);
    expect(inspectCharacter(world, 'right')?.inventory).toEqual([{ item: 'goods', quantity: 1 }]);
    expect(world.relationships.get('left\tright')?.meetings).toBe(1);
    expect(world.memories.map((memory) => memory.kind)).toEqual(['giving']);
    expect(world.log.filter((event) => event.type === 'item.transferred')).toEqual([
      expect.objectContaining({
        participants: ['left', 'right'],
        payload: {
          action: 'give',
          result: 'completed',
          initiator: 'left',
          item: 'goods',
          quantity: 1,
        },
      }),
    ]);

    const saved = capturePersistedWorld(world, createSimulationClock(), 0);
    const { world: restored } = restorePersistedWorld(structuredClone(saved));

    expect(restored.inventories.get('right')?.stacks).toEqual([{ item: 'goods', quantity: 1 }]);
    expect(restored.inventories.has('left')).toBe(false);
    expect(restored.log.filter((event) => event.type === 'item.transferred')).toHaveLength(1);
  });

  it('stacks a second gift on the same memory', () => {
    const { world, left } = pair();
    grantItem(world, 'left', 'goods', 2);
    Action.kind[left] = ACTION_IDS.indexOf('give');
    Action.target[left] = 'right';
    Action.elapsed[left] = MIN_ACTION_SECONDS;

    updateActions(world, 0.1);
    Action.kind[left] = ACTION_IDS.indexOf('give');
    Action.target[left] = 'right';
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    updateActions(world, 0.1);

    expect(inspectCharacter(world, 'left')?.inventory).toEqual([]);
    expect(inspectCharacter(world, 'right')?.inventory).toEqual([{ item: 'goods', quantity: 2 }]);
    expect(world.memories).toHaveLength(1);
    expect(world.log.filter((event) => event.type === 'item.transferred')).toHaveLength(2);
  });

  it('keeps the stack when greed outranks giving', () => {
    const { world, left } = pair();
    grantItem(world, 'left', 'goods', 1);
    Personality.greed[left] = 1;
    Action.elapsed[left] = 0;

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[left]]).not.toBe('give');
    expect(inspectCharacter(world, 'left')?.inventory).toEqual([{ item: 'goods', quantity: 1 }]);
    expect(world.log.some((event) => event.type === 'item.transferred')).toBe(false);
  });

  it('does not give to a stranger', () => {
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
    createCharacter(world, {
      id: 'right',
      x: 3.5,
      y: 2.5,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'scout',
    });
    quiet(left);
    grantItem(world, 'left', 'goods', 1);
    Action.elapsed[left] = 0;

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[left]]).not.toBe('give');
    expect(inspectCharacter(world, 'left')?.inventory).toEqual([{ item: 'goods', quantity: 1 }]);
  });

  it('fails the gift when the other character leaves, and keeps the goods', () => {
    const { world, left, right } = pair();
    grantItem(world, 'left', 'goods', 1);
    Action.kind[left] = ACTION_IDS.indexOf('give');
    Action.target[left] = 'right';
    Action.elapsed[left] = 1;
    Position.x[right] = 7.5;
    Position.y[right] = 7.5;

    updateActions(world, 0.1);

    expect(readActionOutcome(left)).toEqual({ action: 'give', result: 'failed' });
    expect(Action.cooldown.give[left]).toBe(0);
    expect(inspectCharacter(world, 'left')?.inventory).toEqual([{ item: 'goods', quantity: 1 }]);
    expect(world.memories).toEqual([]);
  });

  it('does not hand goods over when hunger interrupts the gift', () => {
    const { world, left } = pair();
    grantItem(world, 'left', 'goods', 1);
    Action.kind[left] = ACTION_IDS.indexOf('give');
    Action.target[left] = 'right';
    Action.elapsed[left] = 1;
    Needs.hunger[left] = 0.9;

    updateActions(world, 0.1);

    expect(readActionOutcome(left)).toEqual({ action: 'give', result: 'interrupted' });
    expect(Action.cooldown.give[left]).toBe(ACTION_COOLDOWN_SECONDS);
    expect(inspectCharacter(world, 'left')?.inventory).toEqual([{ item: 'goods', quantity: 1 }]);
  });
});
