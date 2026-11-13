import type { AddressInfo } from 'node:net';

import { WebSocket, WebSocketServer } from 'ws';

import type { WorldSnapshot, WorldDelta } from '@simsand/shared';

import { log } from './logger.js';
import { applyDeltaToSnapshot } from './snapshot-cache.js';

export type ClientMessage =
  | { type: 'world.snapshot'; data: WorldSnapshot }
  | { type: 'world.delta'; data: WorldDelta };

export class BrowserWebSocketServer {
  private server: WebSocketServer;

  private latestSnapshot: WorldSnapshot | undefined;

  readonly listening: Promise<number>;

  constructor(port = 8766) {
    this.server = new WebSocketServer({ port });

    this.listening = new Promise((resolve, reject) => {
      this.server.once('listening', () => {
        const actualPort = (this.server.address() as AddressInfo).port;
        log.info(`WebSocket server listening on port ${actualPort}`);
        resolve(actualPort);
      });
      this.server.once('error', reject);
    });

    this.server.on('connection', (socket) => {
      log.info(`Browser client connected (${this.clientCount} connected)`);

      if (this.latestSnapshot) {
        socket.send(JSON.stringify({
          type: 'world.snapshot',
          data: this.latestSnapshot,
        }));
      } else {
        log.warn('No world snapshot cached yet; client will wait for the next one');
      }

      socket.on('close', () => {
        log.info(`Browser client disconnected (${this.clientCount} connected)`);
      });
    });
  }

  get clientCount(): number {
    return this.server.clients.size;
  }

  getLatestSnapshot(): WorldSnapshot | undefined {
    return this.latestSnapshot;
  }

  broadcast(message: ClientMessage): void {
    const payload = JSON.stringify(message);

    for (const client of this.server.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  setLatestSnapshot(snapshot: WorldSnapshot): void {
    this.latestSnapshot = snapshot;
  }

  applyDelta(delta: WorldDelta): void {
    if (!this.latestSnapshot) {
      return;
    }

    this.latestSnapshot = applyDeltaToSnapshot(this.latestSnapshot, delta);
  }

  close(): Promise<void> {
    // The server only finishes closing once every connection has ended, and
    // browser clients otherwise stay connected indefinitely.
    for (const client of this.server.clients) {
      client.terminate();
    }

    return new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
