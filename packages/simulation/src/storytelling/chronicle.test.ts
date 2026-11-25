import { describe, expect, it } from 'vitest';

import { Needs } from '../components/needs.js';
import { Personality } from '../components/personality.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Action } from '../components/action.js';
import { createWorldMap } from '../core/map.js';
import { createSimulationWorld } from '../core/world.js';
import { createCharacter } from '../entities/create-character.js';
import { MIN_ACTION_SECONDS, updateActions } from '../systems/actions.js';
import { inspectCharacterChronicle } from '../inspection/inspect-character.js';

import { chronicleEntryFromEvent, chronicleFromEvents } from './chronicle.js';

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
    Personality.loyalty[eid] = 0;
    Personality.honesty[eid] = 0.5;
    Personality.empathy[eid] = 0;
    Lifecycle.ageSeconds[eid] = 0;
    Action.elapsed[eid] = 0;
  }

  return { world, left, right };
}

describe('chronicle', () => {
  it('scores a completed greeting and skips ordinary action endings', () => {
    const greet = {
      eventId: 'log-1',
      type: 'character.greeted' as const,
      tick: 4,
      elapsedSeconds: 0.4,
      participants: ['left', 'right'],
      location: { x: 2.5, y: 2.5 },
      payload: { action: 'greet' as const, result: 'completed' as const, initiator: 'left' },
    };
    const ended = {
      eventId: 'log-2',
      type: 'action.ended' as const,
      tick: 5,
      elapsedSeconds: 0.5,
      participants: ['left'],
      location: { x: 2.5, y: 2.5 },
      payload: { action: 'idle' as const, result: 'completed' as const, initiator: 'left' },
    };

    expect(chronicleEntryFromEvent(greet)).toEqual({
      eventId: 'log-1',
      type: 'character.greeted',
      tick: 4,
      elapsedSeconds: 0.4,
      participants: ['left', 'right'],
      score: 0.35,
      tier: 'notable',
      summary: 'left met right',
    });
    expect(chronicleEntryFromEvent(ended)).toBeUndefined();
    expect(chronicleFromEvents([greet, ended])).toHaveLength(1);
  });

  it('exposes a character chronicle from the live log without changing actions', () => {
    const { world, left, right } = neighbours();

    updateActions(world, 0.1);
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    Action.elapsed[right] = MIN_ACTION_SECONDS;
    updateActions(world, 0.1);

    const chronicle = inspectCharacterChronicle(world, 'left');

    expect(chronicle).toEqual([
      {
        eventId: world.log[0]!.eventId,
        type: 'character.greeted',
        tick: 0,
        elapsedSeconds: 0,
        participants: ['left', 'right'],
        score: 0.35,
        tier: 'notable',
        summary: 'left met right',
      },
    ]);
    expect(inspectCharacterChronicle(world, 'right')).toEqual(chronicle);
    expect(inspectCharacterChronicle(world, 'nobody')).toBeUndefined();
  });
});
