import { describe, expect, it } from 'vitest';

import type { CommandResult, NormalizedChatMessage } from '@simsand/shared';

import { CommandGateway } from '../command-gateway.js';
import type { ViewerRecord } from '../world-store.js';
import { processChatMessage } from './process-chat.js';

const message = (text: string, platformUserId = '9001'): NormalizedChatMessage => ({
  platform: 'twitch',
  platformUserId,
  platformUsername: 'ada',
  displayName: 'Ada',
  messageId: `msg-${platformUserId}`,
  text,
  receivedAt: 1_000,
});

describe('processChatMessage', () => {
  it('creates a viewer and submits join for a new platform account', async () => {
    const viewers = new Map<string, ViewerRecord>();
    const gateway = new CommandGateway({
      executeCommand: async (command) => ({
        commandId: command.commandId,
        status: 'applied',
        tick: 1,
        events: [],
      }),
    });

    const outcome = await processChatMessage(message('!join villager 5 6'), {
      ensureViewerForPlatform(_platform, platformUserId, _username, displayName, now, newViewerId) {
        const id = newViewerId();
        const viewer: ViewerRecord = { id, displayName, createdAt: now(), status: 'active' };
        viewers.set(platformUserId, viewer);
        return viewer;
      },
    }, gateway, {
      now: () => '2026-11-23T00:00:00.000Z',
      newViewerId: () => 'viewer-test1',
    });

    expect(outcome).toMatchObject({ status: 'applied', viewerId: 'viewer-test1' });
    expect(viewers.get('9001')?.displayName).toBe('Ada');
  });

  it('ignores chat that is not join', async () => {
    const gateway = new CommandGateway({
      executeCommand: async (): Promise<CommandResult> => {
        throw new Error('should not run');
      },
    });

    expect(await processChatMessage(message('hello'), {
      ensureViewerForPlatform() {
        throw new Error('should not register');
      },
    }, gateway, {
      now: () => '2026-11-23T00:00:00.000Z',
      newViewerId: () => 'viewer-test1',
    })).toEqual({ status: 'ignored' });
  });
});