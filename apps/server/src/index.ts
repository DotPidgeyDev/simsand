import { fileURLToPath } from 'node:url';

import { createInspectionServer } from './inspection-server.js';
import type { ServerInfo } from './inspection-server.js';
import { log } from './logger.js';
import { SimulationWorker } from './simulation-worker.js';
import { BrowserWebSocketServer } from './websocket-server.js';
import { WorldStore } from './world-store.js';

const DB_PATH = process.env.SIMSAND_DB_PATH
  ?? fileURLToPath(new URL('../data/simsand.sqlite', import.meta.url));
const SAVE_INTERVAL_MS = Number(process.env.SIMSAND_SAVE_INTERVAL_MS ?? 30_000);
const STATUS_INTERVAL_MS = Number(process.env.SIMSAND_STATUS_INTERVAL_MS ?? 60_000);
const WS_PORT = Number(process.env.SIMSAND_WS_PORT ?? 8766);
const INSPECT_PORT = Number(process.env.SIMSAND_INSPECT_PORT ?? 8767);
const INSPECT_HOST = '127.0.0.1';

const startedAt = new Date();

const store = WorldStore.open(DB_PATH);
const savedWorld = store.loadLatest();

const browserServer = new BrowserWebSocketServer(WS_PORT);

let saveTimer: ReturnType<typeof setInterval> | undefined;
let statusTimer: ReturnType<typeof setInterval> | undefined;
let lastSave: ServerInfo['lastSave'];
let lastTicksDropped = 0;

async function saveWorld(reason: string): Promise<void> {
  try {
    const world = await simulation.capturePersistedWorld();
    store.save(world);
    lastSave = { tick: world.tick, savedAt: new Date().toISOString() };

    const message = `Saved world at tick ${world.tick} (${reason})`;
    if (reason === 'periodic') log.debug(message);
    else log.info(message);
  } catch (error) {
    log.error(`Failed to save world (${reason}):`, error);
  }
}

async function logStatus(): Promise<void> {
  try {
    const status = await simulation.getStatus();
    const dropped = status.ticksDropped - lastTicksDropped;
    lastTicksDropped = status.ticksDropped;

    log.info(
      `Status: tick ${status.tick}${status.paused ? ' (paused)' : ''}, ` +
      `${status.population} entities, ${browserServer.clientCount} browser clients, ` +
      `tick mean ${status.meanTickMs.toFixed(3)} ms / max ${status.maxTickMs.toFixed(3)} ms, ` +
      `last save ${lastSave ? `tick ${lastSave.tick}` : 'none'}`,
    );

    if (dropped > 0) {
      log.warn(`Simulation fell behind and dropped ${dropped} ticks since the last status report`);
    }
  } catch (error) {
    log.error('Failed to read simulation status:', error);
  }
}

const simulation = new SimulationWorker((message) => {
  switch (message.type) {
    case 'world.ready':
      log.info(
        `Simulation ready at tick ${message.data.tick} with ${message.data.population} entities` +
        ` (${message.data.restored ? 'restored' : 'new world'})`,
      );
      simulation.requestSnapshot();
      void saveWorld('baseline');
      saveTimer = setInterval(() => void saveWorld('periodic'), SAVE_INTERVAL_MS);
      statusTimer = setInterval(() => void logStatus(), STATUS_INTERVAL_MS);
      break;

    case 'world.snapshot':
      browserServer.setLatestSnapshot(message.data);
      browserServer.broadcast({
        type: 'world.snapshot',
        data: message.data,
      });
      log.debug(`World snapshot at tick ${message.data.tick}: ${message.data.entities.length} entities`);
      break;

    case 'world.delta':
      browserServer.applyDelta(message.data);
      browserServer.broadcast({
        type: 'world.delta',
        data: message.data,
      });
      break;

    case 'world.error':
      log.error(`Simulation error: ${message.data.message}`);
      break;
  }
});

const inspectionServer = createInspectionServer({
  getStatus: () => simulation.getStatus(),
  inspectEntity: (id) => simulation.inspectEntity(id),
  getSnapshot: () => browserServer.getLatestSnapshot(),
  getServerInfo: () => ({ startedAt, browserClients: browserServer.clientCount, lastSave }),
});

inspectionServer
  .listen({ host: INSPECT_HOST, port: INSPECT_PORT })
  .then((address) => log.info(`Inspection API listening on ${address}`))
  .catch((error) => log.error('Failed to start the inspection API:', error));

if (savedWorld) {
  log.info(`Restoring world from ${DB_PATH} at tick ${savedWorld.tick}`);
  simulation.start({ restore: savedWorld });
} else {
  log.info(`No saved world in ${DB_PATH}; creating a new world`);
  simulation.start({ seed: 12345, population: 20 });
}

let stopping = false;

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;

  log.info(`Received ${signal}; saving and stopping simulation...`);
  clearInterval(saveTimer);
  clearInterval(statusTimer);
  await saveWorld('shutdown');
  await simulation.stop();
  await inspectionServer.close();
  await browserServer.close();
  store.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
