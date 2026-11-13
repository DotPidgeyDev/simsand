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
  capturePersistedWorld,
  restorePersistedWorld,
  executeCommand,
  generateWorldMap,
  getSimulationLoopTiming,
  inspectCharacter,
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
let seed = 12345;

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

        const restore = message.data?.restore;
        let world: ReturnType<typeof createSimulationWorld>;
        let clock: ReturnType<typeof createSimulationClock>;

        if (restore) {
          ({ world, clock } = restorePersistedWorld(restore));
          seed = restore.seed;
        } else {
          seed = message.data?.seed ?? 12345;
          world = createSimulationWorld(generateWorldMap(seed));
          clock = createSimulationClock();
          createPopulation(world, message.data?.population ?? 20, seed);
        }

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
            population: world.entityIds.size,
            restored: restore !== undefined,
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

      case 'world.persist.request': {
        if (!loop) {
          throw new Error('Simulation has not started');
        }

        const { world, clock } = loop.runner;

        send({
          type: 'world.persisted',
          data: {
            requestId: message.data.requestId,
            world: capturePersistedWorld(world, clock, seed),
          },
        });

        break;
      }

      case 'world.status.request': {
        if (!loop) {
          throw new Error('Simulation has not started');
        }

        const { world, clock, paused } = loop.runner;

        send({
          type: 'world.status',
          data: {
            requestId: message.data.requestId,
            status: {
              tick: clock.tick,
              elapsedSeconds: clock.elapsedSeconds,
              paused,
              population: world.entityIds.size,
              ...getSimulationLoopTiming(loop),
            },
          },
        });

        break;
      }

      case 'world.inspect.request': {
        if (!loop) {
          throw new Error('Simulation has not started');
        }

        send({
          type: 'world.inspected',
          data: {
            requestId: message.data.requestId,
            entity: inspectCharacter(loop.runner.world, message.data.entityId) ?? null,
          },
        });

        break;
      }

      case 'world.command': {
        if (!loop) {
          send({
            type: 'world.command.result',
            data: {
              commandId: message.data.commandId,
              status: 'rejected',
              reason: 'simulation_unavailable',
              message: 'Simulation has not started',
            },
          });
          break;
        }

        const { world, clock } = loop.runner;

        send({
          type: 'world.command.result',
          data: executeCommand(world, clock, message.data),
        });

        break;
      }
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