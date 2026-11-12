import { Worker } from 'node:worker_threads';

import type {
  ServerToWorkerMessage,
  WorkerToServerMessage,
} from '@simsand/shared';

export class SimulationWorker {
  private worker: Worker | undefined;

  constructor(
    private readonly onMessage: (
      message: WorkerToServerMessage,
    ) => void,
  ) {}

  start(
    options: {
      seed?: number;
      population?: number;
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

    this.worker.on('message', this.onMessage);

    this.worker.on('error', (error) => {
      console.error('Simulation worker error:', error);
    });

    this.worker.on('exit', (code) => {
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