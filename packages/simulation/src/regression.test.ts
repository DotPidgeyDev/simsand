import { describe, expect, it } from 'vitest';

import { ACTION_IDS, LIFECYCLE_STATES } from '@simsand/shared';

import { generateCharacterProfile, spriteIdFor, startingAgeSeconds } from './characters/profile.js';
import { Action } from './components/action.js';
import { Lifecycle } from './components/lifecycle.js';
import { Needs } from './components/needs.js';
import { Personality } from './components/personality.js';
import { Position } from './components/position.js';
import { createSimulationClock } from './core/clock.js';
import { createSimulationRunner, tickSimulation } from './core/runner.js';
import { createSimulationWorld } from './core/world.js';
import { createCharacter } from './entities/create-character.js';
import { actionBias } from './systems/actions.js';

// The live world is seed 12345. These values are what its saves already
// stored. A generator change that is still deterministic would keep the
// same-seed tests green and silently rewrite every character.
describe('saved character regression', () => {
  it('keeps the seeded profile, sprite, age and action bias of the first two characters', () => {
    const seed = 12345;

    const record = (id: string) => {
      const profile = generateCharacterProfile(seed, id);

      return {
        name: profile.name,
        sprite: spriteIdFor(seed, id),
        constitution: profile.attributes.constitution,
        curiosity: profile.personality.curiosity,
        hunger: profile.needs.hunger,
        thirst: profile.needs.thirst,
        fatigue: profile.needs.fatigue,
        ageSeconds: startingAgeSeconds(seed, id, profile.attributes.constitution),
        bias: actionBias(seed, id),
      };
    };

    expect(record('character-0001')).toEqual({
      name: 'Cora Oak',
      sprite: 'elder',
      constitution: 6,
      curiosity: 0.5566081199795008,
      hunger: 0.2097489281790331,
      thirst: 0.2665471578016877,
      fatigue: 0.17243020862806588,
      ageSeconds: 2317.7440451458097,
      bias: {
        idle: -0.03235757681541145,
        move: -0.045392219768837096,
        eat: 0.018240540265105666,
        rest: -0.015285102697089315,
        drink: 0.0009058238938450813,
      },
    });

    expect(record('character-0002')).toEqual({
      name: 'Eda Elms',
      sprite: 'elder',
      constitution: 1,
      curiosity: 0.7063437341712415,
      hunger: 0.25448191333562137,
      thirst: 0.190362236299552,
      fatigue: 0.39287108976859597,
      ageSeconds: 44.79245496913791,
      bias: {
        idle: -0.04824329055845738,
        move: -0.009791009896434845,
        eat: 0.013716349168680609,
        rest: -0.03097284019459039,
        drink: -0.007325679855421186,
      },
    });
  });

  it('walks a comfortable character, then lets one meal bring hunger back down', () => {
    const world = createSimulationWorld();
    const eid = createCharacter(world, {
      id: 'walker',
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
    Personality.curiosity[eid] = 1;
    Lifecycle.ageSeconds[eid] = 0;

    const runner = createSimulationRunner(world, createSimulationClock());

    for (let i = 0; i < 20; i++) tickSimulation(runner);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('move');
    expect(Position.x[eid]).toBeCloseTo(12);
    expect(Needs.hunger[eid]).toBeGreaterThan(0.2);
    expect(Needs.hunger[eid]).toBeLessThan(0.8);
    expect(Lifecycle.state[eid]).toBe(LIFECYCLE_STATES.indexOf('alive'));

    Needs.hunger[eid] = 0.85;
    const stoppedAt = Position.x[eid];

    tickSimulation(runner);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('eat');
    expect(Position.x[eid]).toBe(stoppedAt);
    expect(Action.cooldown.move[eid]).toBe(20);

    for (let i = 0; i < 400 && Needs.hunger[eid] > 0.3; i++) tickSimulation(runner);

    expect(Needs.hunger[eid]).toBeGreaterThan(0);
    expect(Needs.hunger[eid]).toBeLessThanOrEqual(0.3);
    expect(Lifecycle.state[eid]).toBe(LIFECYCLE_STATES.indexOf('alive'));
  });
});
