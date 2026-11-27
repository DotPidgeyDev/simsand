import { describe, expect, it } from 'vitest';
import type { ActionLogEvent, InterventionLogEvent, LifecycleLogEvent } from '@simsand/shared';

import { Needs } from '../components/needs.js';
import { Personality } from '../components/personality.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Action } from '../components/action.js';
import { createWorldMap } from '../core/map.js';
import { createSimulationWorld } from '../core/world.js';
import { createCharacter } from '../entities/create-character.js';
import { MIN_ACTION_SECONDS, updateActions } from '../systems/actions.js';
import { inspectCharacterChronicle } from '../inspection/inspect-character.js';

import { chronicleEntryFromEvent, chronicleFromEvents, chronicleSince } from './chronicle.js';

function event(
  partial: Pick<ActionLogEvent, 'eventId' | 'type' | 'payload'> &
    Partial<Omit<ActionLogEvent, 'eventId' | 'type' | 'payload'>>,
): ActionLogEvent {
  return {
    tick: 4,
    elapsedSeconds: 0.4,
    participants: ['left', 'right'],
    location: { x: 2.5, y: 2.5 },
    ...partial,
  };
}

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
  it('scores consequential meetings and skips ordinary action endings', () => {
    const greet = event({
      eventId: 'log-1',
      type: 'character.greeted',
      payload: { action: 'greet', result: 'completed', initiator: 'left' },
    });
    const comfort = event({
      eventId: 'log-2',
      type: 'character.comforted',
      payload: { action: 'comfort', result: 'completed', initiator: 'left' },
    });
    const trade = event({
      eventId: 'log-3',
      type: 'item.traded',
      payload: {
        action: 'buy',
        result: 'completed',
        initiator: 'left',
        item: 'food',
        quantity: 1,
        price: 2,
      },
    });
    const gift = event({
      eventId: 'log-4',
      type: 'item.transferred',
      payload: {
        action: 'give',
        result: 'completed',
        initiator: 'left',
        item: 'goods',
        quantity: 1,
      },
    });
    const ended = event({
      eventId: 'log-5',
      type: 'action.ended',
      participants: ['left'],
      payload: { action: 'idle', result: 'completed', initiator: 'left' },
    });

    expect(chronicleEntryFromEvent(greet)).toMatchObject({
      tier: 'notable',
      score: 0.35,
      summary: 'left met right',
    });
    expect(chronicleEntryFromEvent(comfort)).toMatchObject({
      tier: 'notable',
      score: 0.45,
      summary: 'left comforted right',
    });
    expect(chronicleEntryFromEvent(trade)).toMatchObject({
      tier: 'significant',
      score: 0.55,
      summary: 'left bought 1 food from right for 2 goods',
    });
    expect(chronicleEntryFromEvent(gift)).toMatchObject({
      tier: 'notable',
      score: 0.5,
      summary: 'left gave 1 goods to right',
    });
    expect(chronicleEntryFromEvent(ended)).toBeUndefined();
    expect(chronicleFromEvents([greet, comfort, trade, gift, ended])).toHaveLength(4);
  });

  it('scores keep, confide, and bluff with the same pair shape', () => {
    expect(chronicleEntryFromEvent(event({
      eventId: 'log-keep',
      type: 'character.kept',
      payload: { action: 'keep', result: 'completed', initiator: 'left' },
    }))).toMatchObject({ summary: 'left stayed with right', tier: 'notable' });

    expect(chronicleEntryFromEvent(event({
      eventId: 'log-confide',
      type: 'character.confided',
      payload: { action: 'confide', result: 'completed', initiator: 'left' },
    }))).toMatchObject({ summary: 'left confided in right', tier: 'significant' });

    expect(chronicleEntryFromEvent(event({
      eventId: 'log-bluff',
      type: 'character.bluffed',
      payload: { action: 'bluff', result: 'completed', initiator: 'left' },
    }))).toMatchObject({ summary: 'left bluffed right', tier: 'notable' });
  });

  it('makes blessings and curses dramatic and bounties and gifts significant', () => {
    const cause = { commandId: 'cmd-1', issuer: { source: 'streamer' as const, id: 'local-streamer' } };
    const base = { tick: 4, elapsedSeconds: 0.4, participants: ['left'], location: { x: 2.5, y: 2.5 } };
    const events: InterventionLogEvent[] = [
      { ...base, eventId: 'log-1', type: 'intervention.blessed', payload: { ...cause, target: 'left' } },
      { ...base, eventId: 'log-2', type: 'intervention.cursed', payload: { ...cause, target: 'left', need: 'thirst', level: 0.8 } },
      {
        ...base,
        eventId: 'log-3',
        type: 'intervention.bounty',
        participants: [],
        location: { x: 6.5, y: 3.5 },
        payload: { ...cause, item: 'material', quantity: 3 },
      },
      { ...base, eventId: 'log-4', type: 'intervention.gifted', payload: { ...cause, target: 'left', item: 'food', quantity: 2 } },
    ];

    expect(chronicleFromEvents(events).map(({ tier, summary }) => ({ tier, summary }))).toEqual([
      { tier: 'dramatic', summary: 'left was blessed' },
      { tier: 'dramatic', summary: 'left was cursed with thirst' },
      { tier: 'significant', summary: 'A bounty of 3 material appeared at (6, 3)' },
      { tier: 'significant', summary: 'left received 2 food' },
    ]);
    expect(chronicleEntryFromEvent(events[2]!)?.location).toEqual({ x: 6.5, y: 3.5 });
  });

  it('makes a death dramatic and names the cause', () => {
    const died: LifecycleLogEvent = {
      eventId: 'log-1',
      type: 'character.died',
      tick: 4,
      elapsedSeconds: 0.4,
      participants: ['left'],
      location: { x: 2.5, y: 2.5 },
      payload: { cause: 'old_age', ageSeconds: 21_600 },
    };

    expect(chronicleEntryFromEvent(died)).toMatchObject({
      tier: 'dramatic',
      score: 0.9,
      summary: 'left died of old age',
      location: { x: 2.5, y: 2.5 },
    });
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
        location: world.log[0]!.location,
        score: 0.35,
        tier: 'notable',
        summary: 'left met right',
      },
    ]);
    expect(inspectCharacterChronicle(world, 'right')).toEqual(chronicle);
    expect(inspectCharacterChronicle(world, 'nobody')).toBeUndefined();
  });

  it('scores only the events written since the previous cursor', () => {
    const { world, left, right } = neighbours();
    const start = world.nextLogId;

    updateActions(world, 0.1);
    Action.elapsed[left] = MIN_ACTION_SECONDS;
    Action.elapsed[right] = MIN_ACTION_SECONDS;
    updateActions(world, 0.1);

    const first = chronicleSince(world, start);

    expect(first.entries.map((entry) => entry.summary)).toEqual(['left met right']);
    expect(first.cursor).toBe(world.nextLogId);
    expect(chronicleSince(world, first.cursor).entries).toEqual([]);
  });
});
