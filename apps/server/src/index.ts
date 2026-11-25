import { fileURLToPath } from 'node:url';

import { randomUUID } from 'node:crypto';

import { CommandGateway } from './command-gateway.js';
import { createCommandServer } from './command-server.js';
import { viewerFeedback } from './platform/feedback.js';
import { processChatMessage } from './platform/process-chat.js';
import { TwitchIrcAdapter } from './twitch/adapter.js';
import { mergeHistory } from './log-history.js';
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
const COMMAND_PORT = Number(process.env.SIMSAND_COMMAND_PORT ?? 8768);
const LOCAL_HOST = '127.0.0.1';

const startedAt = new Date();

const LOG_RETENTION = Number(process.env.SIMSAND_LOG_RETENTION ?? 100_000);
const COMMAND_RATE_LIMIT = Number(process.env.SIMSAND_COMMAND_RATE_LIMIT ?? 10);
const COMMAND_RATE_WINDOW_MS = Number(process.env.SIMSAND_COMMAND_RATE_WINDOW_MS ?? 60_000);
const COMMAND_RECEIPT_MS = Number(process.env.SIMSAND_COMMAND_RECEIPT_MS ?? 24 * 60 * 60 * 1000);

for (const [name, value] of [
  ['SIMSAND_LOG_RETENTION', LOG_RETENTION],
  ['SIMSAND_COMMAND_RATE_LIMIT', COMMAND_RATE_LIMIT],
  ['SIMSAND_COMMAND_RATE_WINDOW_MS', COMMAND_RATE_WINDOW_MS],
  ['SIMSAND_COMMAND_RECEIPT_MS', COMMAND_RECEIPT_MS],
] as const) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}

const store = WorldStore.open(DB_PATH, LOG_RETENTION, COMMAND_RECEIPT_MS);
const savedWorld = store.loadLatest();

const browserServer = new BrowserWebSocketServer(WS_PORT);

let saveTimer: ReturnType<typeof setInterval> | undefined;
let statusTimer: ReturnType<typeof setInterval> | undefined;
let lastSave: ServerInfo['lastSave'];
let lastTicksDropped = 0;

async function saveWorld(reason: string): Promise<void> {
  try {
    const captured = await simulation.capturePersistedWorld();
    store.save(captured.world, captured.pendingEvents);
    simulation.acknowledgePersisted(captured.pendingEvents.map((event) => event.eventId));
    lastSave = { tick: captured.world.tick, savedAt: new Date().toISOString() };

    const message = `Saved world at tick ${captured.world.tick} (${reason})`;
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
  inspectHistory: async (id) => {
    const live = await simulation.inspectHistory(id);

    if (!live) return undefined;

    return mergeHistory(store.eventsForParticipant(id), live);
  },
  getSnapshot: () => browserServer.getLatestSnapshot(),
  getServerInfo: () => ({ startedAt, browserClients: browserServer.clientCount, lastSave }),
});

const commandGateway = new CommandGateway(simulation, {
  rateLimit: { limit: COMMAND_RATE_LIMIT, windowMs: COMMAND_RATE_WINDOW_MS },
  receipts: store,
});
const commandServer = createCommandServer({ viewers: store, gateway: commandGateway });

inspectionServer
  .listen({ host: LOCAL_HOST, port: INSPECT_PORT })
  .then((address) => log.info(`Inspection API listening on ${address}`))
  .catch((error) => log.error('Failed to start the inspection API:', error));

commandServer
  .listen({ host: LOCAL_HOST, port: COMMAND_PORT })
  .then((address) => log.info(`Command API listening on ${address}`))
  .catch((error) => log.error('Failed to start the command API:', error));

const twitchChannel = process.env.SIMSAND_TWITCH_CHANNEL;
const twitchNick = process.env.SIMSAND_TWITCH_NICK;
const twitchToken = process.env.SIMSAND_TWITCH_TOKEN;

let twitchAdapter: TwitchIrcAdapter | undefined;

if (twitchChannel && twitchNick && twitchToken) {
  twitchAdapter = new TwitchIrcAdapter({
    channel: twitchChannel,
    nick: twitchNick,
    token: twitchToken,
    onMessage: async (message) => {
      const outcome = await processChatMessage(message, store, commandGateway, {
        now: () => new Date().toISOString(),
        newViewerId: () => `viewer-${randomUUID().replace(/-/g, '')}`,
      });
      const feedback = viewerFeedback(outcome, message);

      if (feedback) twitchAdapter?.say(feedback);
    },
  });
  twitchAdapter.start();
} else if (twitchChannel || twitchNick || twitchToken) {
  log.warn('Twitch IRC ignored because SIMSAND_TWITCH_CHANNEL, SIMSAND_TWITCH_NICK and SIMSAND_TWITCH_TOKEN must all be set');
}

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
  twitchAdapter?.stop();
  await simulation.stop();
  await commandServer.close();
  await inspectionServer.close();
  await browserServer.close();
  store.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
