import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';

import { ACCOUNT_STATUSES, ACTION_IDS, ACTION_OUTCOMES, BASIC_NEEDS, COMMAND_SOURCES, INTERVENTION_LOG_TYPES, ITEM_IDS, PERSISTED_WORLD_VERSION, PLATFORM_IDS, SIMULATION_LOG_TYPES, VIEWER_ID_PATTERN } from '@simsand/shared';
import type { AccountStatus, CommandIssuer, CommandResult, PileReturn, PlatformId, PlatformIdentityRecord, ResourceNode, SimulationLogEvent } from '@simsand/shared';
import type { PersistedEntity, PersistedWorld, WorldMapData } from '@simsand/shared';
import { assertCharacterProfile, assertSpriteId, fromWorldMapData, upgradePersistedWorld } from '@simsand/simulation';
import type { UpgradeableWorld } from '@simsand/simulation';

import { log } from './logger.js';

const SCHEMA_VERSION = 6;

export interface ViewerRecord {
  id: string;
  displayName: string;
  createdAt: string;
  status: AccountStatus;
}

export type ModerationActionType =
  | 'ban_viewer'
  | 'unban_viewer'
  | 'ban_platform'
  | 'unban_platform';

export interface ModerationAction {
  id: number;
  action: ModerationActionType;
  targetType: 'viewer' | 'platform';
  targetId: string;
  reason: string;
  actor: string;
  createdAt: string;
}

export const DEFAULT_LOG_RETENTION = 100_000;

export const DEFAULT_RECEIPT_RETENTION_MS = 24 * 60 * 60 * 1000;

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
    private readonly receiptRetentionMs = DEFAULT_RECEIPT_RETENTION_MS,
  ) {
    if (!Number.isInteger(eventRetention) || eventRetention < 1) {
      throw new Error('Event retention must be a positive integer');
    }

    if (!Number.isInteger(receiptRetentionMs) || receiptRetentionMs < 1) {
      throw new Error('Command receipt retention must be a positive integer');
    }

    this.db.exec('PRAGMA journal_mode = WAL');
    this.migrate();
  }

  static open(
    path: string,
    eventRetention = DEFAULT_LOG_RETENTION,
    receiptRetentionMs = DEFAULT_RECEIPT_RETENTION_MS,
  ): WorldStore {
    mkdirSync(dirname(path), { recursive: true });
    return new WorldStore(new DatabaseSync(path), eventRetention, receiptRetentionMs);
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

  createViewer(viewer: ViewerRecord): void {
    this.db
      .prepare(`
        INSERT INTO viewers (id, display_name, created_at, status)
        VALUES (?, ?, ?, ?)
      `)
      .run(viewer.id, viewer.displayName, viewer.createdAt, viewer.status);
  }

  getViewerByPlatform(platform: PlatformId, platformUserId: string): ViewerRecord | undefined {
    const identity = this.getPlatformIdentity(platform, platformUserId);

    return identity ? this.getViewer(identity.viewerId) : undefined;
  }

  getPlatformIdentity(platform: PlatformId, platformUserId: string): PlatformIdentityRecord | undefined {
    assertPlatform(platform, platformUserId);

    const row = this.db
      .prepare(`
        SELECT platform, platform_user_id, viewer_id, platform_username, linked_at, status
        FROM platform_identities
        WHERE platform = ? AND platform_user_id = ?
      `)
      .get(platform, platformUserId) as {
        platform: string;
        platform_user_id: string;
        viewer_id: string;
        platform_username: string;
        linked_at: string;
        status: string;
      } | undefined;

    if (!row || !isAccountStatus(row.status)) return undefined;

    return {
      platform: row.platform as PlatformId,
      platformUserId: row.platform_user_id,
      viewerId: row.viewer_id,
      platformUsername: row.platform_username,
      linkedAt: row.linked_at,
      status: row.status,
    };
  }

  // One Twitch account maps to one viewer. A new account creates a new viewer.
  // A banned platform or viewer is returned as-is so callers can refuse them.
  ensureViewerForPlatform(
    platform: PlatformId,
    platformUserId: string,
    platformUsername: string,
    displayName: string,
    now: () => string,
    newViewerId: () => string,
  ): ViewerRecord {
    assertPlatform(platform, platformUserId);

    const existing = this.getPlatformIdentity(platform, platformUserId);

    if (existing) {
      if (existing.status === 'active' && platformUsername !== existing.platformUsername) {
        this.db
          .prepare(`
            UPDATE platform_identities
            SET platform_username = ?
            WHERE platform = ? AND platform_user_id = ?
          `)
          .run(platformUsername, platform, platformUserId);
      }

      const viewer = this.getViewer(existing.viewerId);

      if (!viewer) {
        throw new Error(`Platform identity ${platform}:${platformUserId} points at missing viewer ${existing.viewerId}`);
      }

      return viewer;
    }

    const viewer: ViewerRecord = {
      id: newViewerId(),
      displayName,
      createdAt: now(),
      status: 'active',
    };

    this.db.exec('BEGIN');

    try {
      this.createViewer(viewer);
      this.db
        .prepare(`
          INSERT INTO platform_identities (
            platform, platform_user_id, viewer_id, platform_username, linked_at, status
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(platform, platformUserId, viewer.id, platformUsername, viewer.createdAt, 'active');
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return viewer;
  }

  getViewer(id: string): ViewerRecord | undefined {
    const row = this.db
      .prepare(`
        SELECT id, display_name, created_at, status
        FROM viewers
        WHERE id = ?
      `)
      .get(id) as { id: string; display_name: string; created_at: string; status: string } | undefined;

    if (!row || !isAccountStatus(row.status)) return undefined;

    return {
      id: row.id,
      displayName: row.display_name,
      createdAt: row.created_at,
      status: row.status,
    };
  }

  // Bans the viewer and every linked platform account. The in-world character
  // is left alone. History stays. Commands from this viewer are refused.
  banViewer(viewerId: string, reason: string, actor: string, at: string): ModerationAction {
    const viewer = this.getViewer(viewerId);

    if (!viewer) {
      throw new Error(`No viewer with id ${viewerId}`);
    }

    this.db.exec('BEGIN');

    try {
      this.db.prepare(`UPDATE viewers SET status = 'banned' WHERE id = ?`).run(viewerId);
      this.db
        .prepare(`UPDATE platform_identities SET status = 'banned' WHERE viewer_id = ?`)
        .run(viewerId);
      const action = this.insertModerationAction('ban_viewer', 'viewer', viewerId, reason, actor, at);
      this.db.exec('COMMIT');
      return action;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  unbanViewer(viewerId: string, reason: string, actor: string, at: string): ModerationAction {
    const viewer = this.getViewer(viewerId);

    if (!viewer) {
      throw new Error(`No viewer with id ${viewerId}`);
    }

    this.db.exec('BEGIN');

    try {
      this.db.prepare(`UPDATE viewers SET status = 'active' WHERE id = ?`).run(viewerId);
      this.db
        .prepare(`UPDATE platform_identities SET status = 'active' WHERE viewer_id = ?`)
        .run(viewerId);
      const action = this.insertModerationAction('unban_viewer', 'viewer', viewerId, reason, actor, at);
      this.db.exec('COMMIT');
      return action;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // Bans the platform account and its linked viewer. An unknown platform
  // account gets a stub banned viewer so a later chat cannot create a new one.
  banPlatform(
    platform: PlatformId,
    platformUserId: string,
    reason: string,
    actor: string,
    at: string,
    platformUsername = platformUserId,
    newViewerId: () => string = () => {
      throw new Error('newViewerId is required when banning an unknown platform account');
    },
  ): ModerationAction {
    assertPlatform(platform, platformUserId);
    const targetId = platformTargetId(platform, platformUserId);
    const existing = this.getPlatformIdentity(platform, platformUserId);

    this.db.exec('BEGIN');

    try {
      if (existing) {
        this.db
          .prepare(`UPDATE platform_identities SET status = 'banned' WHERE platform = ? AND platform_user_id = ?`)
          .run(platform, platformUserId);
        this.db.prepare(`UPDATE viewers SET status = 'banned' WHERE id = ?`).run(existing.viewerId);
      } else {
        const viewer: ViewerRecord = {
          id: newViewerId(),
          displayName: platformUsername,
          createdAt: at,
          status: 'banned',
        };
        this.createViewer(viewer);
        this.db
          .prepare(`
            INSERT INTO platform_identities (
              platform, platform_user_id, viewer_id, platform_username, linked_at, status
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .run(platform, platformUserId, viewer.id, platformUsername, at, 'banned');
      }

      const action = this.insertModerationAction('ban_platform', 'platform', targetId, reason, actor, at);
      this.db.exec('COMMIT');
      return action;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  unbanPlatform(
    platform: PlatformId,
    platformUserId: string,
    reason: string,
    actor: string,
    at: string,
  ): ModerationAction {
    assertPlatform(platform, platformUserId);
    const identity = this.getPlatformIdentity(platform, platformUserId);

    if (!identity) {
      throw new Error(`No platform identity ${platform}:${platformUserId}`);
    }

    this.db.exec('BEGIN');

    try {
      this.db
        .prepare(`UPDATE platform_identities SET status = 'active' WHERE platform = ? AND platform_user_id = ?`)
        .run(platform, platformUserId);
      this.db.prepare(`UPDATE viewers SET status = 'active' WHERE id = ?`).run(identity.viewerId);
      const action = this.insertModerationAction(
        'unban_platform',
        'platform',
        platformTargetId(platform, platformUserId),
        reason,
        actor,
        at,
      );
      this.db.exec('COMMIT');
      return action;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  listModerationActions(limit = 100): ModerationAction[] {
    const rows = this.db
      .prepare(`
        SELECT id, action, target_type, target_id, reason, actor, created_at
        FROM moderation_actions
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        id: number;
        action: string;
        target_type: string;
        target_id: string;
        reason: string;
        actor: string;
        created_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      action: row.action as ModerationActionType,
      targetType: row.target_type as 'viewer' | 'platform',
      targetId: row.target_id,
      reason: row.reason,
      actor: row.actor,
      createdAt: row.created_at,
    }));
  }

  private insertModerationAction(
    action: ModerationActionType,
    targetType: 'viewer' | 'platform',
    targetId: string,
    reason: string,
    actor: string,
    createdAt: string,
  ): ModerationAction {
    const result = this.db
      .prepare(`
        INSERT INTO moderation_actions (action, target_type, target_id, reason, actor, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(action, targetType, targetId, reason, actor, createdAt);

    return {
      id: Number(result.lastInsertRowid),
      action,
      targetType,
      targetId,
      reason,
      actor,
      createdAt,
    };
  }

  getReceipt(issuer: CommandIssuer, key: string, now: number): { fingerprint: string; result: CommandResult } | undefined {
    const row = this.db
      .prepare(`
        SELECT fingerprint, result, submitted_at
        FROM command_receipts
        WHERE issuer_source = ? AND issuer_id = ? AND idempotency_key = ?
      `)
      .get(issuer.source, issuer.id, key) as { fingerprint: string; result: string; submitted_at: number } | undefined;

    if (!row) return undefined;

    if (now - row.submitted_at >= this.receiptRetentionMs) {
      this.db
        .prepare(`
          DELETE FROM command_receipts
          WHERE issuer_source = ? AND issuer_id = ? AND idempotency_key = ?
        `)
        .run(issuer.source, issuer.id, key);
      return undefined;
    }

    return { fingerprint: row.fingerprint, result: parseCommandResult(row.result) };
  }

  putReceipt(
    issuer: CommandIssuer,
    key: string,
    fingerprint: string,
    result: CommandResult,
    now: number,
  ): void {
    this.db
      .prepare(`
        INSERT INTO command_receipts (
          issuer_source, issuer_id, idempotency_key, fingerprint, result, submitted_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(issuer.source, issuer.id, key, fingerprint, JSON.stringify(result), now);

    this.db
      .prepare('DELETE FROM command_receipts WHERE submitted_at <= ?')
      .run(now - this.receiptRetentionMs);
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

      if (current < 2) {
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
      } else {
        this.prepareEventStatements();
      }

      if (current < 3) {
        this.db.exec(`
          CREATE TABLE viewers (
            id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            status TEXT NOT NULL
          );
        `);
      }

      if (current < 4) {
        this.db.exec(`
          CREATE TABLE command_receipts (
            issuer_source TEXT NOT NULL,
            issuer_id TEXT NOT NULL,
            idempotency_key TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            result TEXT NOT NULL,
            submitted_at INTEGER NOT NULL,
            PRIMARY KEY (issuer_source, issuer_id, idempotency_key)
          );
        `);
      }

      if (current < 5) {
        this.db.exec(`
          CREATE TABLE platform_identities (
            platform TEXT NOT NULL,
            platform_user_id TEXT NOT NULL,
            viewer_id TEXT NOT NULL,
            platform_username TEXT NOT NULL,
            linked_at TEXT NOT NULL,
            status TEXT NOT NULL,
            PRIMARY KEY (platform, platform_user_id),
            FOREIGN KEY (viewer_id) REFERENCES viewers (id)
          );
          CREATE INDEX platform_identities_viewer ON platform_identities (viewer_id);
        `);
      }

      if (current < 6) {
        this.db.exec(`
          CREATE TABLE moderation_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            reason TEXT NOT NULL,
            actor TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
        `);
      }

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

function assertPlatform(platform: PlatformId, platformUserId: string): void {
  if (!(PLATFORM_IDS as readonly string[]).includes(platform)) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  if (typeof platformUserId !== 'string' || platformUserId.length === 0 || platformUserId.length > 64) {
    throw new Error('Platform user id is missing or invalid');
  }
}

function isAccountStatus(value: string): value is AccountStatus {
  return (ACCOUNT_STATUSES as readonly string[]).includes(value);
}

function platformTargetId(platform: PlatformId, platformUserId: string): string {
  return `${platform}:${platformUserId}`;
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

  // Only a fact about a place, such as a bounty pile, may have nobody in it.
  if (
    !Array.isArray(event.participants)
    || (event.participants.length === 0 && event.type !== 'intervention.bounty')
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

  if ((INTERVENTION_LOG_TYPES as readonly string[]).includes(event.type)) {
    assertInterventionPayload(event);
    return;
  }

  const payload = event.payload as { action?: unknown; result?: unknown };

  if (!(ACTION_IDS as readonly unknown[]).includes(payload.action)) {
    throw new Error(`Unknown action: ${String(payload.action)}`);
  }

  if (!(ACTION_OUTCOMES as readonly unknown[]).includes(payload.result)) {
    throw new Error(`Unknown action result: ${String(payload.result)}`);
  }
}

function assertInterventionPayload(event: SimulationLogEvent): void {
  const payload = event.payload as unknown as Record<string, unknown>;
  const issuer = payload.issuer as { source?: unknown; id?: unknown } | null | undefined;
  const fail = (what: string): never => {
    throw new Error(`Log event ${event.eventId} ${what}`);
  };

  if (typeof payload.commandId !== 'string' || payload.commandId.length === 0) fail('has no command id');

  if (
    typeof issuer !== 'object'
    || issuer === null
    || !(COMMAND_SOURCES as readonly unknown[]).includes(issuer.source)
    || typeof issuer.id !== 'string'
    || issuer.id.length === 0
  ) {
    fail('has no issuer');
  }

  if (event.type !== 'intervention.bounty') {
    if (typeof payload.target !== 'string' || !event.participants.includes(payload.target)) {
      fail('target is not a participant');
    }
  }

  if (event.type === 'intervention.cursed') {
    if (!(BASIC_NEEDS as readonly unknown[]).includes(payload.need)) fail('names an unknown need');
    if (!isFiniteNumber(payload.level) || payload.level < 0 || payload.level > 1) fail('level is out of range');
  }

  if (event.type === 'intervention.bounty' || event.type === 'intervention.gifted') {
    if (!(ITEM_IDS as readonly unknown[]).includes(payload.item)) fail('names an unknown item');
    if (!Number.isInteger(payload.quantity) || (payload.quantity as number) < 1) fail('quantity is not a positive integer');
  }
}

function parseCommandResult(payload: string): CommandResult {
  const value: unknown = JSON.parse(payload);

  if (typeof value !== 'object' || value === null) {
    throw new Error('Command receipt is not an object');
  }

  const result = value as { commandId?: unknown; status?: unknown };

  if (typeof result.commandId !== 'string' || (result.status !== 'applied' && result.status !== 'rejected')) {
    throw new Error('Command receipt is missing a result');
  }

  return value as CommandResult;
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

  if (Number(world.version) >= 24) {
    const viewers = new Set<string>();

    for (const entity of world.entities as { id: string; viewerId?: unknown }[]) {
      if (entity.viewerId === null) continue;

      if (typeof entity.viewerId !== 'string' || !VIEWER_ID_PATTERN.test(entity.viewerId)) {
        throw new Error(`Character ${entity.id} has an invalid viewer id`);
      }

      if (viewers.has(entity.viewerId)) {
        throw new Error(`Two characters belong to viewer ${entity.viewerId}`);
      }

      viewers.add(entity.viewerId);
    }
  }

  const ids = new Set(world.entities.map((entity) => entity.id));

  if (ids.size !== world.entities.length) {
    throw new Error('Snapshot contains duplicate entity IDs');
  }

  return upgradePersistedWorld(world as unknown as UpgradeableWorld);
}
