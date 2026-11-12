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

export type ServerToWorkerMessage =
  | {
      type: 'world.start';
      data?: {
        seed?: number;
        population?: number;
      };
    }
  | { type: 'world.pause' }
  | { type: 'world.resume' }
  | { type: 'world.snapshot.request' };

export type WorkerToServerMessage =
  | {
      type: 'world.ready';
      data: {
        tick: number;
        elapsedSeconds: number;
        population: number;
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
      type: 'world.error';
      data: {
        message: string;
      };
    };
