export const PROJECT_NAME = 'simsand';

export interface EntitySnapshot {
  id: string;
  x: number;
  y: number;
  color: number;
  sprite: number;
}

export interface WorldSnapshot {
  tick: number;
  elapsedSeconds: number;
  entities: EntitySnapshot[];
}

export interface WorldDelta {
  tick: number;
  entities: EntitySnapshot[];
  removed: string[];
}

export const PERSISTED_WORLD_VERSION = 1;

export interface PersistedEntity {
  id: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  color: number;
  sprite: number;
}

// Everything needed to resume the simulation. Unlike WorldSnapshot, which
// is shaped for rendering, this must include all authoritative state.
export interface PersistedWorld {
  version: number;
  seed: number;
  tick: number;
  elapsedSeconds: number;
  fixedDeltaSeconds: number;
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
  | { type: 'world.command'; data: SimulationCommand };

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
      type: 'world.error';
      data: {
        message: string;
      };
    };
