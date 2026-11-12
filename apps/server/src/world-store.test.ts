import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PersistedWorld } from '@simsand/shared';

import { WorldStore } from './world-store.js';

function world(tick: number): PersistedWorld {
  return {
    version: 1,
    seed: 12345,
    tick,
    elapsedSeconds: tick / 10,
    fixedDeltaSeconds: 0.1,
    entities: [
      { id: 'character-0001', x: 1, y: 2, velocityX: 0.5, velocityY: -0.5, color: 3, sprite: 1 },
    ],
  };
}

function insertRaw(db: DatabaseSync, tick: number, payload: string) {
  db.prepare(`
    INSERT INTO world_snapshots (format_version, tick, created_at, payload)
    VALUES (1, ?, '2026-11-12T00:00:00.000Z', ?)
  `).run(tick, payload);
}

describe('WorldStore', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns undefined when no world has been saved', () => {
    const store = new WorldStore(new DatabaseSync(':memory:'));

    expect(store.loadLatest()).toBeUndefined();
  });

  it('loads the most recently saved world', () => {
    const store = new WorldStore(new DatabaseSync(':memory:'));

    store.save(world(10));
    store.save(world(20));

    expect(store.loadLatest()).toEqual(world(20));
  });

  it('keeps only the two newest snapshots', () => {
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(db);

    for (const tick of [10, 20, 30, 40]) {
      store.save(world(tick));
    }

    const ticks = db.prepare('SELECT tick FROM world_snapshots ORDER BY id').all();

    expect(ticks).toEqual([{ tick: 30 }, { tick: 40 }]);
  });

  it('falls back to the previous snapshot when the newest is corrupt', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(db);

    store.save(world(10));
    insertRaw(db, 20, '{"version":1,"tick":');

    expect(store.loadLatest()).toEqual(world(10));
  });

  it('throws instead of returning nothing when every snapshot is invalid', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(db);

    insertRaw(db, 10, JSON.stringify({ ...world(10), version: 99 }));
    insertRaw(db, 20, JSON.stringify({ ...world(20), entities: [{ id: '' }] }));

    expect(() => store.loadLatest()).toThrow('No valid world snapshot among 2 saved snapshots');
  });

  it('refuses a database created by a newer schema', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA user_version = 2');

    expect(() => new WorldStore(db)).toThrow('newer than supported');
  });
});
