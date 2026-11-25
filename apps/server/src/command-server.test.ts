import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import type { CommandIssuer, CommandResult } from '@simsand/shared';

import { CommandGateway } from './command-gateway.js';
import { createCommandServer } from './command-server.js';
import type { ViewerDirectory } from './command-server.js';
import { WorldStore } from './world-store.js';
import type { ViewerRecord } from './world-store.js';

function directory(): ViewerDirectory & { viewers: Map<string, ViewerRecord> } {
  const viewers = new Map<string, ViewerRecord>();

  return {
    viewers,
    createViewer(viewer) {
      viewers.set(viewer.id, viewer);
    },
    getViewer(id) {
      return viewers.get(id);
    },
    ensureViewerForPlatform(_platform, _platformUserId, _platformUsername, displayName, now, newViewerId) {
      const viewer: ViewerRecord = {
        id: newViewerId(),
        displayName,
        createdAt: now(),
        status: 'active',
      };
      viewers.set(viewer.id, viewer);
      return viewer;
    },
  };
}

describe('command server', () => {
  let app: ReturnType<typeof createCommandServer> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('registers a viewer and submits their create as that issuer', async () => {
    const viewers = directory();
    const sent: CommandIssuer[] = [];
    const gateway = new CommandGateway({
      executeCommand: async (command) => {
        sent.push(command.issuer);
        return { commandId: command.commandId, status: 'applied', tick: 1, events: [] };
      },
    }, { now: () => 1_000, newId: () => 'command-1' });

    app = createCommandServer({
      viewers,
      gateway,
      now: () => new Date('2026-11-23T08:00:00.000Z'),
      newViewerId: () => 'viewer-1',
    });

    const registered = await app.inject({
      method: 'POST',
      url: '/viewers',
      payload: { displayName: 'Ada' },
    });

    expect(registered.statusCode).toBe(201);
    expect(registered.json()).toEqual({
      id: 'viewer-1',
      displayName: 'Ada',
      createdAt: '2026-11-23T08:00:00.000Z',
      status: 'active',
    });

    const created = await app.inject({
      method: 'POST',
      url: '/viewers/viewer-1/commands',
      payload: {
        protocolVersion: 1,
        command: {
          type: 'character.create',
          params: { characterId: 'ada', x: 4, y: 5 },
        },
      },
    });

    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ commandId: 'command-1', status: 'applied' });
    expect(sent).toEqual([{ source: 'viewer', id: 'viewer-1' }]);
  });

  it('rejects a body that tries to name its own issuer before the simulation sees it', async () => {
    const gateway = new CommandGateway({
      executeCommand: async (): Promise<CommandResult> => {
        throw new Error('simulation should not be called');
      },
    });

    app = createCommandServer({
      viewers: directory(),
      gateway,
      newViewerId: () => 'viewer-1',
    });

    await app.inject({ method: 'POST', url: '/viewers', payload: { displayName: 'Ada' } });

    const response = await app.inject({
      method: 'POST',
      url: '/viewers/viewer-1/commands',
      payload: {
        protocolVersion: 1,
        issuer: { source: 'admin', id: 'spoofed' },
        command: { type: 'character.create', params: { characterId: 'ada', x: 1, y: 1 } },
      },
    });

    expect(response.json()).toMatchObject({ status: 'rejected', reason: 'invalid_command' });
  });

  it('does not accept a command for an unknown viewer', async () => {
    app = createCommandServer({
      viewers: directory(),
      gateway: new CommandGateway({
        executeCommand: async () => {
          throw new Error('simulation should not be called');
        },
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/viewers/viewer-missing/commands',
      payload: {
        protocolVersion: 1,
        command: { type: 'character.create', params: { characterId: 'ada', x: 1, y: 1 } },
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('accepts a normalized chat join through the platform route', async () => {
    const viewers = new WorldStore(new DatabaseSync(':memory:'));
    const gateway = new CommandGateway({
      executeCommand: async (command) => ({
        commandId: command.commandId,
        status: 'applied',
        tick: 2,
        events: [],
      }),
    }, { now: () => 1_000, newId: () => 'command-9' });

    app = createCommandServer({
      viewers,
      gateway,
      newViewerId: () => 'viewer-platform-1',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/platform/chat',
      payload: {
        platform: 'twitch',
        platformUserId: '9001',
        platformUsername: 'ada',
        displayName: 'Ada',
        messageId: 'chat-9001',
        text: '!join streamer 12 13',
        receivedAt: 1_000,
      },
    });

    expect(response.json()).toMatchObject({
      status: 'applied',
      viewerId: 'viewer-platform-1',
      result: { status: 'applied', tick: 2 },
    });
  });

  it('rejects a display name the server will not store', async () => {
    app = createCommandServer({
      viewers: directory(),
      gateway: new CommandGateway({
        executeCommand: async () => {
          throw new Error('simulation should not be called');
        },
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/viewers',
      payload: { displayName: '   ' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_viewer' });
  });
});
