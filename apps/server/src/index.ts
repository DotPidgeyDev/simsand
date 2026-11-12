import { fileURLToPath } from 'node:url';

import { SimulationWorker } from './simulation-worker.js';
import { BrowserWebSocketServer } from './websocket-server.js';
import { WorldStore } from './world-store.js';

const DB_PATH = process.env.SIMSAND_DB_PATH
  ?? fileURLToPath(new URL('../data/simsand.sqlite', import.meta.url));
const SAVE_INTERVAL_MS = Number(process.env.SIMSAND_SAVE_INTERVAL_MS ?? 30_000);

const store = WorldStore.open(DB_PATH);
const savedWorld = store.loadLatest();

const browserServer = new BrowserWebSocketServer(8766);

let saveTimer: ReturnType<typeof setInterval> | undefined;

async function saveWorld(reason: string): Promise<void> {
  try {
    const world = await simulation.capturePersistedWorld();
    store.save(world);
    console.log(`Saved world at tick ${world.tick} (${reason})`);
  } catch (error) {
    console.error(`Failed to save world (${reason}):`, error);
  }
}

const simulation = new SimulationWorker((message) => {
  switch (message.type) {
    case 'world.ready':
      console.log('Simulation ready:', message.data);
      simulation.requestSnapshot();
      void saveWorld('baseline');
      saveTimer = setInterval(() => void saveWorld('periodic'), SAVE_INTERVAL_MS);
      break;

    case 'world.snapshot':
      browserServer.setLatestSnapshot(message.data);
      browserServer.broadcast({
        type: 'world.snapshot',
        data: message.data,
      });
      console.log(`World snapshot received: ${message.data.entities.length} entities`);
    break;

    case 'world.delta':
      browserServer.applyDelta(message.data);
      browserServer.broadcast({
        type: 'world.delta',
        data: message.data,
      });
      break;

    case 'world.error':
      console.error('Simulation error:', message.data.message);
      break;
  }
});

if (savedWorld) {
  console.log(`Restoring world from ${DB_PATH} at tick ${savedWorld.tick}`);
  simulation.start({ restore: savedWorld });
} else {
  console.log(`No saved world in ${DB_PATH}; creating a new world`);
  simulation.start({ seed: 12345, population: 20 });
}

let stopping = false;

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;

  console.log(`Received ${signal}; saving and stopping simulation...`);
  clearInterval(saveTimer);
  await saveWorld('shutdown');
  await simulation.stop();
  await browserServer.close();
  store.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
