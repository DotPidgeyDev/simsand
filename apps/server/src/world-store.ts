import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';

import { ACTION_IDS, ACTION_OUTCOMES, ITEM_IDS, PERSISTED_WORLD_VERSION, SIMULATION_LOG_TYPES } from '@simsand/shared';
import type { PileReturn, ResourceNode, SimulationLogEvent } from '@simsand/shared';
import type { PersistedEntity, PersistedWorld, WorldMapData } from '@simsand/shared';
import { assertCharacterProfile, assertSpriteId, fromWorldMapData, upgradePersistedWorld } from '@simsand/simulation';
import type { UpgradeableWorld } from '@simsand/simulation';

import { log } from './logger.js';

const SCHEMA_VERSION = 2;

export const DEFAULT_LOG_RETENTION = 100_000;

// A failed or corrupt write must never leave the store without a valid
// snapshot, so older snapshots are kept until newer ones are committed.
const SNAPSHOTS_TO_KEEP = 2;

export class WorldStore {
  private insertEventStatement: ReturnType<DatabaseSync['prepare']> | undefined;

  private insertParticipantStatement: ReturnType<DatabaseSync['prepare']> | undefined;

  private insertPairStatement: ReturnType<DatabaseSync['prepare']> | undefined;

  constructor(
    private readonly db: DatabaseSync,
    private readonly eventRetention = DEFAULT_LOG_RETENTION,
  ) {
    if (!Number.isInteger(eventRetention) || eventRetention < 1) {
      throw new Error('Event retention must be a positive integer');
    }

    this.db.exec('PRAGMA journal_mode = WAL');
    this.migrate();
  }

  static open(path: string, eventRetention = DEFAULT_LOG_RETENTION): WorldStore {
    mkdirSync(dirname(path), { recursive: true });
    return new WorldStore(new DatabaseSync(path), eventRetention);
  }

  save(world: PersistedWorld, pendingEvents: readonly SimulationLogEvent[] = []): void {
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

      this.recordEvents([...pendingEvents, ...world.log]);

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  eventsForParticipant(id: string): SimulationLogEvent[] {
    const rows = this.db
      .prepare(`
        SELECT e.payload
        FROM simulation_events e
        INNER JOIN simulation_event_participants p ON p.event_id = e.event_id
        WHERE p.participant_id = ?
        ORDER BY e.tick, e.sequence
      `)
      .all(id) as { payload: string }[];

    return rows.map((row) => parseStoredEvent(row.payload));
  }

  eventsForPair(a: string, b: string): SimulationLogEvent[] {
    const rows = this.db
      .prepare(`
        SELECT e.payload
        FROM simulation_events e
        INNER JOIN simulation_event_pairs p ON p.event_id = e.event_id
        WHERE p.pair_key = ?
        ORDER BY e.tick, e.sequence
      `)
      .all(pairKey(a, b)) as { payload: string }[];

    return rows.map((row) => parseStoredEvent(row.payload));
  }

  // A consistent copy of this database. Restore by stopping the server,
  // replacing the database file with this copy, and deleting any -wal and
  // -shm files beside the original path.
  async backupTo(path: string): Promise<void> {
    mkdirSync(dirname(path), { recursive: true });
    await backup(this.db, path);
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
    const { user_version: current } = this.db
      .prepare('PRAGMA user_version')
      .get() as { user_version: number };

    if (current > SCHEMA_VERSION) {
      throw new Error(`Database schema version ${current} is newer than supported version ${SCHEMA_VERSION}`);
    }

    if (current === SCHEMA_VERSION) {
      this.prepareEventStatements();
      return;
    }

    this.db.exec('BEGIN');

    try {
      if (current < 1) {
        this.db.exec(`
          CREATE TABLE world_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            format_version INTEGER NOT NULL,
            tick INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            payload TEXT NOT NULL
          );
        `);
      }

      this.db.exec(`
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
      `);
      this.prepareEventStatements();
      this.backfillEvents();
      this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private prepareEventStatements(): void {
    this.insertEventStatement = this.db.prepare(`
      INSERT INTO simulation_events (event_id, tick, sequence, payload)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(event_id) DO NOTHING
    `);
    this.insertParticipantStatement = this.db.prepare(`
      INSERT OR IGNORE INTO simulation_event_participants (participant_id, event_id)
      VALUES (?, ?)
    `);
    this.insertPairStatement = this.db.prepare(`
      INSERT OR IGNORE INTO simulation_event_pairs (pair_key, event_id)
      VALUES (?, ?)
    `);
  }

  private backfillEvents(): void {
    const rows = this.db
      .prepare('SELECT id, tick, payload FROM world_snapshots ORDER BY id')
      .all() as { id: number; tick: number; payload: string }[];

    for (const row of rows) {
      try {
        const world = parsePersistedWorld(row.payload);
        this.recordEvents(world.log);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        log.error(`Skipping events in invalid world snapshot ${row.id} (tick ${row.tick}): ${reason}`);
      }
    }
  }

  private recordEvents(events: readonly SimulationLogEvent[]): void {
    const seen = new Set<string>();

    for (const event of events) {
      if (seen.has(event.eventId)) continue;

      seen.add(event.eventId);
      this.insertEvent(event);
    }

    this.pruneEvents();
  }

  private insertEvent(event: SimulationLogEvent): void {
    assertLogEvent(event);

    const inserted = this.insertEventStatement!.run(
      event.eventId,
      event.tick,
      eventSequence(event.eventId),
      JSON.stringify(event),
    );

    if (Number(inserted.changes) !== 1) return;

    const participants = new Set(event.participants);

    for (const participant of participants) {
      this.insertParticipantStatement!.run(participant, event.eventId);
    }

    const ordered = [...participants].sort();

    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        this.insertPairStatement!.run(pairKey(ordered[i], ordered[j]), event.eventId);
      }
    }
  }

  private pruneEvents(): void {
    this.db.prepare(`
      DELETE FROM simulation_event_participants
      WHERE event_id IN (
        SELECT event_id FROM simulation_events
        ORDER BY tick DESC, sequence DESC
        LIMIT -1 OFFSET ?
      )
    `).run(this.eventRetention);

    this.db.prepare(`
      DELETE FROM simulation_event_pairs
      WHERE event_id IN (
        SELECT event_id FROM simulation_events
        ORDER BY tick DESC, sequence DESC
        LIMIT -1 OFFSET ?
      )
    `).run(this.eventRetention);

    this.db.prepare(`
      DELETE FROM simulation_events
      WHERE event_id IN (
        SELECT event_id FROM simulation_events
        ORDER BY tick DESC, sequence DESC
        LIMIT -1 OFFSET ?
      )
    `).run(this.eventRetention);
  }
}

function eventSequence(eventId: string): number {
  const match = /^log-(\d+)$/.exec(eventId);

  return match ? Number(match[1]) : 0;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\t${b}` : `${b}\t${a}`;
}

function assertLogEvent(value: unknown): asserts value is SimulationLogEvent {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Log event is not an object');
  }

  const event = value as SimulationLogEvent;

  if (typeof event.eventId !== 'string' || event.eventId.length === 0) {
    throw new Error('Log event id is missing');
  }

  if (!(SIMULATION_LOG_TYPES as readonly string[]).includes(event.type)) {
    throw new Error(`Unknown log event type: ${String(event.type)}`);
  }

  if (!isFiniteNumber(event.tick) || event.tick < 0 || !Number.isInteger(event.tick)) {
    throw new Error(`Log event ${event.eventId} tick is invalid`);
  }

  if (!isFiniteNumber(event.elapsedSeconds) || event.elapsedSeconds < 0) {
    throw new Error(`Log event ${event.eventId} time is invalid`);
  }

  if (
    !Array.isArray(event.participants)
    || event.participants.length === 0
    || event.participants.some((id) => typeof id !== 'string' || id.length === 0)
  ) {
    throw new Error(`Log event ${event.eventId} participants are missing`);
  }

  if (
    typeof event.location !== 'object'
    || event.location === null
    || !isFiniteNumber(event.location.x)
    || !isFiniteNumber(event.location.y)
  ) {
    throw new Error(`Log event ${event.eventId} location is missing`);
  }

  if (typeof event.payload !== 'object' || event.payload === null) {
    throw new Error(`Log event ${event.eventId} payload is missing`);
  }

  if (!(ACTION_IDS as readonly string[]).includes(event.payload.action)) {
    throw new Error(`Unknown action: ${String(event.payload.action)}`);
  }

  if (!(ACTION_OUTCOMES as readonly string[]).includes(event.payload.result)) {
    throw new Error(`Unknown action result: ${String(event.payload.result)}`);
  }
}

function parseStoredEvent(payload: string): SimulationLogEvent {
  const value: unknown = JSON.parse(payload);

  assertLogEvent(value);
  return value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPersistedEntity(value: unknown, version: number): value is PersistedEntity {
  if (typeof value !== 'object' || value === null) return false;

  const entity = value as Record<string, unknown>;
  const numeric = ['x', 'y', 'velocityX', 'velocityY', 'color'];

  // Versions before 5 stored a numeric sprite. Named sprites start at 5.
  if (version < 5) numeric.push('sprite');

  return (
    typeof entity.id === 'string' &&
    entity.id.length > 0 &&
    numeric.every((key) => isFiniteNumber(entity[key]))
  );
}

export function parsePersistedWorld(payload: string): PersistedWorld {
  const value: unknown = JSON.parse(payload);

  if (typeof value !== 'object' || value === null) {
    throw new Error('Snapshot is not an object');
  }

  const world = value as Record<string, unknown>;

  if (
    typeof world.version !== 'number'
    || !Number.isInteger(world.version)
    || world.version < 1
    || world.version > PERSISTED_WORLD_VERSION
  ) {
    throw new Error(`Unsupported snapshot version: ${String(world.version)}`);
  }

  if (world.version !== 1) {
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

  if (!Array.isArray(world.entities) || !world.entities.every((entity) => isPersistedEntity(entity, Number(world.version)))) {
    throw new Error('Snapshot entities are missing or invalid');
  }

  if (Number(world.version) >= 3) {
    for (const entity of world.entities) {
      assertCharacterProfile(entity);
    }
  }

  if (Number(world.version) >= 4) {
    for (const entity of world.entities as { resting?: unknown }[]) {
      if (typeof entity.resting !== 'boolean') {
        throw new Error('Character resting flag is missing');
      }
    }
  }

  if (Number(world.version) >= 5) {
    for (const entity of world.entities as { sprite?: unknown }[]) {
      assertSpriteId(entity.sprite);
    }
  }

  if (Number(world.version) >= 6) {
    for (const entity of world.entities as { eating?: unknown; drinking?: unknown }[]) {
      if (typeof entity.eating !== 'boolean' || typeof entity.drinking !== 'boolean') {
        throw new Error('Character sustenance flags are missing');
      }
    }
  }

  if (Number(world.version) >= 7) {
    for (const entity of world.entities as { ageSeconds?: unknown }[]) {
      if (!isFiniteNumber(entity.ageSeconds) || entity.ageSeconds < 0) {
        throw new Error('Character age is missing or invalid');
      }
    }
  }

  if (Number(world.version) >= 8) {
    for (const entity of world.entities as { action?: unknown; actionSeconds?: unknown }[]) {
      if (!(ACTION_IDS as readonly string[]).includes(String(entity.action))) {
        throw new Error(`Unknown action: ${String(entity.action)}`);
      }

      if (!isFiniteNumber(entity.actionSeconds) || entity.actionSeconds < 0) {
        throw new Error('Character action time is missing or invalid');
      }
    }
  }

  if (Number(world.version) >= 9) {
    for (const entity of world.entities as { cooldowns?: unknown }[]) {
      if (typeof entity.cooldowns !== 'object' || entity.cooldowns === null) {
        throw new Error('Character cooldowns are missing');
      }

      const cooldowns = entity.cooldowns as Record<string, unknown>;

      for (const id of ACTION_IDS) {
        if (id === 'work' && Number(world.version) < 12) continue;
        if (id === 'greet' && Number(world.version) < 13) continue;
        if (id === 'comfort' && Number(world.version) < 15) continue;
        if ((id === 'keep' || id === 'confide' || id === 'bluff') && Number(world.version) < 16) continue;
        if (id === 'give' && Number(world.version) < 18) continue;
        if (id === 'gather' && Number(world.version) < 19) continue;
        if (id === 'craft' && Number(world.version) < 20) continue;
        if (id === 'dine' && Number(world.version) < 21) continue;
        if (id === 'buy' && Number(world.version) < 22) continue;

        if (!isFiniteNumber(cooldowns[id]) || (cooldowns[id] as number) < 0) {
          throw new Error(`Character cooldown for ${id} is missing or invalid`);
        }
      }
    }
  }

  if (Number(world.version) >= 10) {
    for (const entity of world.entities as { outcome?: unknown }[]) {
      if (entity.outcome === null) continue;

      if (typeof entity.outcome !== 'object' || entity.outcome === undefined) {
        throw new Error('Character outcome is missing');
      }

      const outcome = entity.outcome as { action?: unknown; result?: unknown };

      if (!(ACTION_IDS as readonly string[]).includes(String(outcome.action))) {
        throw new Error(`Unknown action outcome: ${String(outcome.action)}`);
      }

      if (!(ACTION_OUTCOMES as readonly string[]).includes(String(outcome.result))) {
        throw new Error(`Unknown action result: ${String(outcome.result)}`);
      }
    }
  }

  if (Number(world.version) >= 12) {
    for (const entity of world.entities as { working?: unknown }[]) {
      if (typeof entity.working !== 'boolean') {
        throw new Error('Character working flag is missing');
      }
    }
  }

  if (Number(world.version) >= 13) {
    for (const entity of world.entities as { actionTarget?: unknown }[]) {
      if (typeof entity.actionTarget !== 'string') {
        throw new Error('Character action target is missing');
      }
    }

    if (!Array.isArray(world.relationships) || !Array.isArray(world.log)) {
      throw new Error('World relationships or log are missing');
    }
  }

  if (Number(world.version) >= 14 && !Array.isArray(world.memories)) {
    throw new Error('World memories are missing');
  }

  if (Number(world.version) >= 17) {
    if (!Array.isArray(world.inventories)) {
      throw new Error('World inventories are missing');
    }

    const holders = new Set<string>();

    for (const record of world.inventories as { holderId?: unknown; stacks?: unknown }[]) {
      if (typeof record.holderId !== 'string' || record.holderId.length === 0) {
        throw new Error('Inventory holder is missing');
      }

      if (holders.has(record.holderId)) {
        throw new Error(`Duplicate inventory for ${record.holderId}`);
      }

      holders.add(record.holderId);

      if (!Array.isArray(record.stacks)) {
        throw new Error('Inventory stacks are missing');
      }

      const items = new Set<string>();

      for (const stack of record.stacks as { item?: unknown; quantity?: unknown }[]) {
        if (!(ITEM_IDS as readonly string[]).includes(String(stack.item))) {
          throw new Error(`Unknown item: ${String(stack.item)}`);
        }

        if (items.has(String(stack.item))) {
          throw new Error(`Duplicate stack of ${String(stack.item)}`);
        }

        items.add(String(stack.item));

        if (!Number.isInteger(stack.quantity) || Number(stack.quantity) < 1) {
          throw new Error('Item quantity must be a positive integer');
        }
      }
    }
  }

  if (Number(world.version) >= 19) {
    if (!Array.isArray(world.nodes)) {
      throw new Error('World nodes are missing');
    }

    const map = world.map as WorldMapData;
    const tiles = new Set<string>();

    for (const node of world.nodes as ResourceNode[]) {
      if (
        !Number.isInteger(node.x)
        || !Number.isInteger(node.y)
        || node.x < 0
        || node.y < 0
        || node.x >= map.width
        || node.y >= map.height
      ) {
        throw new Error('Resource node is outside the map');
      }

      const tile = `${node.x},${node.y}`;

      if (tiles.has(tile)) {
        throw new Error(`Duplicate resource node at ${tile}`);
      }

      tiles.add(tile);

      if (!(ITEM_IDS as readonly string[]).includes(node.item)) {
        throw new Error(`Unknown item: ${String(node.item)}`);
      }

      if (!Number.isInteger(node.quantity) || node.quantity < 1) {
        throw new Error('Item quantity must be a positive integer');
      }
    }
  }

  if (Number(world.version) >= 23) {
    if (!Array.isArray(world.returning)) {
      throw new Error('World pile returns are missing');
    }

    const map = world.map as WorldMapData;
    const waiting = new Set<string>();
    const occupied = new Set(
      ((world.nodes ?? []) as ResourceNode[]).map((node) => `${node.x},${node.y}`),
    );

    for (const entry of world.returning as PileReturn[]) {
      if (
        !Number.isInteger(entry.x)
        || !Number.isInteger(entry.y)
        || entry.x < 0
        || entry.y < 0
        || entry.x >= map.width
        || entry.y >= map.height
      ) {
        throw new Error('Returning pile is outside the map');
      }

      const tile = `${entry.x},${entry.y}`;

      if (waiting.has(tile)) {
        throw new Error(`Duplicate returning pile at ${tile}`);
      }

      waiting.add(tile);

      if (occupied.has(tile)) {
        throw new Error(`Pile at ${tile} is waiting to return while it is still here`);
      }

      if (!Number.isFinite(entry.renewsAt) || entry.renewsAt < 0) {
        throw new Error('Pile return time must be zero or later');
      }
    }
  }

  const ids = new Set(world.entities.map((entity) => entity.id));

  if (ids.size !== world.entities.length) {
    throw new Error('Snapshot contains duplicate entity IDs');
  }

  return upgradePersistedWorld(world as unknown as UpgradeableWorld);
}
