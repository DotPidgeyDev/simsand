import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { PERSISTED_WORLD_VERSION } from '@simsand/shared';
import type { PersistedEntity, PersistedWorld, WorldMapData } from '@simsand/shared';
import { fromWorldMapData, upgradePersistedWorld } from '@simsand/simulation';
import type { PersistedWorldV1 } from '@simsand/simulation';

import { log } from './logger.js';

const SCHEMA_VERSION = 1;

// A failed or corrupt write must never leave the store without a valid
// snapshot, so older snapshots are kept until newer ones are committed.
const SNAPSHOTS_TO_KEEP = 2;

export class WorldStore {
  constructor(private readonly db: DatabaseSync) {
    this.db.exec('PRAGMA journal_mode = WAL');
    this.migrate();
  }

  static open(path: string): WorldStore {
    mkdirSync(dirname(path), { recursive: true });
    return new WorldStore(new DatabaseSync(path));
  }

  save(world: PersistedWorld): void {
    this.db.exec('BEGIN');

    try {
      this.db
        .prepare(`
          INSERT INTO world_snapshots (format_version, tick, created_at, payload)
          VALUES (?, ?, ?, ?)
        `)
        .run(world.version, world.tick, new Date().toISOString(), JSON.stringify(world));

      this.db
        .prepare(`
          DELETE FROM world_snapshots
          WHERE id NOT IN (
            SELECT id FROM world_snapshots ORDER BY id DESC LIMIT ?
          )
        `)
        .run(SNAPSHOTS_TO_KEEP);

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // Returns undefined only when no world has ever been saved. If snapshots
  // exist but none are valid, this throws rather than letting the caller
  // silently replace the world with a new one.
  loadLatest(): PersistedWorld | undefined {
    const rows = this.db
      .prepare('SELECT id, tick, payload FROM world_snapshots ORDER BY id DESC')
      .all() as { id: number; tick: number; payload: string }[];

    for (const row of rows) {
      try {
        return parsePersistedWorld(row.payload);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        log.error(`Skipping invalid world snapshot ${row.id} (tick ${row.tick}): ${reason}`);
      }
    }

    if (rows.length > 0) {
      throw new Error(`No valid world snapshot among ${rows.length} saved snapshots`);
    }

    return undefined;
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    const { user_version: version } = this.db
      .prepare('PRAGMA user_version')
      .get() as { user_version: number };

    if (version > SCHEMA_VERSION) {
      throw new Error(`Database schema version ${version} is newer than supported version ${SCHEMA_VERSION}`);
    }

    if (version < 1) {
      this.db.exec(`
        CREATE TABLE world_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          format_version INTEGER NOT NULL,
          tick INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          payload TEXT NOT NULL
        );
        PRAGMA user_version = 1;
      `);
    }
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPersistedEntity(value: unknown): value is PersistedEntity {
  if (typeof value !== 'object' || value === null) return false;

  const entity = value as Record<string, unknown>;

  return (
    typeof entity.id === 'string' &&
    entity.id.length > 0 &&
    ['x', 'y', 'velocityX', 'velocityY', 'color', 'sprite'].every((key) => isFiniteNumber(entity[key]))
  );
}

export function parsePersistedWorld(payload: string): PersistedWorld {
  const value: unknown = JSON.parse(payload);

  if (typeof value !== 'object' || value === null) {
    throw new Error('Snapshot is not an object');
  }

  const world = value as Record<string, unknown>;

  if (world.version !== 1 && world.version !== PERSISTED_WORLD_VERSION) {
    throw new Error(`Unsupported snapshot version: ${String(world.version)}`);
  }

  if (world.version === PERSISTED_WORLD_VERSION) {
    if (typeof world.map !== 'object' || world.map === null) {
      throw new Error('Snapshot map is missing');
    }

    fromWorldMapData(world.map as WorldMapData);
  }

  for (const key of ['seed', 'tick', 'elapsedSeconds', 'fixedDeltaSeconds']) {
    if (!isFiniteNumber(world[key])) {
      throw new Error(`Snapshot field ${key} is missing or invalid`);
    }
  }

  if (!Array.isArray(world.entities) || !world.entities.every(isPersistedEntity)) {
    throw new Error('Snapshot entities are missing or invalid');
  }

  const ids = new Set(world.entities.map((entity) => entity.id));

  if (ids.size !== world.entities.length) {
    throw new Error('Snapshot contains duplicate entity IDs');
  }

  return upgradePersistedWorld(world as unknown as PersistedWorldV1 | PersistedWorld);
}
