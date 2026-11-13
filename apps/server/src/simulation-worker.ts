import { Worker } from 'node:worker_threads';

import type {
  CommandResult,
  EntityInspection,
  PersistedWorld,
  SimulationStatus,
  ServerToWorkerMessage,
  SimulationCommand,
  WorkerToServerMessage,
} from '@simsand/shared';

import { log } from './logger.js';

export class SimulationWorker {
  private worker: Worker | undefined;

  private nextRequestId = 1;

  private pendingReplies = new Map<string, (value: unknown) => void>();

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
        this.resolveReply(`persist:${message.data.requestId}`, message.data.world);
        return;
      }

      if (message.type === 'world.command.result') {
        this.resolveReply(`command:${message.data.commandId}`, message.data);
        return;
      }

      if (message.type === 'world.status') {
        this.resolveReply(`status:${message.data.requestId}`, message.data.status);
        return;
      }

      if (message.type === 'world.inspected') {
        this.resolveReply(`inspect:${message.data.requestId}`, message.data.entity);
        return;
      }

      this.onMessage(message);
    });

    this.worker.on('error', (error) => {
      log.error('Simulation worker error:', error);
    });

    const worker = this.worker;

    this.worker.on('exit', (code) => {
      // stop() clears this.worker before terminating, which exits with code 1.
      if (this.worker !== worker) return;

      this.worker = undefined;

      if (code !== 0) {
        log.error(`Simulation worker exited with code ${code}`);
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
    const requestId = this.nextRequestId++;

    return this.request<PersistedWorld>(
      `persist:${requestId}`,
      { type: 'world.persist.request', data: { requestId } },
      timeoutMs,
      'a world snapshot',
    );
  }

  getStatus(timeoutMs = 2000): Promise<SimulationStatus> {
    const requestId = this.nextRequestId++;

    return this.request<SimulationStatus>(
      `status:${requestId}`,
      { type: 'world.status.request', data: { requestId } },
      timeoutMs,
      'its status',
    );
  }

  async inspectEntity(entityId: string, timeoutMs = 2000): Promise<EntityInspection | undefined> {
    const requestId = this.nextRequestId++;

    const entity = await this.request<EntityInspection | null>(
      `inspect:${requestId}`,
      { type: 'world.inspect.request', data: { requestId, entityId } },
      timeoutMs,
      `details for entity ${entityId}`,
    );

    return entity ?? undefined;
  }

  executeCommand(command: SimulationCommand, timeoutMs = 2000): Promise<CommandResult> {
    return this.request<CommandResult>(
      `command:${command.commandId}`,
      { type: 'world.command', data: command },
      timeoutMs,
      `a result for command ${command.commandId}`,
    );
  }

  async stop(): Promise<void> {
    const worker = this.worker;

    if (!worker) return;

    this.worker = undefined;
    await worker.terminate();
  }

  private request<T>(
    key: string,
    message: ServerToWorkerMessage,
    timeoutMs: number,
    description: string,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingReplies.delete(key);
        reject(new Error(`Simulation worker did not provide ${description} within ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingReplies.set(key, (value) => {
        clearTimeout(timer);
        resolve(value as T);
      });

      try {
        this.send(message);
      } catch (error) {
        clearTimeout(timer);
        this.pendingReplies.delete(key);
        reject(error);
      }
    });
  }

  private resolveReply(key: string, value: unknown): void {
    this.pendingReplies.get(key)?.(value);
    this.pendingReplies.delete(key);
  }

  private send(message: ServerToWorkerMessage): void {
    if (!this.worker) {
      throw new Error('Simulation worker is not running');
    }

    this.worker.postMessage(message);
  }
}