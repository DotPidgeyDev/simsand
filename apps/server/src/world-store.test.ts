import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PersistedWorld, SimulationLogEvent } from '@simsand/shared';
import { generateCharacterProfile, generateResourceNodes, generateWorldMap, spriteIdFor, startingAgeSeconds, toWorldMapData } from '@simsand/simulation';

import { WorldStore, parsePersistedWorld } from './world-store.js';

function world(tick: number): PersistedWorld {
  const profile = generateCharacterProfile(12345, 'character-0001');

  return {
    version: 25,
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
        action: 'move',
        actionSeconds: 0,
        cooldowns: { idle: 0, move: 0, eat: 0, rest: 0, drink: 0, work: 0, greet: 0, comfort: 0, keep: 0, confide: 0, bluff: 0, give: 0, gather: 0, craft: 0, dine: 0, buy: 0 },
        working: false,
        outcome: null,
        actionTarget: '',
        viewerId: null,
      },
    ],
    relationships: [],
    log: [],
    memories: [],
    inventories: [],
    nodes: [],
    returning: [],
    director: { lastActAt: null, targeted: [], hungrySince: [], cursedHoldings: [] },
  };
}

function logEvent(
  eventId: string,
  tick: number,
  participants: string[],
): SimulationLogEvent {
  return {
    eventId,
    type: 'action.ended',
    tick,
    elapsedSeconds: tick / 10,
    participants,
    location: { x: 1, y: 1 },
    payload: { action: 'eat', result: 'completed', initiator: participants[0] },
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

    const map = generateWorldMap(12345);

    expect(store.loadLatest()).toEqual({
      ...world(10),
      map: toWorldMapData(map),
      nodes: generateResourceNodes(map, 12345),
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

    const loaded = store.loadLatest();

    expect(loaded?.version).toBe(25);
    expect(loaded?.entities).toEqual(saved.entities);
    expect(loaded?.map.tiles[1]).toBe(1);
    expect(loaded?.map.tiles[2]).toBe(2);
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

    expect(loaded?.version).toBe(25);
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

    expect(loaded?.version).toBe(25);
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

    expect(loaded?.version).toBe(25);
    expect(loaded?.entities[0].ageSeconds).toBe(saved.entities[0].ageSeconds);
  });

  it('upgrades a version 16 snapshot with an empty inventory list', () => {
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(db);
    const { inventories: _inventories, ...legacy } = world(10);

    insertRaw(db, 10, JSON.stringify({ ...legacy, version: 16 }));

    expect(store.loadLatest()).toEqual(world(10));
  });

  it('upgrades a version 17 snapshot with a give cooldown of zero', () => {
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(db);
    const saved = world(10);
    const entities = saved.entities.map((entity) => {
      const { give: _give, ...cooldowns } = entity.cooldowns;

      return { ...entity, cooldowns };
    });

    insertRaw(db, 10, JSON.stringify({ ...saved, version: 17, entities }));

    expect(store.loadLatest()).toEqual(saved);
  });

  it('rejects an inventory quantity that is not a positive integer', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(db);

    insertRaw(db, 10, JSON.stringify({
      ...world(10),
      inventories: [{ holderId: 'character-0001', stacks: [{ item: 'goods', quantity: 0 }] }],
    }));

    expect(() => store.loadLatest()).toThrow('No valid world snapshot');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('positive integer'));
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
    db.exec('PRAGMA user_version = 7');

    expect(() => new WorldStore(db)).toThrow('newer than supported');
  });

  it('keeps a log event after the snapshot that contained it is pruned', () => {
    const store = new WorldStore(new DatabaseSync(':memory:'));
    const older = logEvent('log-1', 1, ['left', 'right']);
    const newer = logEvent('log-2', 2, ['left']);

    store.save({ ...world(1), log: [older] });
    store.save({ ...world(2), log: [newer] });
    store.save({ ...world(3), log: [newer] });

    expect(store.eventsForParticipant('left')).toEqual([older, newer]);
    expect(store.eventsForParticipant('right')).toEqual([older]);
    expect(store.eventsForPair('right', 'left')).toEqual([older]);
    expect(store.eventsForPair('left', 'nobody')).toEqual([]);
  });

  it('stores an event that the live log has already dropped', () => {
    const store = new WorldStore(new DatabaseSync(':memory:'));
    const dropped = logEvent('log-1', 1, ['left']);
    const kept = logEvent('log-2', 2, ['left']);

    store.save({ ...world(2), log: [kept] }, [dropped]);

    expect(store.eventsForParticipant('left')).toEqual([dropped, kept]);
  });

  it('stores intervention events, including a bounty that names nobody', () => {
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(db);
    const issuer = { source: 'streamer' as const, id: 'local-streamer' };
    const blessed: SimulationLogEvent = {
      eventId: 'log-1',
      type: 'intervention.blessed',
      tick: 1,
      elapsedSeconds: 0.1,
      participants: ['left'],
      location: { x: 1, y: 1 },
      payload: { commandId: 'cmd-1', issuer, target: 'left' },
    };
    const bounty: SimulationLogEvent = {
      eventId: 'log-2',
      type: 'intervention.bounty',
      tick: 2,
      elapsedSeconds: 0.2,
      participants: [],
      location: { x: 1, y: 0 },
      payload: { commandId: 'cmd-2', issuer, item: 'material', quantity: 3 },
    };

    store.save({ ...world(2), log: [blessed, bounty] });

    expect(store.eventsForParticipant('left')).toEqual([blessed]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM simulation_events').get()).toEqual({ count: 2 });
  });

  it('refuses a saved world whose director memory is malformed', () => {
    const store = new WorldStore(new DatabaseSync(':memory:'));
    const broken = {
      ...world(1),
      director: { lastActAt: null, targeted: [{ characterId: 'a', at: -1 }], hungrySince: [], cursedHoldings: [] },
    };

    expect(() => parsePersistedWorld(JSON.stringify(broken))).toThrow('targeted has an invalid entry');

    store.save(world(2));

    expect(store.loadLatest()?.director).toEqual({ lastActAt: null, targeted: [], hungrySince: [], cursedHoldings: [] });
  });

  it('rejects an intervention event whose payload does not fit its type', () => {
    const store = new WorldStore(new DatabaseSync(':memory:'));
    const issuer = { source: 'streamer' as const, id: 'local-streamer' };
    const base = { tick: 1, elapsedSeconds: 0.1, participants: ['left'], location: { x: 1, y: 1 } };

    expect(() => store.save({
      ...world(1),
      log: [{ ...base, eventId: 'log-1', type: 'intervention.blessed', payload: { commandId: 'cmd-1', issuer, target: 'right' } }],
    })).toThrow('target is not a participant');

    expect(() => store.save({
      ...world(1),
      log: [{
        ...base,
        eventId: 'log-2',
        type: 'intervention.cursed',
        payload: { commandId: 'cmd-2', issuer, target: 'left', need: 'boredom' as 'hunger', level: 0.8 },
      }],
    })).toThrow('unknown need');

    expect(() => store.save({
      ...world(1),
      log: [{ ...logEvent('log-3', 1, []) }],
    })).toThrow('participants are missing');
  });

  it('does not store the same event twice', () => {
    const store = new WorldStore(new DatabaseSync(':memory:'));
    const entry = logEvent('log-4', 4, ['left']);

    store.save({ ...world(4), log: [entry] });
    store.save({ ...world(5), log: [entry] }, [entry]);

    expect(store.eventsForParticipant('left')).toEqual([entry]);
  });

  it('drops the oldest retained events past the retention limit', () => {
    const store = new WorldStore(new DatabaseSync(':memory:'), 2);
    const first = logEvent('log-1', 1, ['left']);
    const second = logEvent('log-2', 2, ['left']);
    const third = logEvent('log-10', 3, ['left']);

    store.save({ ...world(3), log: [first, second, third] });

    expect(store.eventsForParticipant('left').map((entry) => entry.eventId)).toEqual([
      'log-2',
      'log-10',
    ]);
    expect(store.eventsForPair('left', 'right')).toEqual([]);
  });

  it('copies a schema version 1 log into the event tables', () => {
    const db = new DatabaseSync(':memory:');
    const entry = logEvent('log-7', 7, ['left', 'right']);

    db.exec(`
      CREATE TABLE world_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        format_version INTEGER NOT NULL,
        tick INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      PRAGMA user_version = 1;
    `);
    insertRaw(db, 7, JSON.stringify({ ...world(7), log: [entry] }));

    const store = new WorldStore(db);
    const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };

    expect(version).toBe(6);
    expect(store.eventsForParticipant('right')).toEqual([entry]);
    expect(store.loadLatest()?.log).toEqual([entry]);
  });

  it('restores a backup as a separate database', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'simsand-backup-'));
    const store = new WorldStore(new DatabaseSync(':memory:'));
    const entry = logEvent('log-3', 3, ['left']);

    store.save({ ...world(3), log: [entry] });
    await store.backupTo(join(directory, 'backup.sqlite'));

    const restored = WorldStore.open(join(directory, 'backup.sqlite'));

    expect(restored.loadLatest()?.tick).toBe(3);
    expect(restored.eventsForParticipant('left')).toEqual([entry]);

    restored.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('adds the viewers table when opening a schema version 2 database', () => {
    const db = new DatabaseSync(':memory:');

    db.exec(`
      CREATE TABLE world_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        format_version INTEGER NOT NULL,
        tick INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE simulation_events (
        event_id TEXT PRIMARY KEY,
        tick INTEGER NOT NULL,
        sequence INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX simulation_events_order ON simulation_events (tick, sequence);
      CREATE TABLE simulation_event_participants (
        participant_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        PRIMARY KEY (participant_id, event_id)
      );
      CREATE TABLE simulation_event_pairs (
        pair_key TEXT NOT NULL,
        event_id TEXT NOT NULL,
        PRIMARY KEY (pair_key, event_id)
      );
      PRAGMA user_version = 2;
    `);

    const store = new WorldStore(db);
    const viewer = {
      id: 'viewer-1',
      displayName: 'Ada',
      createdAt: '2026-11-23T00:00:00.000Z',
      status: 'active' as const,
    };

    store.createViewer(viewer);

    const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };

    expect(version).toBe(6);
    expect(store.getViewer('viewer-1')).toEqual(viewer);
    expect(store.getViewer('viewer-2')).toBeUndefined();
  });

  it('rejects two characters owned by the same viewer', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = new DatabaseSync(':memory:');
    const store = new WorldStore(db);
    const saved = world(10);
    const first = { ...saved.entities[0], viewerId: 'viewer-1' };
    const second = { ...first, id: 'character-0002' };

    insertRaw(db, 10, JSON.stringify({ ...saved, entities: [first, second] }));

    expect(() => store.loadLatest()).toThrow('No valid world snapshot');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Two characters belong to viewer viewer-1'));
  });

  it('bans a viewer and every linked platform without removing them', () => {
    const store = new WorldStore(new DatabaseSync(':memory:'));
    store.ensureViewerForPlatform(
      'twitch',
      '9001',
      'ada',
      'Ada',
      () => '2026-11-25T00:00:00.000Z',
      () => 'viewer-1',
    );

    const action = store.banViewer('viewer-1', 'spam', 'local-admin', '2026-11-25T01:00:00.000Z');

    expect(action.action).toBe('ban_viewer');
    expect(store.getViewer('viewer-1')?.status).toBe('banned');
    expect(store.getPlatformIdentity('twitch', '9001')?.status).toBe('banned');
    expect(store.listModerationActions()).toEqual([action]);

    store.unbanViewer('viewer-1', 'appeal', 'local-admin', '2026-11-25T02:00:00.000Z');

    expect(store.getViewer('viewer-1')?.status).toBe('active');
    expect(store.getPlatformIdentity('twitch', '9001')?.status).toBe('active');
  });

  it('bans an unknown platform account so a later chat cannot create a new viewer', () => {
    const store = new WorldStore(new DatabaseSync(':memory:'));

    store.banPlatform(
      'twitch',
      '9001',
      'preemptive',
      'local-admin',
      '2026-11-25T00:00:00.000Z',
      'ada',
      () => 'viewer-stub',
    );

    const viewer = store.ensureViewerForPlatform(
      'twitch',
      '9001',
      'ada',
      'Ada',
      () => '2026-11-25T01:00:00.000Z',
      () => 'viewer-new',
    );

    expect(viewer).toEqual({
      id: 'viewer-stub',
      displayName: 'ada',
      createdAt: '2026-11-25T00:00:00.000Z',
      status: 'banned',
    });
  });

  it('maps a platform account to one viewer', () => {
    const store = new WorldStore(new DatabaseSync(':memory:'));
    const first = store.ensureViewerForPlatform(
      'twitch',
      '9001',
      'ada',
      'Ada',
      () => '2026-11-23T00:00:00.000Z',
      () => 'viewer-1',
    );
    const again = store.ensureViewerForPlatform(
      'twitch',
      '9001',
      'adanew',
      'Ada',
      () => '2026-11-23T01:00:00.000Z',
      () => 'viewer-2',
    );

    expect(again).toEqual(first);
    expect(store.getPlatformIdentity('twitch', '9001')?.platformUsername).toBe('adanew');
    expect(store.getViewerByPlatform('twitch', '9001')?.id).toBe('viewer-1');

    const other = store.ensureViewerForPlatform(
      'twitch',
      '9002',
      'bob',
      'Bob',
      () => '2026-11-23T02:00:00.000Z',
      () => 'viewer-3',
    );

    expect(other.id).toBe('viewer-3');
  });

  it('returns a command receipt until the retention window passes', () => {
    const store = new WorldStore(new DatabaseSync(':memory:'), 100, 1_000);
    const issuer = { source: 'viewer' as const, id: 'viewer-1' };
    const result = {
      commandId: 'command-1',
      status: 'applied' as const,
      tick: 4,
      events: [],
    };

    store.putReceipt(issuer, 'create-ada', '{"type":"character.create"}', result, 5_000);

    expect(store.getReceipt(issuer, 'create-ada', 5_500)?.result).toEqual(result);
    expect(store.getReceipt(issuer, 'create-ada', 6_000)).toBeUndefined();
    expect(store.getReceipt({ source: 'viewer', id: 'viewer-2' }, 'create-ada', 5_500)).toBeUndefined();
  });
});
