import { describe, expect, it } from 'vitest';

import { ACTION_IDS, ACTION_OUTCOMES, LIFECYCLE_STATES, MEMORY_KINDS, PERSONALITY_TRAITS, SIMULATION_LOG_TYPES, TERRAIN_TYPES } from '@simsand/shared';

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
import { inspectCharacterHistory } from './inspection/inspect-character.js';
import { ACTION_COOLDOWN_SECONDS, MIN_ACTION_SECONDS, actionBias, readActionOutcome, updateActions } from './systems/actions.js';

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
        greet: -0.003243945073336363,
        comfort: -0.027584953559562565,
        keep: -0.027385083655826748,
        confide: 0.027420115494169298,
        bluff: 0.04461649802979082,
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
        greet: 0.02465537975076586,
        comfort: -0.009815051499754191,
        keep: -0.003977843187749386,
        confide: 0.02543283784762025,
        bluff: -0.029123423085547984,
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
    expect(ACTION_IDS.slice(0, 8)).toEqual(['idle', 'move', 'eat', 'rest', 'drink', 'work', 'greet', 'comfort']);
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

// Milestone 04 close-out. Later milestones may append actions, memories
// and log types. They must not change this social cycle.
describe('milestone 04 behaviour', () => {
  it('keeps the social catalogs appended after the earlier actions', () => {
    expect(ACTION_IDS.slice(0, 11)).toEqual([
      'idle', 'move', 'eat', 'rest', 'drink', 'work', 'greet', 'comfort', 'keep', 'confide', 'bluff',
    ]);
    expect(MEMORY_KINDS.slice(0, 5)).toEqual(['greeting', 'comforting', 'keeping', 'confiding', 'bluffing']);
    expect(SIMULATION_LOG_TYPES.slice(0, 6)).toEqual([
      'action.ended', 'character.greeted', 'character.comforted', 'character.kept', 'character.confided', 'character.bluffed',
    ]);
  });

  it('greets a neighbour once and shares that meeting', () => {
    const { world, left, right } = beside();
    Personality.sociability[left] = 1;

    updateActions(world, 0.1);
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    updateActions(world, 0.1);

    expect(readActionOutcome(left)).toEqual({ action: 'greet', result: 'completed' });
    expect(world.relationships.size).toBe(1);
    expect(world.memories.map((memory) => memory.kind)).toEqual(['greeting']);
    expect(world.log.filter((event) => event.type === 'character.greeted')).toHaveLength(1);
    expect(inspectCharacterHistory(world, 'left')).toEqual(inspectCharacterHistory(world, 'right'));
  });

  it('comforts a neighbour in need instead of greeting them', () => {
    const { world, left, right } = beside();
    Personality.empathy[left] = 1;
    Needs.hunger[right] = 0.6;

    updateActions(world, 0.1);
    expect(ACTION_IDS[Action.kind[left]]).toBe('comfort');

    Needs.hunger[right] = 0.2;
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    updateActions(world, 0.1);

    expect(readActionOutcome(left)).toEqual({ action: 'comfort', result: 'completed' });
    expect(world.memories.map((memory) => memory.kind)).toEqual(['comforting']);
  });

  it('keeps company with someone already met', () => {
    const { world, left } = beside();
    Personality.sociability[left] = 1;

    updateActions(world, 0.1);
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    Personality.sociability[left] = 0;
    Personality.loyalty[left] = 1;
    updateActions(world, 0.1);
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[left]]).toBe('keep');

    Needs.hunger[left] = 0.4;
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    updateActions(world, 0.1);

    expect(readActionOutcome(left)).toEqual({ action: 'keep', result: 'completed' });
    expect(world.memories.some((memory) => memory.kind === 'keeping')).toBe(true);
  });

  it('states its own needs, or understates the highest ones', () => {
    const truthful = beside();
    Personality.sociability[truthful.left] = 1;
    updateActions(truthful.world, 0.1);
    Action.elapsed[truthful.left] = MIN_ACTION_SECONDS;
    Personality.sociability[truthful.left] = 0;
    Personality.honesty[truthful.left] = 1;
    Needs.hunger[truthful.left] = 0.2;
    Needs.thirst[truthful.left] = 0.1;
    Needs.fatigue[truthful.left] = 0.05;
    updateActions(truthful.world, 0.1);
    Action.elapsed[truthful.left] = MIN_ACTION_SECONDS;
    updateActions(truthful.world, 0.1);
    Action.elapsed[truthful.left] = MIN_ACTION_SECONDS;
    updateActions(truthful.world, 0.1);

    expect(truthful.world.log.find((event) => event.type === 'character.confided')?.payload.reportedNeeds).toEqual({
      hunger: 0.2,
      thirst: 0.1,
      fatigue: 0.05,
    });

    const dishonest = beside();
    Personality.sociability[dishonest.left] = 1;
    updateActions(dishonest.world, 0.1);
    Action.elapsed[dishonest.left] = MIN_ACTION_SECONDS;
    Personality.sociability[dishonest.left] = 0;
    Personality.honesty[dishonest.left] = 0;
    Needs.hunger[dishonest.left] = 0.2;
    Needs.thirst[dishonest.left] = 0.1;
    Needs.fatigue[dishonest.left] = 0.05;
    updateActions(dishonest.world, 0.1);
    Action.elapsed[dishonest.left] = MIN_ACTION_SECONDS;
    updateActions(dishonest.world, 0.1);
    Action.elapsed[dishonest.left] = MIN_ACTION_SECONDS;
    updateActions(dishonest.world, 0.1);

    expect(dishonest.world.log.find((event) => event.type === 'character.bluffed')?.payload.reportedNeeds).toEqual({
      hunger: 0,
      thirst: 0.1,
      fatigue: 0.05,
    });
    expect(Needs.hunger[dishonest.left]).toBe(0.2);
  });
});

function beside() {
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
    sprite: 'wanderer',
  });

  for (const eid of [left, right]) {
    Needs.hunger[eid] = 0.2;
    Needs.thirst[eid] = 0.2;
    Needs.fatigue[eid] = 0.2;
    Personality.curiosity[eid] = 0.5;
    Personality.industriousness[eid] = 0;
    Personality.sociability[eid] = 0;
    Personality.empathy[eid] = 0;
    Personality.loyalty[eid] = 0;
    Personality.honesty[eid] = 0.5;
    Lifecycle.ageSeconds[eid] = 0;
    Action.elapsed[eid] = 0;
  }

  return { world, left, right };
}
