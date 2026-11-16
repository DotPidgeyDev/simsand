import { describe, expect, it } from 'vitest';

import { ACTION_IDS, ACTION_OUTCOMES, LIFECYCLE_STATES, PERSONALITY_TRAITS, TERRAIN_TYPES } from '@simsand/shared';

import { generateCharacterProfile, spriteIdFor, startingAgeSeconds } from './characters/profile.js';
import { Action } from './components/action.js';
import { Condition } from './components/condition.js';
import { Lifecycle } from './components/lifecycle.js';
import { Needs } from './components/needs.js';
import { Personality } from './components/personality.js';
import { Position } from './components/position.js';
import { Velocity } from './components/velocity.js';
import { createSimulationClock } from './core/clock.js';
import { createWorldMap } from './core/map.js';
import { createSimulationRunner, tickSimulation } from './core/runner.js';
import { createSimulationWorld } from './core/world.js';
import { createCharacter } from './entities/create-character.js';
import { ACTION_COOLDOWN_SECONDS, actionBias, readActionOutcome } from './systems/actions.js';

// The live world is seed 12345. The name, sprite, attributes, needs and bias
// are what its saves already stored. The age is what a new character of that
// id starts at under the current lifespan. A saved age is stored, not
// regenerated, so changing the lifespan does not rewrite a character who
// already exists.
describe('saved character regression', () => {
  it('keeps the seeded profile, sprite, personality, age and action bias of the first two characters', () => {
    const seed = 12345;

    const record = (id: string) => {
      const profile = generateCharacterProfile(seed, id);

      return {
        name: profile.name,
        sprite: spriteIdFor(seed, id),
        constitution: profile.attributes.constitution,
        personality: profile.personality,
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
      personality: {
        aggression: 0.9307022297289222,
        sociability: 0.441749527817592,
        greed: 0.5880973970051855,
        ambition: 0.20183943514712155,
        loyalty: 0.2162901507690549,
        curiosity: 0.5566081199795008,
        courage: 0.2347148552071303,
        honesty: 0.2399068756494671,
        industriousness: 0.9833164657466114,
        empathy: 0.889111743774265,
      },
      hunger: 0.2097489281790331,
      thirst: 0.2665471578016877,
      fatigue: 0.17243020862806588,
        ageSeconds: 83438.78562524915,
      bias: {
        idle: -0.03235757681541145,
        move: -0.045392219768837096,
        eat: 0.018240540265105666,
        rest: -0.015285102697089315,
        drink: 0.0009058238938450813,
        work: -0.04566670234780759,
      },
    });

    expect(record('character-0002')).toEqual({
      name: 'Eda Elms',
      sprite: 'elder',
      constitution: 1,
      personality: {
        aggression: 0.8302760983351618,
        sociability: 0.16823452501557767,
        greed: 0.5786346038803458,
        ambition: 0.043034625705331564,
        loyalty: 0.9574289624579251,
        curiosity: 0.7063437341712415,
        courage: 0.9659481341950595,
        honesty: 0.6651530561503023,
        industriousness: 0.16548261139541864,
        empathy: 0.6874688565731049,
      },
      hunger: 0.25448191333562137,
      thirst: 0.190362236299552,
      fatigue: 0.39287108976859597,
        ageSeconds: 1612.5283788889647,
      bias: {
        idle: -0.04824329055845738,
        move: -0.009791009896434845,
        eat: 0.013716349168680609,
        rest: -0.03097284019459039,
        drink: -0.007325679855421186,
        work: 0.03581320659723133,
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

// Milestone 03 close-out. Later milestones may add actions and traits;
// they must not change this cycle.
describe('milestone 03 behaviour', () => {
  it('keeps the action and outcome catalogs', () => {
    expect(ACTION_IDS).toEqual(['idle', 'move', 'eat', 'rest', 'drink', 'work']);
    expect(ACTION_OUTCOMES).toEqual(['completed', 'interrupted', 'failed']);
    expect([...PERSONALITY_TRAITS]).toEqual([
      'aggression',
      'sociability',
      'greed',
      'ambition',
      'loyalty',
      'curiosity',
      'courage',
      'honesty',
      'industriousness',
      'empathy',
    ]);
  });

  it('walks a thirsty character to water and drinks there', () => {
    const map = createWorldMap(8, 8, 'grass');
    map.tiles[2 * 8 + 6] = TERRAIN_TYPES.indexOf('water');
    const world = createSimulationWorld(map);
    const eid = createCharacter(world, {
      id: 'thirsty',
      x: 1.5,
      y: 2.5,
      velocityX: 0,
      velocityY: 1,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    Needs.hunger[eid] = 0.1;
    Needs.thirst[eid] = 0.6;
    Needs.fatigue[eid] = 0.1;
    Personality.curiosity[eid] = 0;
    Personality.industriousness[eid] = 0;
    Lifecycle.ageSeconds[eid] = 0;

    const runner = createSimulationRunner(world, createSimulationClock());
    tickSimulation(runner);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('move');
    expect(Velocity.x[eid]).toBeGreaterThan(0.9);

    Position.x[eid] = 6.5;
    Position.y[eid] = 2.5;
    Action.elapsed[eid] = 0;
    tickSimulation(runner);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('drink');
    expect(Condition.drinking[eid]).toBe(1);
  });

  it('records a drink as failed when the map has no water', () => {
    const world = createSimulationWorld(createWorldMap(8, 8, 'grass'));
    const eid = createCharacter(world, {
      id: 'dry',
      x: 2,
      y: 2,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    Needs.hunger[eid] = 0.1;
    Needs.thirst[eid] = 0.85;
    Needs.fatigue[eid] = 0.1;
    Personality.curiosity[eid] = 0;
    Lifecycle.ageSeconds[eid] = 0;
    Action.elapsed[eid] = 0;

    tickSimulation(createSimulationRunner(world, createSimulationClock()));

    expect(ACTION_IDS[Action.kind[eid]]).toBe('idle');
    expect(readActionOutcome(eid)).toEqual({ action: 'drink', result: 'failed' });
    expect(Action.cooldown.drink[eid]).toBe(0);
  });

  it('fails a meal already underway in water and walks ashore', () => {
    const map = createWorldMap(8, 8, 'grass');
    map.tiles[2 * 8 + 2] = TERRAIN_TYPES.indexOf('water');
    const world = createSimulationWorld(map);
    const eid = createCharacter(world, {
      id: 'soaked',
      x: 2.5,
      y: 2.5,
      velocityX: 1,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    Needs.hunger[eid] = 0.9;
    Needs.thirst[eid] = 0.1;
    Needs.fatigue[eid] = 0.1;
    Personality.curiosity[eid] = 0;
    Lifecycle.ageSeconds[eid] = 0;
    Action.kind[eid] = ACTION_IDS.indexOf('eat');
    Action.elapsed[eid] = 1;

    const runner = createSimulationRunner(world, createSimulationClock());
    tickSimulation(runner);

    expect(readActionOutcome(eid)).toEqual({ action: 'eat', result: 'failed' });
    expect(ACTION_IDS[Action.kind[eid]]).toBe('move');
    expect(Action.cooldown.eat[eid]).toBe(0);
  });

  it('lets an industrious character work at a camp, and a lazy one stand', () => {
    const map = createWorldMap(8, 8, 'grass');
    map.tiles[2 * 8 + 5] = TERRAIN_TYPES.indexOf('camp');
    const world = createSimulationWorld(map);

    const worker = createCharacter(world, {
      id: 'worker',
      x: 1.5,
      y: 2.5,
      velocityX: 0,
      velocityY: 1,
      color: 0xffffff,
      sprite: 'wanderer',
    });
    const loafer = createCharacter(world, {
      id: 'loafer',
      x: 1.5,
      y: 4.5,
      velocityX: 0,
      velocityY: 1,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    for (const eid of [worker, loafer]) {
      Needs.hunger[eid] = 0.2;
      Needs.thirst[eid] = 0.2;
      Needs.fatigue[eid] = 0.2;
      Personality.curiosity[eid] = 0;
      Lifecycle.ageSeconds[eid] = 0;
      Action.elapsed[eid] = 0;
    }

    Personality.industriousness[worker] = 1;
    Personality.industriousness[loafer] = 0;

    tickSimulation(createSimulationRunner(world, createSimulationClock()));

    expect(ACTION_IDS[Action.kind[worker]]).toBe('move');
    expect(Velocity.x[worker]).toBeGreaterThan(0.9);
    expect(ACTION_IDS[Action.kind[loafer]]).toBe('idle');

    Position.x[worker] = 5.5;
    Position.y[worker] = 2.5;
    Action.elapsed[worker] = 0;
    tickSimulation(createSimulationRunner(world, createSimulationClock()));

    expect(ACTION_IDS[Action.kind[worker]]).toBe('work');
    expect(Condition.working[worker]).toBe(1);
  });

  it('interrupts movement for an urgent drink', () => {
    const map = createWorldMap(8, 8, 'grass');
    map.tiles[3 * 8 + 3] = TERRAIN_TYPES.indexOf('water');
    const world = createSimulationWorld(map);
    const eid = createCharacter(world, {
      id: 'urgent',
      x: 3.5,
      y: 3.5,
      velocityX: 1,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    Needs.hunger[eid] = 0.1;
    Needs.thirst[eid] = 0.85;
    Needs.fatigue[eid] = 0.1;
    Action.kind[eid] = ACTION_IDS.indexOf('move');
    Action.elapsed[eid] = 1;
    Lifecycle.ageSeconds[eid] = 0;

    tickSimulation(createSimulationRunner(world, createSimulationClock()));

    expect(ACTION_IDS[Action.kind[eid]]).toBe('drink');
    expect(Action.cooldown.move[eid]).toBe(ACTION_COOLDOWN_SECONDS);
    expect(readActionOutcome(eid)).toEqual({ action: 'move', result: 'interrupted' });
  });
});
