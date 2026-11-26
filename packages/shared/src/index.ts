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
  working: boolean;
  lifecycle: LifecycleState;
  // Sparse stacks this character holds. Empty when they hold nothing.
  inventory: InventoryStack[];
}

// A tile's terrain is stored as its index in this list, so entries may be
// appended but never reordered or removed.
export const TERRAIN_TYPES = ['grass', 'dirt', 'water', 'rock', 'camp'] as const;

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
  // Live piles on the map. A tile with nothing is absent from this list.
  nodes: ResourceNode[];
}

export interface WorldDelta {
  tick: number;
  entities: EntitySnapshot[];
  removed: string[];
  // Present when any pile changed. Replaces the full cached list.
  nodes?: ResourceNode[];
}

export const PERSISTED_WORLD_VERSION = 25;

// Server-issued viewer ids. A platform user id is not one of these.
export const VIEWER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

// Append only. Platform adapters map external accounts into these ids.
export const PLATFORM_IDS = ['twitch'] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

// Viewer and platform-identity accounts share these statuses.
export const ACCOUNT_STATUSES = ['active', 'banned'] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface PlatformIdentityRecord {
  platform: PlatformId;
  platformUserId: string;
  viewerId: string;
  platformUsername: string;
  linkedAt: string;
  status: AccountStatus;
}

// What every platform adapter must produce before the command processor runs.
export interface NormalizedChatMessage {
  platform: PlatformId;
  platformUserId: string;
  platformUsername: string;
  displayName: string;
  messageId: string;
  text: string;
  receivedAt: number;
}

// Append only. Saved inventories store the name.
export const ITEM_IDS = ['goods', 'material', 'food'] as const;

export type ItemId = (typeof ITEM_IDS)[number];

// One kind of item held by one character. A holder with nothing has no record.
export interface InventoryStack {
  item: ItemId;
  quantity: number;
}

export interface InventoryRecord {
  holderId: string;
  stacks: InventoryStack[];
}

// A finite pile on one tile. Absent once the quantity is gone.
export interface ResourceNode {
  x: number;
  y: number;
  item: ItemId;
  quantity: number;
}

// A pile that reached zero. It is not a node until renewsAt, so the live
// pile map stays positive quantities only.
export interface PileReturn {
  x: number;
  y: number;
  renewsAt: number;
}

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

// Append only. Saved worlds store the name.
export const ACTION_IDS = ['idle', 'move', 'eat', 'rest', 'drink', 'work', 'greet', 'comfort', 'keep', 'confide', 'bluff', 'give', 'gather', 'craft', 'dine', 'buy'] as const;

export type ActionId = (typeof ACTION_IDS)[number];

export type ActionCooldowns = Record<ActionId, number>;

// Append only. Saved worlds store the name.
export const ACTION_OUTCOMES = ['completed', 'interrupted', 'failed'] as const;

export type ActionResult = (typeof ACTION_OUTCOMES)[number];

// How the previous action ended. Absent until one has ended.
export interface ActionEnding {
  action: ActionId;
  result: ActionResult;
}

// Append only. Stored events keep their type name.
export const SIMULATION_LOG_TYPES = [
  'action.ended', 'character.greeted', 'character.comforted', 'character.kept', 'character.confided', 'character.bluffed',
  'item.transferred', 'item.traded',
  'intervention.blessed', 'intervention.cursed', 'intervention.bounty', 'intervention.gifted',
] as const;

export type SimulationLogType = (typeof SIMULATION_LOG_TYPES)[number];

export const INTERVENTION_LOG_TYPES = [
  'intervention.blessed', 'intervention.cursed', 'intervention.bounty', 'intervention.gifted',
] as const satisfies readonly SimulationLogType[];

export type InterventionLogType = (typeof INTERVENTION_LOG_TYPES)[number];

export type ActionLogType = Exclude<SimulationLogType, InterventionLogType>;

// How an action ended, and what it moved or claimed.
export interface ActionLogPayload {
  action: ActionId;
  result: ActionResult;
  initiator?: string;
  // What the speaker claimed about their own needs. Present on confide and
  // bluff. A bluff reports every need tied for the highest as satisfied.
  reportedNeeds?: CharacterNeeds;
  // Present on a transfer. One event records the item and the quantity.
  item?: ItemId;
  quantity?: number;
  // Goods paid for the item. Present on a trade.
  price?: number;
}

// Why the world director stepped in. Each is one director rule.
export const DIRECTOR_REASONS = ['mercy', 'scarcity', 'kindness', 'hubris'] as const;

export type DirectorReason = (typeof DIRECTOR_REASONS)[number];

// Who asked for an intervention, and the director's reason when it was
// the director. The command receipt holds the rest.
interface InterventionCause {
  commandId: string;
  issuer: CommandIssuer;
  reason?: DirectorReason;
}

export interface InterventionLogPayloads {
  'intervention.blessed': InterventionCause & { target: string };
  'intervention.cursed': InterventionCause & { target: string; need: BasicNeed; level: number };
  'intervention.bounty': InterventionCause & { item: ItemId; quantity: number };
  'intervention.gifted': InterventionCause & { target: string; item: ItemId; quantity: number };
}

interface LogEventBase<TType extends SimulationLogType, TPayload> {
  eventId: string;
  type: TType;
  tick: number;
  elapsedSeconds: number;
  // Characters the fact is about. Empty for a fact about a place, such as
  // a bounty pile.
  participants: string[];
  location: { x: number; y: number };
  payload: TPayload;
}

export type ActionLogEvent = LogEventBase<ActionLogType, ActionLogPayload>;

export type InterventionLogEvent = {
  [TType in InterventionLogType]: LogEventBase<TType, InterventionLogPayloads[TType]>;
}[InterventionLogType];

// One world fact, many participants. Character history is a query over
// this list, not a copy stored on each participant. The payload shape
// follows the type.
export type SimulationLogEvent = ActionLogEvent | InterventionLogEvent;

export function isInterventionLogEvent(event: SimulationLogEvent): event is InterventionLogEvent {
  return (INTERVENTION_LOG_TYPES as readonly string[]).includes(event.type);
}

// Presentation priority for a chronicle entry. Scoring chooses a tier; it
// does not change simulation outcomes. Append only.
export const CHRONICLE_TIERS = ['minor', 'notable', 'significant', 'dramatic', 'major'] as const;

export type ChronicleTier = (typeof CHRONICLE_TIERS)[number];

// The lowest tier each presentation channel shows. A feed lists recent
// entries, a notification draws attention to the characters involved, and
// camera focus is kept for dramatic events.
export const CHRONICLE_PRESENTATION = {
  feed: 'notable',
  notify: 'significant',
  focus: 'dramatic',
} as const satisfies Record<string, ChronicleTier>;

export function chronicleTierAtLeast(tier: ChronicleTier, minimum: ChronicleTier): boolean {
  return CHRONICLE_TIERS.indexOf(tier) >= CHRONICLE_TIERS.indexOf(minimum);
}

// A scored, abbreviated view of one SimulationLogEvent. Derived on read;
// not a second event store.
export interface ChronicleEntry {
  eventId: string;
  type: SimulationLogType;
  tick: number;
  elapsedSeconds: number;
  participants: string[];
  // Where it happened, in tiles. The camera focuses here.
  location: { x: number; y: number };
  score: number;
  tier: ChronicleTier;
  summary: string;
}

export interface RelationshipRecord {
  a: string;
  b: string;
  meetings: number;
  lastEventId: string;
  lastTick: number;
}

export interface CharacterRelationship {
  otherId: string;
  meetings: number;
  lastEventId: string;
  lastTick: number;
}

// Append only. Saved worlds store the name.
export const MEMORY_KINDS = ['greeting', 'comforting', 'keeping', 'confiding', 'bluffing', 'giving', 'trading'] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

// One recollection of a logged fact. Character memories are a query over
// participants, not a copy stored on each of them.
export interface MemoryRecord {
  memoryId: string;
  kind: MemoryKind;
  eventId: string;
  tick: number;
  participants: string[];
}

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
  lifespanSeconds: number;
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
  working: boolean;
  // Seeded for a new character, then increased while they are alive.
  ageSeconds: number;
  // The choice they are committed to, and how long they have held it.
  action: ActionId;
  actionSeconds: number;
  // Seconds before that action can be chosen again. Set when a need interrupts it.
  cooldowns: ActionCooldowns;
  // How the action before this one ended. Null until one has ended.
  outcome: ActionEnding | null;
  // Stable ID of the other character during a social action. Empty otherwise.
  actionTarget: string;
  // The server-issued viewer who owns this character. Null for an NPC.
  viewerId: string | null;
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
  relationships: RelationshipRecord[];
  log: SimulationLogEvent[];
  memories: MemoryRecord[];
  inventories: InventoryRecord[];
  nodes: ResourceNode[];
  returning: PileReturn[];
  director: PersistedDirector;
}

// What the world director remembers between checks. Times are elapsed
// simulation seconds.
export interface PersistedDirector {
  // When it last acted at all. Null before its first act.
  lastActAt: number | null;
  // When it last acted on each character.
  targeted: Array<{ characterId: string; at: number }>;
  // When each character became urgently hungry with no food to hand.
  hungrySince: Array<{ characterId: string; since: number }>;
  // How many items each character held when last cursed for hoarding.
  cursedHoldings: Array<{ characterId: string; total: number }>;
}

export const COMMAND_PROTOCOL_VERSION = 1;

export const COMMAND_SOURCES = ['admin', 'streamer', 'viewer', 'system'] as const;

export type CommandSource = (typeof COMMAND_SOURCES)[number];

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
    }
  | {
      type: 'intervention.bless';
      params: { characterId: string };
    }
  | {
      type: 'intervention.curse';
      params: { characterId: string; need: BasicNeed };
    }
  | {
      // Adds material to a natural pile site: a tile with a pile, or one
      // whose pile is waiting to return.
      type: 'intervention.bounty';
      params: { x: number; y: number; quantity: number };
    }
  | {
      type: 'intervention.gift';
      params: { characterId: string; item: ItemId; quantity: number };
    };

export type CommandType = CommandRequest['type'];

export const INTERVENTION_COMMAND_TYPES = [
  'intervention.bless', 'intervention.curse', 'intervention.bounty', 'intervention.gift',
] as const satisfies readonly CommandType[];

export type InterventionCommandType = (typeof INTERVENTION_COMMAND_TYPES)[number];

export type SimulationCommand = CommandRequest & {
  commandId: string;
  issuer: CommandIssuer;
  submittedAt: number;
  // Set only by the world director inside the simulation. The gateway's
  // schema has no such field, so an outside caller cannot claim one.
  reason?: DirectorReason;
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
  | DomainEventBase<'character.removed', { characterId: string }>
  // The intervention itself is a log fact. This points at it.
  | DomainEventBase<'intervention.applied', { logEventId: string; logType: InterventionLogType }>;

export type CommandRejectionReason =
  | 'invalid_command'
  | 'unsupported_version'
  | 'forbidden'
  | 'simulation_unavailable'
  | 'character_exists'
  | 'character_not_found'
  | 'out_of_bounds'
  | 'viewer_has_character'
  | 'invalid_issuer'
  | 'rate_limited'
  | 'idempotency_conflict'
  | 'banned'
  | 'character_dead'
  | 'tile_unavailable'
  | 'on_cooldown';

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
  working: boolean;
  ageSeconds: number;
  action: ActionId;
  utilities: Record<ActionId, number>;
  cooldowns: ActionCooldowns;
  // Which actions can be chosen right now. Idle is always available.
  available: Record<ActionId, boolean>;
  outcome: ActionEnding | null;
  actionTarget: string | null;
  relationships: CharacterRelationship[];
  memories: MemoryRecord[];
  // Stacks this character holds. Empty when they have no record.
  inventory: InventoryStack[];
  // The pile on the tile under this character. Null when the tile has none.
  node: { item: ItemId; quantity: number } | null;
  derived: DerivedStats;
  // Null when the character is an NPC.
  viewerId: string | null;
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
  | { type: 'world.persist.ack'; data: { eventIds: string[] } }
  | { type: 'world.command'; data: SimulationCommand }
  | { type: 'world.status.request'; data: { requestId: number } }
  | { type: 'world.inspect.request'; data: { requestId: number; entityId: string } }
  | { type: 'world.inspect.history.request'; data: { requestId: number; entityId: string } };

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
      // Entries scored from log events written since the previous batch.
      type: 'world.chronicle';
      data: { entries: ChronicleEntry[] };
    }
  | {
      type: 'world.persisted';
      data: {
        requestId: number;
        world: PersistedWorld;
        // Events the live log dropped after the previous confirmed save.
        pendingEvents: SimulationLogEvent[];
      };
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
      type: 'world.inspected.history';
      data: { requestId: number; entityId: string; events: SimulationLogEvent[] | null };
    }
  | {
      type: 'world.error';
      data: {
        message: string;
      };
    };
