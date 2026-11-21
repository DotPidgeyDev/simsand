import { describe, expect, it } from 'vitest';

import { ACTION_IDS, TERRAIN_TYPES } from '@simsand/shared';

import { Action } from '../components/action.js';
import { Needs } from '../components/needs.js';
import { Personality } from '../components/personality.js';
import { createWorldMap } from '../core/map.js';
import { createSimulationWorld } from '../core/world.js';
import type { SimulationWorld } from '../core/world.js';
import { createCharacter } from '../entities/create-character.js';
import { rememberMeeting } from '../social/relationships.js';
import { ACTION_COOLDOWN_SECONDS, MIN_ACTION_SECONDS, updateActions } from '../systems/actions.js';
import { grantItem } from './inventory.js';
import { economyViolations, tallyEconomy } from './invariants.js';
import type { EconomyTally } from './invariants.js';
import { nodeKey } from './nodes.js';

function quiet(eid: number) {
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
}

function character(world: SimulationWorld, id: string, x: number, y: number): number {
  const eid = createCharacter(world, {
    id,
    x,
    y,
    velocityX: 0,
    velocityY: 0,
    color: 0xffffff,
    sprite: 'wanderer',
  });

  quiet(eid);
  return eid;
}

function finish(world: SimulationWorld, eid: number, action: 'work' | 'gather' | 'craft' | 'dine' | 'give' | 'buy') {
  Action.kind[eid] = ACTION_IDS.indexOf(action);
  Action.elapsed[eid] = MIN_ACTION_SECONDS;
  if (action === 'give' || action === 'buy') Action.target[eid] = 'right';
  Needs.hunger[eid] = 0.6;
  updateActions(world, 0.1);
}

describe('economy invariants', () => {
  it('rejects an empty holder, a bad quantity, and a pile on the wrong tile', () => {
    const world = createSimulationWorld(createWorldMap(4, 4, 'grass'));

    world.inventories.set('holder', { holderId: 'holder', stacks: [] });
    expect(economyViolations(world)).toContain('Empty inventory for holder');

    world.inventories.set('holder', {
      holderId: 'holder',
      stacks: [{ item: 'goods', quantity: 0 }, { item: 'goods', quantity: 1 }],
    });
    const violations = economyViolations(world);

    expect(violations).toContain('Quantity of goods on holder is 0');
    expect(violations).toContain('Duplicate goods stack on holder');

    world.inventories.clear();
    world.nodes.set(0, { x: 1, y: 0, item: 'material', quantity: 3 });

    expect(economyViolations(world)).toContain('Pile at 1,0 is stored on the wrong tile');
  });

  it('creates one goods when a camp visit completes and nothing when it is interrupted', () => {
    const map = createWorldMap(8, 8, 'grass');
    map.tiles[2 * 8 + 3] = TERRAIN_TYPES.indexOf('camp');
    const world = createSimulationWorld(map);
    const eid = character(world, 'worker', 3.5, 2.5);
    const before = tallyEconomy(world);

    finish(world, eid, 'work');

    expect(tallyEconomy(world)).toEqual(plus(before, 'held', 'goods', 1));
    expect(economyViolations(world)).toEqual([]);

    const held = tallyEconomy(world);
    Needs.hunger[eid] = 0.2;
    Action.kind[eid] = ACTION_IDS.indexOf('work');
    Action.elapsed[eid] = 1;
    Needs.hunger[eid] = 0.9;
    updateActions(world, 0.1);

    expect(tallyEconomy(world)).toEqual(held);
  });

  it('moves one material from the pile into the hand', () => {
    const map = createWorldMap(8, 8, 'grass');
    const world = createSimulationWorld(map);
    world.nodes.set(nodeKey(8, 3, 2), { x: 3, y: 2, item: 'material', quantity: 3 });
    const eid = character(world, 'picker', 3.5, 2.5);
    const before = tallyEconomy(world);

    finish(world, eid, 'gather');

    const after = tallyEconomy(world);

    expect(after.held.material).toBe(before.held.material + 1);
    expect(after.piled.material).toBe(before.piled.material - 1);
    expect(after.held.goods).toBe(before.held.goods);
    expect(after.held.food).toBe(before.held.food);
    expect(economyViolations(world)).toEqual([]);
  });

  it('turns one material into one food and then spends that food', () => {
    const map = createWorldMap(8, 8, 'grass');
    map.tiles[2 * 8 + 3] = TERRAIN_TYPES.indexOf('camp');
    const world = createSimulationWorld(map);
    const eid = character(world, 'maker', 3.5, 2.5);
    grantItem(world, 'maker', 'material', 1);
    const before = tallyEconomy(world);

    finish(world, eid, 'craft');

    const crafted = tallyEconomy(world);

    expect(crafted.held.material).toBe(before.held.material - 1);
    expect(crafted.held.food).toBe(before.held.food + 1);
    expect(crafted.held.goods).toBe(before.held.goods);

    Needs.hunger[eid] = 0.6;
    finish(world, eid, 'dine');

    const eaten = tallyEconomy(world);

    expect(eaten.held.food).toBe(crafted.held.food - 1);
    expect(eaten.held.material).toBe(crafted.held.material);
    expect(eaten.held.goods).toBe(crafted.held.goods);
    expect(economyViolations(world)).toEqual([]);
  });

  it('moves goods as a gift and swaps goods for food as a purchase', () => {
    const world = createSimulationWorld(createWorldMap(8, 8, 'grass'));
    const left = character(world, 'left', 2.5, 2.5);
    const right = character(world, 'right', 3.5, 2.5);

    Personality.greed[right] = 1;
    for (const id of ['greet', 'comfort', 'keep', 'confide', 'bluff', 'give', 'buy'] as const) {
      Action.cooldown[id][right] = ACTION_COOLDOWN_SECONDS;
    }

    rememberMeeting(world, 'left', 'right', 'met', 0);
    grantItem(world, 'left', 'goods', 3);
    grantItem(world, 'right', 'food', 1);
    const before = tallyEconomy(world);

    finish(world, left, 'give');

    const given = tallyEconomy(world);

    expect(given).toEqual(before);

    grantItem(world, 'left', 'goods', 2);
    const stocked = tallyEconomy(world);

    Needs.hunger[left] = 0.2;
    finish(world, left, 'buy');

    expect(tallyEconomy(world)).toEqual(stocked);
    expect(economyViolations(world)).toEqual([]);
  });
});

function plus(tally: EconomyTally, place: 'held' | 'piled', item: 'goods' | 'material' | 'food', amount: number): EconomyTally {
  return {
    held: { ...tally.held, ...(place === 'held' ? { [item]: tally.held[item] + amount } : {}) },
    piled: { ...tally.piled, ...(place === 'piled' ? { [item]: tally.piled[item] + amount } : {}) },
  };
}
