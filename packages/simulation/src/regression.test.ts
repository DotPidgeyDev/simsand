import { describe, expect, it } from 'vitest';

import { ACTION_IDS, ACTION_OUTCOMES, CHRONICLE_PRESENTATION, DIRECTOR_REASONS, ITEM_IDS, LIFECYCLE_STATES, MEMORY_KINDS, PERSONALITY_TRAITS, SIMULATION_LOG_TYPES, TERRAIN_TYPES } from '@simsand/shared';

import { generateCharacterProfile, spriteIdFor, startingAgeSeconds } from './characters/profile.js';
import { Action } from './components/action.js';
import { Attributes } from './components/attributes.js';
import { Condition } from './components/condition.js';
import { Lifecycle } from './components/lifecycle.js';
import { Needs } from './components/needs.js';
import { Personality } from './components/personality.js';
import { Position } from './components/position.js';
import { Velocity } from './components/velocity.js';
import { createSimulationClock } from './core/clock.js';
import { RESOURCE_NODE_STOCK, createWorldMap } from './core/map.js';
import { capturePersistedWorld, restorePersistedWorld, upgradePersistedWorld } from './core/persistence.js';
import { createSimulationRunner, tickSimulation } from './core/runner.js';
import { createSimulationWorld } from './core/world.js';
import type { SimulationWorld } from './core/world.js';
import { executeCommand } from './commands/execute-command.js';
import { updateDirector } from './director/director.js';
import { directorDefaults } from './director/settings.js';
import { createCharacter } from './entities/create-character.js';
import { removeCharacter } from './entities/remove-character.js';
import { FOOD_PRICE } from './economy/inventory.js';
import { PILE_RETURN_SECONDS, nodeAt, nodeKey, renewPiles, takeResource } from './economy/nodes.js';
import { acknowledgePendingLog } from './history/records.js';
import { inspectCharacter, inspectCharacterHistory } from './inspection/inspect-character.js';
import { LOG_LIMIT, recordActionEnding } from './log/events.js';
import { ACTION_COOLDOWN_SECONDS, MIN_ACTION_SECONDS, actionBias, readActionOutcome, updateActions } from './systems/actions.js';
import { HUNGER_GAIN_PER_SECOND, HUNGER_RESUME_AT } from './systems/needs.js';
import { lifespanSeconds, updateLifecycle } from './systems/lifecycle.js';
import { chronicleSince } from './storytelling/chronicle.js';

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
        buy: -0.03429866919759661,
        give: 0.000049177510663867,
        gather: 0.03511252806056291,
        craft: -0.04739880277775228,
        dine: -0.03395909960381687,
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
        buy: 0.034276680345647036,
        give: 0.02370677699800581,
        gather: 0.0003843397134914994,
        craft: -0.012971484987065197,
        dine: 0.001837380067445338,
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

    expect(truthful.world.log.find((event) => event.type === 'character.confided')).toMatchObject({
      payload: { reportedNeeds: { hunger: 0.2, thirst: 0.1, fatigue: 0.05 } },
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

    expect(dishonest.world.log.find((event) => event.type === 'character.bluffed')).toMatchObject({
      payload: { reportedNeeds: { hunger: 0, thirst: 0.1, fatigue: 0.05 } },
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

// Milestone 05 close-out. A depleted pile returns. The free camp visit and
// the free meal stay. Later milestones may append catalogs after these.
describe('milestone 05 behaviour', () => {
  it('keeps the economy catalogs after the social ones', () => {
    expect(ITEM_IDS).toEqual(['goods', 'material', 'food']);
    expect(FOOD_PRICE).toBe(2);
    expect(ACTION_IDS.slice(11)).toEqual(['give', 'gather', 'craft', 'dine', 'buy']);
    expect(MEMORY_KINDS.slice(5)).toEqual(['giving', 'trading']);
    expect(SIMULATION_LOG_TYPES.slice(6, 8)).toEqual(['item.transferred', 'item.traded']);
    expect(PILE_RETURN_SECONDS).toBeGreaterThan(HUNGER_RESUME_AT / HUNGER_GAIN_PER_SECOND);
  });

  it('returns a depleted pile to full stock on the same tile, and not before', () => {
    const map = createWorldMap(4, 4, 'grass');
    const world = createSimulationWorld(map, 1);
    world.nodes.set(nodeKey(map.width, 1, 1), { x: 1, y: 1, item: 'material', quantity: 1 });
    takeResource(world, 1, 1);

    world.elapsedSeconds = PILE_RETURN_SECONDS - 0.1;
    renewPiles(world);
    expect(nodeAt(world, 1, 1)).toBeUndefined();

    world.elapsedSeconds = PILE_RETURN_SECONDS;
    renewPiles(world);
    expect(nodeAt(world, 1, 1)).toEqual({ x: 1, y: 1, item: 'material', quantity: RESOURCE_NODE_STOCK });
  });

  it('still yields goods from an empty-handed camp visit, and still eats with no food', () => {
    const map = createWorldMap(4, 4, 'grass');
    map.tiles[0] = TERRAIN_TYPES.indexOf('camp');
    const world = createSimulationWorld(map);
    const worker = createCharacter(world, {
      id: 'worker',
      x: 0.5,
      y: 0.5,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'wanderer',
    });
    const diner = createCharacter(world, {
      id: 'diner',
      x: 2.5,
      y: 2.5,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    for (const eid of [worker, diner]) {
      Needs.hunger[eid] = 0.2;
      Needs.thirst[eid] = 0.2;
      Needs.fatigue[eid] = 0.2;
      Personality.curiosity[eid] = 0;
      Personality.industriousness[eid] = 0;
      Personality.sociability[eid] = 0;
      Personality.empathy[eid] = 0;
      Personality.loyalty[eid] = 0;
      Personality.honesty[eid] = 0.5;
      Personality.greed[eid] = 0;
      Lifecycle.ageSeconds[eid] = 0;
    }

    Personality.industriousness[worker] = 1;
    Action.kind[worker] = ACTION_IDS.indexOf('work');
    Action.elapsed[worker] = MIN_ACTION_SECONDS;
    Needs.hunger[worker] = 0.6;
    updateActions(world, 0.1);

    expect(readActionOutcome(worker)).toEqual({ action: 'work', result: 'completed' });
    expect(inspectCharacter(world, 'worker')?.inventory).toEqual([{ item: 'goods', quantity: 1 }]);

    Needs.hunger[diner] = 0.9;
    Action.kind[diner] = ACTION_IDS.indexOf('idle');
    Action.elapsed[diner] = 0;
    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[diner]]).toBe('eat');
    expect(inspectCharacter(world, 'diner')?.inventory).toEqual([]);
  });
});

// Milestone 06 close-out. History is one record per fact, read by
// participant. The live log stays capped. Later milestones may append
// catalogs. They must not copy an event onto each character, or drop a
// trimmed event before it has been confirmed.
describe('milestone 06 behaviour', () => {
  it('restores one shared greeting through the history indexes', () => {
    const { world, left } = beside();
    Personality.sociability[left] = 1;

    updateActions(world, 0.1);
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    updateActions(world, 0.1);

    const saved = capturePersistedWorld(world, createSimulationClock(), world.seed);
    const { world: restored } = restorePersistedWorld(saved);

    expect(inspectCharacterHistory(restored, 'left')).toEqual(inspectCharacterHistory(restored, 'right'));
    expect(inspectCharacterHistory(restored, 'left')).toHaveLength(1);
    expect(inspectCharacter(restored, 'left')?.relationships).toEqual([
      expect.objectContaining({ otherId: 'right' }),
    ]);
    expect(inspectCharacter(restored, 'left')?.memories).toEqual(
      inspectCharacter(restored, 'right')?.memories,
    );
    expect(restored.pendingLog).toEqual([]);
  });

  it('holds a dropped log event until that save is confirmed', () => {
    const world = createSimulationWorld(createWorldMap(4, 4, 'grass'));
    const eid = createCharacter(world, {
      id: 'left',
      x: 1.5,
      y: 1.5,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    recordActionEnding(world, eid, 'left', 'eat', 'completed');
    const oldest = world.log[0]!.eventId;

    for (let i = 0; i < LOG_LIMIT; i++) {
      recordActionEnding(world, eid, 'left', 'eat', 'completed');
    }

    const history = inspectCharacterHistory(world, 'left') ?? [];

    expect(history.some((event) => event.eventId === oldest)).toBe(false);
    expect(world.pendingLog.map((event) => event.eventId)).toEqual([oldest]);

    acknowledgePendingLog(world, [oldest]);

    expect(world.pendingLog).toEqual([]);
  });
});

// Milestone 07 close-out. A viewer owns at most one character. Ownership
// survives death and save/restore. The platform user id is not the
// character id. Admin creates stay unowned.
describe('milestone 07 behaviour', () => {
  it('lets one viewer own one character and keeps that ownership across a save', () => {
    const world = createSimulationWorld(createWorldMap(8, 8, 'grass'));
    const clock = createSimulationClock();
    const viewer = { source: 'viewer' as const, id: 'viewer-1' };

    expect(executeCommand(world, clock, {
      commandId: 'cmd-create',
      issuer: viewer,
      submittedAt: 0,
      type: 'character.create',
      params: { characterId: 'ada', x: 2, y: 3 },
    }).status).toBe('applied');

    Lifecycle.state[world.entityIds.get('ada')!] = LIFECYCLE_STATES.indexOf('dead');

    expect(executeCommand(world, clock, {
      commandId: 'cmd-again',
      issuer: viewer,
      submittedAt: 1,
      type: 'character.create',
      params: { characterId: 'bea', x: 4, y: 5 },
    })).toMatchObject({ status: 'rejected', reason: 'viewer_has_character' });

    const saved = capturePersistedWorld(world, clock, world.seed);
    expect(saved.version).toBeGreaterThanOrEqual(24);
    expect(saved.entities[0]?.viewerId).toBe('viewer-1');

    const { world: restored } = restorePersistedWorld(structuredClone(saved));

    expect(restored.characterByViewer.get('viewer-1')).toBe('ada');
    expect(inspectCharacter(restored, 'ada')?.viewerId).toBe('viewer-1');
    expect(upgradePersistedWorld({
      ...saved,
      version: 23 as const,
      entities: saved.entities.map(({ viewerId: _viewerId, ...entity }) => entity),
    }).entities[0]?.viewerId).toBeNull();

    removeCharacter(restored, 'ada');

    expect(executeCommand(restored, clock, {
      commandId: 'cmd-after-remove',
      issuer: viewer,
      submittedAt: 2,
      type: 'character.create',
      params: { characterId: 'bea', x: 4, y: 5 },
    }).status).toBe('applied');
  });

  it('leaves an admin create unowned and refuses a platform-shaped viewer id', () => {
    const world = createSimulationWorld(createWorldMap(8, 8, 'grass'));
    const clock = createSimulationClock();

    expect(executeCommand(world, clock, {
      commandId: 'cmd-admin',
      issuer: { source: 'admin', id: 'local-admin' },
      submittedAt: 0,
      type: 'character.create',
      params: { characterId: 'npc', x: 1, y: 1 },
    }).status).toBe('applied');
    expect(capturePersistedWorld(world, clock, world.seed).entities[0]?.viewerId).toBeNull();

    expect(executeCommand(world, clock, {
      commandId: 'cmd-bad',
      issuer: { source: 'viewer', id: 'twitch:9001' },
      submittedAt: 1,
      type: 'character.create',
      params: { characterId: 'spoof', x: 2, y: 2 },
    })).toMatchObject({ status: 'rejected', reason: 'invalid_issuer' });
  });
});

// Milestone 08 close-out. The chronicle is a scored window over the one
// log, never a second store. Streamers and the director change the world
// only through intervention commands, and each applied one is one log fact
// naming who asked and, for the director, why. Death is recorded once.
describe('milestone 08 behaviour', () => {
  const streamer = { source: 'streamer', id: 'local-streamer' } as const;

  function alone(id = 'solo') {
    const world = createSimulationWorld(createWorldMap(8, 8, 'grass'), 1);
    const clock = createSimulationClock();
    const eid = createCharacter(world, {
      id,
      x: 2.5,
      y: 2.5,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    Needs.hunger[eid] = 0.1;
    Needs.thirst[eid] = 0.1;
    Needs.fatigue[eid] = 0.1;
    Lifecycle.ageSeconds[eid] = 0;

    return { world, clock, eid };
  }

  it('appends the intervention and lifecycle log types and keeps the presentation tiers', () => {
    expect(SIMULATION_LOG_TYPES.slice(8)).toEqual([
      'intervention.blessed', 'intervention.cursed', 'intervention.bounty', 'intervention.gifted',
      'character.died',
    ]);
    expect(DIRECTOR_REASONS).toEqual(['mercy', 'scarcity', 'kindness', 'hubris']);
    expect(CHRONICLE_PRESENTATION).toEqual({ feed: 'notable', notify: 'significant', focus: 'dramatic' });
  });

  it('scores a social fact and a death from the log without writing to it', () => {
    const { world, left, right } = beside();
    Personality.sociability[left] = 1;
    const cursor = world.nextLogId;

    updateActions(world, 0.1);
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    updateActions(world, 0.1);
    recordActionEnding(world, left, 'left', 'eat', 'interrupted');

    Lifecycle.ageSeconds[right] = lifespanSeconds(Attributes.constitution[right]);
    updateLifecycle(world, 0.1);
    updateLifecycle(world, 0.1);

    const logged = world.log.length;
    const { entries } = chronicleSince(world, cursor);

    expect(world.log.length).toBe(logged);
    expect(world.log.filter((event) => event.type === 'character.died')).toHaveLength(1);
    expect(entries.map(({ type, tier }) => ({ type, tier }))).toEqual([
      { type: 'character.greeted', tier: 'notable' },
      { type: 'character.died', tier: 'dramatic' },
    ]);
    expect(entries.every((entry) => world.log.some((event) => event.eventId === entry.eventId))).toBe(true);
  });

  it('applies a streamer intervention as one log fact and refuses a dead target', () => {
    const { world, clock, eid } = alone();
    Needs.fatigue[eid] = 0.9;

    executeCommand(world, clock, {
      commandId: 'cmd-bless',
      issuer: streamer,
      submittedAt: 0,
      type: 'intervention.bless',
      params: { characterId: 'solo' },
    });

    expect(Needs.fatigue[eid]).toBe(0);
    expect(world.log).toMatchObject([
      { type: 'intervention.blessed', participants: ['solo'], payload: { commandId: 'cmd-bless', issuer: streamer } },
    ]);

    Lifecycle.state[eid] = LIFECYCLE_STATES.indexOf('dead');

    expect(executeCommand(world, clock, {
      commandId: 'cmd-curse',
      issuer: streamer,
      submittedAt: 1,
      type: 'intervention.curse',
      params: { characterId: 'solo', need: 'hunger' },
    })).toMatchObject({ status: 'rejected', reason: 'character_dead' });
    expect(world.log).toHaveLength(1);
  });

  it('lets a bounty start a pile site on grass that returns like any other', () => {
    const { world, clock } = alone();
    world.map.tiles[nodeKey(8, 6, 6)] = TERRAIN_TYPES.indexOf('water');
    const bounty = (x: number, y: number) => executeCommand(world, clock, {
      commandId: `cmd-${x}-${y}`,
      issuer: streamer,
      submittedAt: 0,
      type: 'intervention.bounty',
      params: { x, y, quantity: 1 },
    });

    expect(bounty(6, 6)).toMatchObject({ status: 'rejected', reason: 'tile_unavailable' });
    expect(bounty(5, 5).status).toBe('applied');

    takeResource(world, 5, 5);
    const { world: restored } = restorePersistedWorld(capturePersistedWorld(world, clock, world.seed));
    restored.elapsedSeconds = PILE_RETURN_SECONDS;
    renewPiles(restored);

    expect(nodeAt(restored, 5, 5)).toEqual({ x: 5, y: 5, item: 'material', quantity: RESOURCE_NODE_STOCK });
  });

  it('has the director act as system with a reason, and keeps its memory across a save', () => {
    const { world, clock, eid } = alone('hungry');
    Needs.hunger[eid] = 0.9;

    const checkAt = (target: SimulationWorld, seconds: number) => {
      clock.tick = Math.round(seconds / clock.fixedDeltaSeconds);
      clock.elapsedSeconds = seconds;
      target.tick = clock.tick;
      target.elapsedSeconds = seconds;
      updateDirector(target, clock);
    };

    checkAt(world, 0);
    checkAt(world, directorDefaults.mercyAfterSeconds);

    expect(world.log).toMatchObject([{
      type: 'intervention.gifted',
      payload: { issuer: { source: 'system', id: 'world-director' }, reason: 'mercy', target: 'hungry' },
    }]);

    const { world: restored } = restorePersistedWorld(capturePersistedWorld(world, clock, world.seed));
    restored.inventories.delete('hungry');
    checkAt(restored, directorDefaults.mercyAfterSeconds * 2 + 5);

    expect(restored.director.lastActAt).toBe(directorDefaults.mercyAfterSeconds);
    expect(restored.log).toHaveLength(1);
  });
});
