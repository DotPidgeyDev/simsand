import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PersistedWorld } from '@simsand/shared';
import { generateCharacterProfile, generateWorldMap, spriteIdFor, startingAgeSeconds, toWorldMapData } from '@simsand/simulation';

import { WorldStore } from './world-store.js';

function world(tick: number): PersistedWorld {
  const profile = generateCharacterProfile(12345, 'character-0001');

  return {
    version: 7,
    seed: 12345,
    tick,
    elapsedSeconds: tick / 10,
    fixedDeltaSeconds: 0.1,
    map: { width: 2, height: 2, tiles: [0, 1, 2, 0] },
    entities: [
      {
        id: 'character-0001',
        x: 1,
        y: 2,
        velocityX: 0.5,
        velocityY: -0.5,
        color: 3,
        sprite: spriteIdFor(12345, 'character-0001'),
        resting: false,
        eating: false,
        drinking: false,
        ...profile,
        ageSeconds: startingAgeSeconds(12345, 'character-0001', profile.attributes.constitution),
      },
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

  it('upgrades a version 1 snapshot by generating the map from its seed', () => {
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(db);
    const { map: _map, ...withoutMap } = world(10);
    const entities = withoutMap.entities.map((entity) => {
      const { name: _name, attributes: _attributes, personality: _personality, needs: _needs, lifecycle: _lifecycle, ...base } = entity;
      return { ...base, sprite: 1 };
    });

    insertRaw(db, 10, JSON.stringify({ ...withoutMap, version: 1, entities }));

    expect(store.loadLatest()).toEqual({
      ...world(10),
      map: toWorldMapData(generateWorldMap(12345)),
    });
  });

  it('upgrades a version 2 snapshot with a generated character profile', () => {
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(db);
    const saved = world(10);
    const entities = saved.entities.map((entity) => {
      const { name: _name, attributes: _attributes, personality: _personality, needs: _needs, lifecycle: _lifecycle, ...base } = entity;
      return { ...base, sprite: 1 };
    });

    insertRaw(db, 10, JSON.stringify({ ...saved, version: 2, entities }));

    expect(store.loadLatest()).toEqual(saved);
  });

  it('upgrades a version 3 snapshot by deriving resting from fatigue', () => {
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(db);
    const saved = world(10);
    const { resting: _resting, ...awake } = saved.entities[0];

    insertRaw(db, 10, JSON.stringify({
      ...saved,
      version: 3,
      entities: [{ ...awake, sprite: 1, needs: { ...awake.needs, fatigue: 0.9 } }],
    }));

    const loaded = store.loadLatest();

    expect(loaded?.version).toBe(7);
    expect(loaded?.entities[0].eating).toBe(false);
    expect(loaded?.entities[0].drinking).toBe(false);
    expect(loaded?.entities[0].resting).toBe(true);
    expect(loaded?.entities[0].needs.fatigue).toBe(0.9);
    expect(loaded?.entities[0].sprite).toBe(spriteIdFor(12345, 'character-0001'));
  });

  it('upgrades a version 5 snapshot by deriving eating and drinking from needs', () => {
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(db);
    const saved = world(10);
    const { eating: _eating, drinking: _drinking, ...withoutSustenance } = saved.entities[0];

    insertRaw(db, 10, JSON.stringify({
      ...saved,
      version: 5,
      entities: [{ ...withoutSustenance, needs: { ...withoutSustenance.needs, hunger: 0.9 } }],
    }));

    const loaded = store.loadLatest();

    expect(loaded?.version).toBe(7);
    expect(loaded?.entities[0].eating).toBe(true);
    expect(loaded?.entities[0].drinking).toBe(false);
    expect(loaded?.entities[0].needs.hunger).toBe(0.9);
    expect(loaded?.entities[0].ageSeconds).toBe(
      startingAgeSeconds(12345, 'character-0001', saved.entities[0].attributes.constitution),
    );
  });

  it('upgrades a version 6 snapshot with a seeded age', () => {
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(db);
    const saved = world(10);
    const { ageSeconds: _ageSeconds, ...withoutAge } = saved.entities[0];

    insertRaw(db, 10, JSON.stringify({ ...saved, version: 6, entities: [withoutAge] }));

    const loaded = store.loadLatest();

    expect(loaded?.version).toBe(7);
    expect(loaded?.entities[0].ageSeconds).toBe(saved.entities[0].ageSeconds);
  });

  it('rejects a snapshot whose character profile is out of range', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(db);
    const saved = world(10);
    saved.entities[0].attributes.strength = 50;

    insertRaw(db, 10, JSON.stringify(saved));

    expect(() => store.loadLatest()).toThrow('No valid world snapshot');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('attributes are missing or out of range'));
  });

  it('rejects a snapshot whose map does not match its dimensions', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(db);

    insertRaw(db, 10, JSON.stringify({ ...world(10), map: { width: 2, height: 2, tiles: [0] } }));

    expect(() => store.loadLatest()).toThrow('No valid world snapshot');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Map has 1 tiles; expected 4'));
  });

  it('refuses a database created by a newer schema', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA user_version = 2');

    expect(() => new WorldStore(db)).toThrow('newer than supported');
  });
});
