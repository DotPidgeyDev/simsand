import { describe, expect, it } from 'vitest';

import { ACTION_IDS, LIFECYCLE_STATES } from '@simsand/shared';

import { Action } from '../components/action.js';
import { Identity } from '../components/identity.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';
import { Personality } from '../components/personality.js';
import { Position } from '../components/position.js';
import { createSimulationWorld } from '../core/world.js';
import { createCharacter } from '../entities/create-character.js';
import {
  ACTION_BIAS,
  ACTION_COOLDOWN_SECONDS,
  MIN_ACTION_SECONDS,
  actionAvailability,
  actionBias,
  actionUtilities,
  biasedUtilities,
  chooseAction,
  updateActions,
} from './actions.js';
import { updateMovement } from './movement.js';
import { updateNeeds } from './needs.js';

function character() {
  const world = createSimulationWorld();
  const eid = createCharacter(world, {
    id: 'chooser',
    x: 10,
    y: 10,
    velocityX: 1,
    velocityY: 0,
    color: 0xffffff,
    sprite: 'wanderer',
  });

  Needs.hunger[eid] = 0.2;
  Needs.thirst[eid] = 0.2;
  Needs.fatigue[eid] = 0.2;
  Lifecycle.ageSeconds[eid] = 0;
  return { world, eid };
}

describe('updateActions', () => {
  it('sends a curious, comfortable character walking', () => {
    const { world, eid } = character();
    Personality.curiosity[eid] = 1;

    updateActions(world, 0.1);
    updateMovement(world, 1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('move');
    expect(Position.x[eid]).toBe(11);
  });

  it('keeps an incurious, comfortable character idle', () => {
    const { world, eid } = character();
    Personality.curiosity[eid] = 0;

    updateActions(world, 0.1);
    updateMovement(world, 1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('idle');
    expect(Position.x[eid]).toBe(10);
  });

  it('chooses the pressing need and holds it until the need recovers', () => {
    const { world, eid } = character();
    Personality.curiosity[eid] = 1;
    Needs.hunger[eid] = 0.6;

    updateActions(world, 0.1);
    expect(ACTION_IDS[Action.kind[eid]]).toBe('eat');

    for (let i = 0; i < 30 && Needs.hunger[eid] > 0.3; i++) {
      updateActions(world, 1);
      updateNeeds(world, 1);
    }

    expect(Needs.hunger[eid]).toBeLessThanOrEqual(0.3);
    expect(Needs.hunger[eid]).toBeGreaterThan(0);

    updateActions(world, 1);
    expect(ACTION_IDS[Action.kind[eid]]).toBe('move');
  });

  it('does not abandon a choice before the commitment ends', () => {
    const { world, eid } = character();
    Personality.curiosity[eid] = 1;
    Action.kind[eid] = 1;
    Action.elapsed[eid] = 1;
    Needs.hunger[eid] = 0.6;

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('move');
    expect(Action.elapsed[eid]).toBeCloseTo(1.1);
  });

  it('lets an urgent need interrupt the commitment', () => {
    const { world, eid } = character();
    Action.kind[eid] = 1;
    Action.elapsed[eid] = 1;
    Needs.thirst[eid] = 0.85;

    updateActions(world, 0.1);
    updateMovement(world, 1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('drink');
    expect(Position.x[eid]).toBe(10);
    expect(Action.cooldown.move[eid]).toBe(ACTION_COOLDOWN_SECONDS);
    expect(Action.cooldown.drink[eid]).toBe(0);
  });

  it('skips a cooled action even when it scores highest', () => {
    const { world, eid } = character();
    Action.elapsed[eid] = 0;
    Action.cooldown.eat[eid] = 10;
    Needs.hunger[eid] = 0.9;
    Needs.thirst[eid] = 0.5;

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('drink');
    expect(Action.cooldown.eat[eid]).toBeCloseTo(9.9);
  });

  it('does not cool an action that finishes on its own', () => {
    const { world, eid } = character();
    Personality.curiosity[eid] = 1;
    Action.kind[eid] = ACTION_IDS.indexOf('eat');
    Action.elapsed[eid] = MIN_ACTION_SECONDS;
    Needs.hunger[eid] = 0.3;

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('move');
    expect(Action.cooldown.eat[eid]).toBe(0);
  });

  it('idles a dead character and leaves them where they are', () => {
    const { world, eid } = character();
    Lifecycle.state[eid] = LIFECYCLE_STATES.indexOf('dead');
    Action.kind[eid] = 1;
    Action.elapsed[eid] = 3;

    updateActions(world, 1);
    updateMovement(world, 1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('idle');
    expect(Action.elapsed[eid]).toBe(0);
    expect(Position.x[eid]).toBe(10);
  });

  it('keeps a stable personal bias that can break a tie', () => {
    const first = actionBias(12345, 'character-0001');

    expect(actionBias(12345, 'character-0001')).toEqual(first);
    expect(actionBias(12345, 'character-0002')).not.toEqual(first);

    for (const id of ACTION_IDS) {
      expect(first[id]).toBeGreaterThanOrEqual(-ACTION_BIAS);
      expect(first[id]).toBeLessThan(ACTION_BIAS);
    }

    const prefersMove: string[] = [];
    const prefersIdle: string[] = [];

    for (let n = 1; n <= 40; n++) {
      const id = `character-${String(n).padStart(4, '0')}`;
      const bias = actionBias(12345, id);

      if (bias.move > bias.idle) prefersMove.push(id);
      if (bias.move < bias.idle) prefersIdle.push(id);
    }

    expect(prefersMove.length).toBeGreaterThan(0);
    expect(prefersIdle.length).toBeGreaterThan(0);

    const world = createSimulationWorld(undefined, 12345);
    const settled = (id: string) => {
      const eid = createCharacter(world, {
        id,
        x: 1,
        y: 1,
        velocityX: 1,
        velocityY: 0,
        color: 0xffffff,
        sprite: 'wanderer',
      });
      Needs.hunger[eid] = 0.2;
      Needs.thirst[eid] = 0.2;
      Needs.fatigue[eid] = 0.2;
      Personality.curiosity[eid] = 0.5;
      Lifecycle.ageSeconds[eid] = 0;
      Action.elapsed[eid] = 0;
      return eid;
    };
    const walker = settled(prefersMove[0]);
    const stander = settled(prefersIdle[0]);

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[walker]]).toBe('move');
    expect(ACTION_IDS[Action.kind[stander]]).toBe('idle');
    expect(ACTION_IDS[Action.kind[walker]]).toBe(chooseAction(
      biasedUtilities(
        actionUtilities({ hunger: 0.2, thirst: 0.2, fatigue: 0.2, curiosity: 0.5 }),
        actionBias(12345, Identity.id[walker]),
      ),
      actionAvailability({ alive: true, hunger: 0.2, thirst: 0.2, fatigue: 0.2 }),
    ));
  });

  it('will not start a recovery that is already at its stopping point', () => {
    const { world, eid } = character();
    Action.elapsed[eid] = 0;
    Needs.hunger[eid] = 0.3;
    Needs.thirst[eid] = 0.1;
    Needs.fatigue[eid] = 0.1;
    Personality.curiosity[eid] = 1;

    for (const id of ACTION_IDS) {
      if (id !== 'eat') Action.cooldown[id][eid] = 20;
    }

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('idle');
    expect(Action.cooldown.eat[eid]).toBe(0);
  });

  it('starts a recovery once the need is above its stopping point', () => {
    const { world, eid } = character();
    Action.elapsed[eid] = 0;
    Needs.hunger[eid] = 0.31;
    Needs.thirst[eid] = 0.1;
    Needs.fatigue[eid] = 0.1;
    Personality.curiosity[eid] = 1;

    for (const id of ACTION_IDS) {
      if (id !== 'eat') Action.cooldown[id][eid] = 20;
    }

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('eat');
  });

  it('lets a pressing need outrank the personal bias', () => {
    const { world, eid } = character();
    Personality.curiosity[eid] = 1;
    Needs.hunger[eid] = 0.8;

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('eat');
  });

  it('reconsiders idle and move once the commitment has elapsed', () => {
    const { world, eid } = character();
    Personality.curiosity[eid] = 0;
    Action.kind[eid] = 1;
    Action.elapsed[eid] = MIN_ACTION_SECONDS;

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('idle');
  });
});
