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
  | { type: 'world.persist.request'; data: { requestId: number } };

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
      type: 'world.error';
      data: {
        message: string;
      };
    };
