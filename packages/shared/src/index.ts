export const PROJECT_NAME = 'simsand';

// Append only. Saved worlds store the name, so order is not load-bearing,
// but removing or renaming an entry invalidates existing saves.
export const SPRITE_IDS = ['wanderer', 'scout', 'elder'] as const;

export type SpriteId = (typeof SPRITE_IDS)[number];

export interface EntitySnapshot {
  id: string;
  x: number;
  y: number;
  color: number;
  sprite: SpriteId;
  resting: boolean;
  eating: boolean;
  drinking: boolean;
}

// A tile's terrain is stored as its index in this list, so entries may be
// appended but never reordered or removed.
export const TERRAIN_TYPES = ['grass', 'dirt', 'water'] as const;

export type TerrainType = (typeof TERRAIN_TYPES)[number];

export interface WorldMapData {
  width: number;
  height: number;
  // Row-major indices into TERRAIN_TYPES: tile (x, y) is tiles[y * width + x].
  tiles: number[];
}

export interface WorldSnapshot {
  tick: number;
  elapsedSeconds: number;
  map: WorldMapData;
  entities: EntitySnapshot[];
}

export interface WorldDelta {
  tick: number;
  entities: EntitySnapshot[];
  removed: string[];
}

export const PERSISTED_WORLD_VERSION = 6;

export const ATTRIBUTE_NAMES = [
  'strength',
  'dexterity',
  'intelligence',
  'wisdom',
  'constitution',
  'perception',
  'charisma',
] as const;

export type AttributeName = (typeof ATTRIBUTE_NAMES)[number];

export type CharacterAttributes = Record<AttributeName, number>;

export const ATTRIBUTE_MIN = 1;
export const ATTRIBUTE_MAX = 10;

export const PERSONALITY_TRAITS = [
  'aggression',
  'sociability',
  'greed',
  'ambition',
  'loyalty',
  'curiosity',
  'courage',
  'honesty',
  'industriousness',
  'empathy',
] as const;

export type PersonalityTrait = (typeof PERSONALITY_TRAITS)[number];

// Each trait is 0 to 1. A higher value means more of that trait.
export type CharacterPersonality = Record<PersonalityTrait, number>;

// 0 is satisfied and 1 is critical. Only the needs that drive the next
// behaviours exist so far.
export const BASIC_NEEDS = ['hunger', 'thirst', 'fatigue'] as const;

export type BasicNeed = (typeof BASIC_NEEDS)[number];

export type CharacterNeeds = Record<BasicNeed, number>;

export const LIFECYCLE_STATES = ['alive', 'dead'] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export interface CharacterProfile {
  name: string;
  attributes: CharacterAttributes;
  personality: CharacterPersonality;
  needs: CharacterNeeds;
  lifecycle: LifecycleState;
}

// Rates the needs system derives from attributes. Computed, not saved.
export interface DerivedStats {
  fatigueGainPerSecond: number;
  fatigueRecoveryPerSecond: number;
}

export interface PersistedEntity extends CharacterProfile {
  id: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  color: number;
  sprite: SpriteId;
  // Remembered so a save during the gap resumes the same recovery. The need
  // alone cannot say, because the same value occurs on the way up and down.
  resting: boolean;
  eating: boolean;
  drinking: boolean;
}

// Everything needed to resume the simulation. Unlike WorldSnapshot, which
// is shaped for rendering, this must include all authoritative state.
export interface PersistedWorld {
  version: number;
  seed: number;
  tick: number;
  elapsedSeconds: number;
  fixedDeltaSeconds: number;
  map: WorldMapData;
  entities: PersistedEntity[];
}

export const COMMAND_PROTOCOL_VERSION = 1;

export type CommandSource = 'admin' | 'streamer' | 'viewer' | 'system';

// Derived by the server from an authenticated identity, never taken from
// the request itself.
export interface CommandIssuer {
  source: CommandSource;
  id: string;
}

export type CommandRequest =
  | {
      type: 'character.create';
      params: {
        characterId: string;
        x: number;
        y: number;
        velocityX?: number;
        velocityY?: number;
        color?: number;
      };
    }
  | {
      type: 'character.remove';
      params: { characterId: string };
    };

export type CommandType = CommandRequest['type'];

export type SimulationCommand = CommandRequest & {
  commandId: string;
  issuer: CommandIssuer;
  submittedAt: number;
};

export const DOMAIN_EVENT_VERSION = 1;

interface DomainEventBase<TType extends string, TPayload> {
  eventId: string;
  type: TType;
  version: number;
  tick: number;
  elapsedSeconds: number;
  causedByCommandId?: string;
  payload: TPayload;
}

export type DomainEvent =
  | DomainEventBase<'character.created', { characterId: string; x: number; y: number }>
  | DomainEventBase<'character.removed', { characterId: string }>;

export type CommandRejectionReason =
  | 'invalid_command'
  | 'unsupported_version'
  | 'forbidden'
  | 'simulation_unavailable'
  | 'character_exists'
  | 'character_not_found'
  | 'out_of_bounds';

export type CommandResult =
  | { commandId: string; status: 'applied'; tick: number; events: DomainEvent[] }
  | { commandId: string; status: 'rejected'; reason: CommandRejectionReason; message: string };

export interface SimulationStatus {
  tick: number;
  elapsedSeconds: number;
  paused: boolean;
  population: number;
  // Since the worker started.
  ticksRun: number;
  // Ticks skipped because the loop fell further behind than its catch-up limit.
  ticksDropped: number;
  // Over the most recent ticks, up to one minute's worth.
  recentTicks: number;
  meanTickMs: number;
  maxTickMs: number;
}

export interface EntityInspection extends CharacterProfile {
  id: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  color: number;
  sprite: SpriteId;
  resting: boolean;
  eating: boolean;
  drinking: boolean;
  derived: DerivedStats;
  // The tile containing the entity. An entity on the far edge of the map
  // reports the last row or column.
  tile: { x: number; y: number; terrain: TerrainType };
}

export type ServerToWorkerMessage =
  | {
      type: 'world.start';
      data?: {
        seed?: number;
        population?: number;
        restore?: PersistedWorld;
      };
    }
  | { type: 'world.pause' }
  | { type: 'world.resume' }
  | { type: 'world.snapshot.request' }
  | { type: 'world.persist.request'; data: { requestId: number } }
  | { type: 'world.command'; data: SimulationCommand }
  | { type: 'world.status.request'; data: { requestId: number } }
  | { type: 'world.inspect.request'; data: { requestId: number; entityId: string } };

export type WorkerToServerMessage =
  | {
      type: 'world.ready';
      data: {
        tick: number;
        elapsedSeconds: number;
        population: number;
        restored: boolean;
      };
    }
  | {
      type: 'world.snapshot';
      data: WorldSnapshot;
    }
  | {
      type: 'world.delta';
      data: WorldDelta;
    }
  | {
      type: 'world.persisted';
      data: { requestId: number; world: PersistedWorld };
    }
  | {
      type: 'world.command.result';
      data: CommandResult;
    }
  | {
      type: 'world.status';
      data: { requestId: number; status: SimulationStatus };
    }
  | {
      type: 'world.inspected';
      data: { requestId: number; entity: EntityInspection | null };
    }
  | {
      type: 'world.error';
      data: {
        message: string;
      };
    };
