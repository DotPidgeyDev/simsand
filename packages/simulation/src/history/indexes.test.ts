import { describe, expect, it } from 'vitest';

import { createSimulationClock } from '../core/clock.js';
import { createWorldMap } from '../core/map.js';
import { capturePersistedWorld, restorePersistedWorld } from '../core/persistence.js';
import { createSimulationWorld } from '../core/world.js';
import { createCharacter } from '../entities/create-character.js';
import { acknowledgePendingLog } from '../history/records.js';
import { LOG_LIMIT, historyFor, historyForPair, recordActionEnding, recordGreeting } from '../log/events.js';
import { memoriesFor } from '../social/memories.js';
import { relationshipsFor, rememberMeeting } from '../social/relationships.js';

function worldWith(id: string) {
  const world = createSimulationWorld(createWorldMap(8, 8, 'grass'));
  const eid = createCharacter(world, {
    id,
    x: 1.5,
    y: 1.5,
    velocityX: 0,
    velocityY: 0,
    color: 0xffffff,
    sprite: 'wanderer',
  });

  return { world, eid };
}

describe('history indexes', () => {
  it('reads a character and a pair without the other characters events', () => {
    const { world, eid } = worldWith('left');
    const right = createCharacter(world, {
      id: 'right',
      x: 2.5,
      y: 1.5,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    recordActionEnding(world, eid, 'left', 'eat', 'completed');
    recordActionEnding(world, eid, 'left', 'greet', 'failed', 'right');
    recordActionEnding(world, right, 'right', 'rest', 'completed');

    expect(historyFor(world, 'left').map((event) => event.payload)).toEqual([
      { action: 'eat', result: 'completed', initiator: 'left' },
      { action: 'greet', result: 'failed', initiator: 'left' },
    ]);
    expect(historyFor(world, 'right')).toMatchObject([
      { payload: { action: 'greet' } },
      { payload: { action: 'rest' } },
    ]);
    expect(historyForPair(world, 'right', 'left')).toMatchObject([{ payload: { action: 'greet' } }]);
    expect(historyFor(world, 'absent')).toEqual([]);
  });

  it('keeps one memory and one relationship for the pair', () => {
    const { world, eid } = worldWith('left');
    createCharacter(world, {
      id: 'right',
      x: 2.5,
      y: 1.5,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    recordGreeting(world, eid, 'left', 'right');
    world.tick += 1;
    recordGreeting(world, eid, 'left', 'right');

    expect(memoriesFor(world, 'left')).toHaveLength(1);
    expect(memoriesFor(world, 'right')).toEqual(memoriesFor(world, 'left'));
    expect(memoriesFor(world, 'other')).toEqual([]);
    expect(relationshipsFor(world, 'left')).toEqual([
      expect.objectContaining({ otherId: 'right', meetings: 2 }),
    ]);
    expect(relationshipsFor(world, 'right')).toEqual([
      expect.objectContaining({ otherId: 'left', meetings: 2 }),
    ]);

    for (let i = 0; i < 20; i++) {
      rememberMeeting(world, `n${i}`, `m${i}`, `log-extra-${i}`, i);
    }

    expect(relationshipsFor(world, 'left')).toHaveLength(1);
  });

  it('drops the oldest event from the indexes when the log reaches its cap', () => {
    const { world, eid } = worldWith('left');
    const right = createCharacter(world, {
      id: 'right',
      x: 2.5,
      y: 1.5,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    recordActionEnding(world, eid, 'left', 'greet', 'failed', 'right');
    const oldest = world.log[0]!.eventId;

    for (let i = 0; i < LOG_LIMIT; i++) {
      recordActionEnding(world, eid, 'left', 'eat', 'completed');
    }

    expect(world.log).toHaveLength(LOG_LIMIT);
    expect(world.log.some((event) => event.eventId === oldest)).toBe(false);
    expect(historyFor(world, 'left')).toHaveLength(LOG_LIMIT);
    expect(historyFor(world, 'left').some((event) => event.eventId === oldest)).toBe(false);
    expect(historyForPair(world, 'left', 'right')).toEqual([]);
    expect(historyFor(world, 'right')).toEqual([]);
    expect(world.pendingLog.map((event) => event.eventId)).toEqual([oldest]);

    acknowledgePendingLog(world, [oldest]);

    expect(world.pendingLog).toEqual([]);
  });

  it('rebuilds the indexes when a save is restored', () => {
    const { world, eid } = worldWith('left');
    createCharacter(world, {
      id: 'right',
      x: 2.5,
      y: 1.5,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'wanderer',
    });
    recordGreeting(world, eid, 'left', 'right');
    recordActionEnding(world, eid, 'left', 'eat', 'interrupted');

    const saved = capturePersistedWorld(world, createSimulationClock(), world.seed);
    const { world: restored } = restorePersistedWorld(saved);

    expect(historyFor(restored, 'left').map((event) => event.type)).toEqual(
      historyFor(world, 'left').map((event) => event.type),
    );
    expect(historyForPair(restored, 'left', 'right')).toHaveLength(1);
    expect(memoriesFor(restored, 'right').map((memory) => memory.kind)).toEqual(['greeting']);
    expect(relationshipsFor(restored, 'right')[0]?.otherId).toBe('left');
    expect(restored.memoryByPairKind.size).toBe(1);
  });
});
