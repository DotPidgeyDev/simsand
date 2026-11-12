import { WebSocket, WebSocketServer } from 'ws';

import type { WorldSnapshot, WorldDelta } from '@simsand/shared';

export type ClientMessage =
  | { type: 'world.snapshot'; data: WorldSnapshot }
  | { type: 'world.delta'; data: WorldDelta };

export class BrowserWebSocketServer {
  private server: WebSocketServer;

  private latestSnapshot: WorldSnapshot | undefined;

constructor(port = 8766) {
  this.server = new WebSocketServer({ port });

  this.server.on('connection', (socket) => {
    console.log('Browser client connected');
    console.log('Cached snapshot exists:', this.latestSnapshot !== undefined);

    if (this.latestSnapshot) {
      socket.send(JSON.stringify({
        type: 'world.snapshot',
        data: this.latestSnapshot,
      }));
    }

    socket.on('close', () => {
      console.log('Browser client disconnected');
    });
  });

  console.log(`WebSocket server listening on port ${port}`);
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
    console.log('Caching snapshot with entities:', snapshot.entities.length);
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}