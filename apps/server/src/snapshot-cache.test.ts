import { describe, expect, it } from 'vitest';

import type { EntitySnapshot, WorldSnapshot } from '@simsand/shared';

import { applyDeltaToSnapshot } from './snapshot-cache.js';

const snapshot: WorldSnapshot = {
  tick: 10,
  elapsedSeconds: 1,
  map: { width: 1, height: 1, tiles: [0] },
  entities: [
    { id: 'character-0001', x: 1, y: 2, color: 1, sprite: 'wanderer', resting: false, eating: false, drinking: false },
    { id: 'character-0002', x: 3, y: 4, color: 2, sprite: 'wanderer', resting: false, eating: false, drinking: false },
  ],
};

describe('applyDeltaToSnapshot', () => {
  it('keeps the cached world current for a client that connects later', () => {
    const updated = applyDeltaToSnapshot(snapshot, {
      tick: 12,
      entities: [
        { id: 'character-0001', x: 8, y: 9, color: 1, sprite: 'wanderer', resting: false, eating: false, drinking: false },
      ],
      removed: [],
    });

    expect(updated.tick).toBe(12);
    expect(updated.elapsedSeconds).toBe(1);
    expect(updated.map).toBe(snapshot.map);
    expect(updated.entities).toEqual([
      { id: 'character-0001', x: 8, y: 9, color: 1, sprite: 'wanderer', resting: false, eating: false, drinking: false },
      snapshot.entities[1],
    ]);
  });

  it('adds an entity that was not in the cached snapshot', () => {
    const created: EntitySnapshot = {
      id: 'character-0003',
      x: 5,
      y: 6,
      color: 3,
      sprite: 'wanderer', resting: false, eating: false, drinking: false,
    };

    const updated = applyDeltaToSnapshot(snapshot, {
      tick: 11,
      entities: [created],
      removed: [],
    });

    expect(updated.entities).toEqual([...snapshot.entities, created]);
  });

  it('drops removed entities so later clients do not see them', () => {
    const updated = applyDeltaToSnapshot(snapshot, {
      tick: 11,
      entities: [],
      removed: ['character-0001'],
    });

    expect(updated.entities).toEqual([snapshot.entities[1]]);
  });
});
