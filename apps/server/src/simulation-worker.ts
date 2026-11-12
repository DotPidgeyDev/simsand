import { Worker } from 'node:worker_threads';

import type {
  PersistedWorld,
  ServerToWorkerMessage,
  WorkerToServerMessage,
} from '@simsand/shared';

export class SimulationWorker {
  private worker: Worker | undefined;

  private nextPersistRequestId = 1;

  private pendingPersists = new Map<number, (world: PersistedWorld) => void>();

  constructor(
    private readonly onMessage: (
      message: WorkerToServerMessage,
    ) => void,
  ) {}

  start(
    options: {
      seed?: number;
      population?: number;
      restore?: PersistedWorld;
    } = {},
  ): void {
    if (this.worker) {
      throw new Error('Simulation worker is already running');
    }

    this.worker = new Worker(
      new URL('./worker.ts', import.meta.url),
      {
        execArgv: process.execArgv,
      },
    );

    this.worker.on('message', (message: WorkerToServerMessage) => {
      if (message.type === 'world.persisted') {
        this.pendingPersists.get(message.data.requestId)?.(message.data.world);
        this.pendingPersists.delete(message.data.requestId);
        return;
      }

      this.onMessage(message);
    });

    this.worker.on('error', (error) => {
      console.error('Simulation worker error:', error);
    });

    const worker = this.worker;

    this.worker.on('exit', (code) => {
      // stop() clears this.worker before terminating, which exits with code 1.
      if (this.worker !== worker) return;

      this.worker = undefined;

      if (code !== 0) {
        console.error(`Simulation worker exited with code ${code}`);
      }
    });

    this.send({
      type: 'world.start',
      data: options,
    });
  }

  pause(): void {
    this.send({ type: 'world.pause' });
  }

  resume(): void {
    this.send({ type: 'world.resume' });
  }

  requestSnapshot(): void {
    this.send({ type: 'world.snapshot.request' });
  }

  capturePersistedWorld(timeoutMs = 2000): Promise<PersistedWorld> {
    const requestId = this.nextPersistRequestId++;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPersists.delete(requestId);
        reject(new Error(`Simulation worker did not provide a world snapshot within ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingPersists.set(requestId, (world) => {
        clearTimeout(timer);
        resolve(world);
      });

      try {
        this.send({ type: 'world.persist.request', data: { requestId } });
      } catch (error) {
        clearTimeout(timer);
        this.pendingPersists.delete(requestId);
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    const worker = this.worker;

    if (!worker) return;

    this.worker = undefined;
    await worker.terminate();
  }

  private send(message: ServerToWorkerMessage): void {
    if (!this.worker) {
      throw new Error('Simulation worker is not running');
    }

    this.worker.postMessage(message);
  }
}