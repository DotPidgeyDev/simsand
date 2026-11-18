import { describe, expect, it } from 'vitest';

import { ACTION_IDS } from '@simsand/shared';

import { Action } from '../components/action.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';
import { Personality } from '../components/personality.js';
import { Position } from '../components/position.js';
import { createSimulationClock } from '../core/clock.js';
import { createWorldMap } from '../core/map.js';
import { capturePersistedWorld, restorePersistedWorld } from '../core/persistence.js';
import { createSimulationRunner, tickSimulation } from '../core/runner.js';
import { createSimulationWorld } from '../core/world.js';
import { createCharacter } from '../entities/create-character.js';
import { inspectCharacter, inspectCharacterHistory } from '../inspection/inspect-character.js';
import { MIN_ACTION_SECONDS, readActionOutcome, updateActions } from '../systems/actions.js';

function neighbours() {
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
    Personality.sociability[eid] = 1;
    Lifecycle.ageSeconds[eid] = 0;
    Action.elapsed[eid] = 0;
  }

  return { world, left, right };
}

describe('greet', () => {
  it('lets a sociable character greet a neighbour instead of standing', () => {
    const { world, left } = neighbours();

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[left]]).toBe('greet');
    expect(Action.target[left]).toBe('right');
  });

  it('records one relationship and one log event when both greet each other', () => {
    const { world, left, right } = neighbours();

    updateActions(world, 0.1);
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    Action.elapsed[right] = MIN_ACTION_SECONDS;
    updateActions(world, 0.1);

    expect(readActionOutcome(left)).toEqual({ action: 'greet', result: 'completed' });
    expect(world.relationships.size).toBe(1);
    expect([...world.relationships.values()][0]).toMatchObject({
      a: 'left',
      b: 'right',
      meetings: 1,
    });
    expect(world.log.filter((event) => event.type === 'character.greeted')).toHaveLength(1);
    expect(world.log[0]?.participants).toEqual(['left', 'right']);
    expect(inspectCharacter(world, 'left')?.relationships).toEqual([
      {
        otherId: 'right',
        meetings: 1,
        lastEventId: world.log[0]!.eventId,
        lastTick: 0,
      },
    ]);
    expect(inspectCharacterHistory(world, 'left')).toEqual(inspectCharacterHistory(world, 'right'));
    expect(world.memories).toEqual([
      {
        memoryId: 'mem-1',
        kind: 'greeting',
        eventId: world.log[0]!.eventId,
        tick: 0,
        participants: ['left', 'right'],
      },
    ]);
    expect(inspectCharacter(world, 'left')?.memories).toEqual(inspectCharacter(world, 'right')?.memories);
  });

  it('does not add another greeting memory for a later meeting', () => {
    const { world, left, right } = neighbours();
    const runner = createSimulationRunner(world, createSimulationClock());

    tickSimulation(runner);
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    Action.elapsed[right] = MIN_ACTION_SECONDS;
    tickSimulation(runner);
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    Action.elapsed[right] = MIN_ACTION_SECONDS;
    tickSimulation(runner);

    expect([...world.relationships.values()][0]?.meetings).toBe(2);
    expect(world.log.filter((event) => event.type === 'character.greeted')).toHaveLength(2);
    expect(world.memories).toHaveLength(1);
  });

  it('idles when sociable and alone, without recording a failed greet', () => {
    const world = createSimulationWorld(createWorldMap(8, 8, 'grass'));
    const eid = createCharacter(world, {
      id: 'lonely',
      x: 2,
      y: 2,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    Needs.hunger[eid] = 0.2;
    Needs.thirst[eid] = 0.2;
    Needs.fatigue[eid] = 0.2;
    Personality.curiosity[eid] = 0;
    Personality.industriousness[eid] = 0;
    Personality.sociability[eid] = 1;
    Lifecycle.ageSeconds[eid] = 0;
    Action.elapsed[eid] = 0;

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[eid]]).toBe('idle');
    expect(readActionOutcome(eid)).toBeNull();
    expect(world.log).toEqual([]);
  });

  it('fails a greeting already underway when the neighbour leaves', () => {
    const { world, left, right } = neighbours();
    Personality.sociability[right] = 0;

    updateActions(world, 0.1);
    expect(ACTION_IDS[Action.kind[left]]).toBe('greet');

    Position.x[right] = 7.5;
    Position.y[right] = 7.5;
    updateActions(world, 0.1);

    expect(readActionOutcome(left)).toEqual({ action: 'greet', result: 'failed' });
    expect(world.log).toEqual([
      expect.objectContaining({
        type: 'action.ended',
        participants: ['left', 'right'],
        payload: { action: 'greet', result: 'failed', initiator: 'left' },
      }),
    ]);
  });

  it('does not treat a character two tiles away as a neighbour', () => {
    const world = createSimulationWorld(createWorldMap(8, 8, 'grass'));
    const first = createCharacter(world, {
      id: 'first',
      x: 1.5,
      y: 2.5,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'wanderer',
    });
    createCharacter(world, {
      id: 'far',
      x: 1.5,
      y: 4.5,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    Needs.hunger[first] = 0.2;
    Needs.thirst[first] = 0.2;
    Needs.fatigue[first] = 0.2;
    Personality.curiosity[first] = 0;
    Personality.industriousness[first] = 0;
    Personality.sociability[first] = 1;
    Lifecycle.ageSeconds[first] = 0;
    Action.elapsed[first] = 0;

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[first]]).toBe('idle');
  });

  it('restores relationships and history with the world', () => {
    const { world, left, right } = neighbours();

    updateActions(world, 0.1);
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    Action.elapsed[right] = MIN_ACTION_SECONDS;
    updateActions(world, 0.1);

    const persisted = capturePersistedWorld(world, createSimulationClock(), 0);
    const { world: restored } = restorePersistedWorld(structuredClone(persisted));

    expect(restored.relationships.size).toBe(1);
    expect(inspectCharacterHistory(restored, 'left')).toEqual(inspectCharacterHistory(world, 'left'));
    expect(inspectCharacter(restored, 'left')?.relationships[0]?.otherId).toBe('right');
    expect(restored.memories).toEqual(world.memories);
  });

  it('keeps a completed greeting after further ticks', () => {
    const { world, left, right } = neighbours();
    const runner = createSimulationRunner(world, createSimulationClock());

    tickSimulation(runner);
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    Action.elapsed[right] = MIN_ACTION_SECONDS;
    tickSimulation(runner);

    const greetings = world.log.filter((event) => event.type === 'character.greeted');

    expect(greetings).toHaveLength(1);
    expect(greetings[0]?.tick).toBe(1);
  });
});

function beside(needs: { left: number; right: number }) {
  const { world, left, right } = neighbours();

  for (const eid of [left, right]) {
    Personality.sociability[eid] = 0;
    Personality.empathy[eid] = 0;
    Personality.curiosity[eid] = 0.5;
  }

  Needs.hunger[left] = needs.left;
  Needs.hunger[right] = needs.right;
  return { world, left, right };
}

describe('comfort', () => {
  it('comforts a neighbour in need instead of greeting them', () => {
    const { world, left } = beside({ left: 0.2, right: 0.6 });
    Personality.empathy[left] = 1;
    Personality.sociability[left] = 0.5;

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[left]]).toBe('comfort');
    expect(Action.target[left]).toBe('right');
  });

  it('greets a neighbour in need when empathy is the weaker trait', () => {
    const { world, left } = beside({ left: 0.2, right: 0.6 });
    Personality.empathy[left] = 0;
    Personality.sociability[left] = 1;

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[left]]).toBe('greet');
    expect(Action.target[left]).toBe('right');
  });

  it('stands beside the neighbour until that need recovers, then records one comfort', () => {
    const { world, left, right } = beside({ left: 0.2, right: 0.6 });
    Personality.empathy[left] = 1;

    updateActions(world, 0.1);
    expect(ACTION_IDS[Action.kind[left]]).toBe('comfort');

    Action.elapsed[left] = MIN_ACTION_SECONDS;
    updateActions(world, 0.1);
    expect(ACTION_IDS[Action.kind[left]]).toBe('comfort');
    expect(world.log).toEqual([]);

    Needs.hunger[right] = 0.2;
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    updateActions(world, 0.1);

    expect(readActionOutcome(left)).toEqual({ action: 'comfort', result: 'completed' });
    expect([...world.relationships.values()][0]).toMatchObject({
      a: 'left',
      b: 'right',
      meetings: 1,
    });
    expect(world.log.filter((event) => event.type === 'character.comforted')).toEqual([
      expect.objectContaining({
        participants: ['left', 'right'],
        payload: { action: 'comfort', result: 'completed', initiator: 'left' },
      }),
    ]);
    expect(world.memories).toEqual([
      expect.objectContaining({
        kind: 'comforting',
        participants: ['left', 'right'],
        eventId: world.log.find((event) => event.type === 'character.comforted')?.eventId,
      }),
    ]);
  });

  it('does not add another comforting memory for a later visit', () => {
    const { world, left, right } = beside({ left: 0.2, right: 0.6 });
    Personality.empathy[left] = 1;

    const finish = () => {
      Action.elapsed[left] = MIN_ACTION_SECONDS;
      Needs.hunger[right] = 0.2;
      updateActions(world, 0.1);
    };

    updateActions(world, 0.1);
    finish();
    world.tick += 1;
    Needs.hunger[right] = 0.6;
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    updateActions(world, 0.1);
    finish();

    expect([...world.relationships.values()][0]?.meetings).toBe(2);
    expect(world.log.filter((event) => event.type === 'character.comforted')).toHaveLength(2);
    expect(world.memories.filter((memory) => memory.kind === 'comforting')).toHaveLength(1);
  });

  it('records one comfort when each has been comforting the other', () => {
    const { world, left, right } = beside({ left: 0.2, right: 0.6 });
    Personality.empathy[left] = 1;
    Personality.empathy[right] = 1;

    updateActions(world, 0.1);
    Action.kind[right] = ACTION_IDS.indexOf('comfort');
    Action.target[right] = 'left';
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    Action.elapsed[right] = MIN_ACTION_SECONDS;
    Needs.hunger[left] = 0.2;
    Needs.hunger[right] = 0.2;
    updateActions(world, 0.1);

    expect(world.log.filter((event) => event.type === 'character.comforted')).toHaveLength(1);
    expect([...world.relationships.values()][0]?.meetings).toBe(1);
  });

  it('ends the comfort when the actor’s own need rises', () => {
    const { world, left } = beside({ left: 0.2, right: 0.6 });
    Personality.empathy[left] = 1;

    updateActions(world, 0.1);
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    Needs.hunger[left] = 0.4;
    updateActions(world, 0.1);

    expect(readActionOutcome(left)).toEqual({ action: 'comfort', result: 'completed' });
    expect(world.log.filter((event) => event.type === 'character.comforted')).toHaveLength(1);
  });

  it('fails a comfort already underway when the neighbour leaves', () => {
    const { world, left, right } = beside({ left: 0.2, right: 0.6 });
    Personality.empathy[left] = 1;

    updateActions(world, 0.1);
    Position.x[right] = 7.5;
    updateActions(world, 0.1);

    expect(readActionOutcome(left)).toEqual({ action: 'comfort', result: 'failed' });
    expect(world.log).toEqual([
      expect.objectContaining({
        type: 'action.ended',
        participants: ['left', 'right'],
        payload: { action: 'comfort', result: 'failed', initiator: 'left' },
      }),
    ]);
    expect(world.relationships.size).toBe(0);
    expect(world.memories).toEqual([]);
  });

  it('does not record a failed comfort when nobody nearby is in need', () => {
    const { world, left } = beside({ left: 0.2, right: 0.2 });
    Personality.empathy[left] = 1;
    Personality.curiosity[left] = 0;

    updateActions(world, 0.1);

    expect(ACTION_IDS[Action.kind[left]]).toBe('idle');
    expect(world.log).toEqual([]);
  });

  it('comforts the neighbour whose need is higher', () => {
    const { world, left } = beside({ left: 0.2, right: 0.4 });
    Personality.empathy[left] = 1;
    const worse = createCharacter(world, {
      id: 'worse',
      x: 2.5,
      y: 3.5,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    Needs.hunger[worse] = 0.9;
    Needs.thirst[worse] = 0.2;
    Needs.fatigue[worse] = 0.2;
    Personality.curiosity[worse] = 0;
    Personality.industriousness[worse] = 0;
    Personality.sociability[worse] = 0;
    Personality.empathy[worse] = 0;

    updateActions(world, 0.1);

    expect(Action.target[left]).toBe('worse');
  });
});
