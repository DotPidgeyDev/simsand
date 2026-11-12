import { parentPort } from 'node:worker_threads';

import {
  createSimulationWorld,
  createPopulation,
  createSimulationClock,
  createSimulationRunner,
  createSimulationLoop,
  startSimulationLoop,
  stopSimulationLoop,
  createWorldSnapshot,
  createWorldDelta,
} from '@simsand/simulation';

import type {
  ServerToWorkerMessage,
  WorkerToServerMessage,
  WorldSnapshot,
} from '@simsand/shared';

if (!parentPort) {
  throw new Error('Simulation worker must run inside a worker thread');
}

let loop: ReturnType<typeof createSimulationLoop> | undefined;
let snapshot: WorldSnapshot | undefined;

let previousSnapshot: WorldSnapshot | undefined;
let deltaTimer: ReturnType<typeof setInterval> | undefined;

function send(message: WorkerToServerMessage): void {
  parentPort?.postMessage(message);
}

function createSnapshot(): WorldSnapshot {
  if (!loop) {
    throw new Error('Simulation has not started');
  }

  const { world, clock } = loop.runner;

  return createWorldSnapshot(
    world,
    clock.tick,
    clock.elapsedSeconds,
  );
}

parentPort.on('message', (message: ServerToWorkerMessage) => {
  try {
    switch (message.type) {
      case 'world.start': {
        if (loop) break;

        const world = createSimulationWorld();

        const entities = createPopulation(
          world,
          message.data?.population ?? 20,
          message.data?.seed ?? 12345,
        );

        const clock = createSimulationClock();
        const runner = createSimulationRunner(world, clock);

        loop = createSimulationLoop(runner);

        startSimulationLoop(loop);

        previousSnapshot = createSnapshot();

        deltaTimer = setInterval(() => {
          const currentSnapshot = createSnapshot();

          if (!previousSnapshot) {
            previousSnapshot = currentSnapshot;
            return;
          }

          const delta = createWorldDelta(previousSnapshot, currentSnapshot);

          if (delta.entities.length > 0 || delta.removed.length > 0) {
            send({
              type: 'world.delta',
              data: delta,
            });
          }

          previousSnapshot = currentSnapshot;
        }, 200);

        send({
          type: 'world.ready',
          data: {
            tick: clock.tick,
            elapsedSeconds: clock.elapsedSeconds,
            population: entities.length,
          },
        });

        break;
      }

      case 'world.pause':
        if (loop) {
          loop.runner.paused = true;
        }
        break;

      case 'world.resume':
        if (loop) {
          loop.runner.paused = false;
        }
        break;

      case 'world.snapshot.request':
        snapshot = createSnapshot();

        send({
          type: 'world.snapshot',
          data: snapshot,
        });

        break;
    }
  } catch (error) {
    send({
      type: 'world.error',
      data: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

parentPort.on('close', () => {
  if (deltaTimer) {
    clearInterval(deltaTimer);
  }

  if (loop) {
    stopSimulationLoop(loop);
  }
});