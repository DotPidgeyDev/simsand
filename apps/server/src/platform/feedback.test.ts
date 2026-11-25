import { describe, expect, it } from 'vitest';

import type { NormalizedChatMessage } from '@simsand/shared';

import { viewerFeedback } from './feedback.js';

const message = (username = 'ada'): NormalizedChatMessage => ({
  platform: 'twitch',
  platformUserId: '9001',
  platformUsername: username,
  displayName: 'Ada',
  messageId: 'msg-1',
  text: '!join villager 1 2',
  receivedAt: 1_000,
});

describe('viewerFeedback', () => {
  it('says nothing for ignored chat', () => {
    expect(viewerFeedback({ status: 'ignored' }, message())).toBeUndefined();
  });

  it('explains join usage', () => {
    expect(viewerFeedback({ status: 'invalid_chat_command' }, message())).toBe(
      '@ada Usage: !join <characterId> <x> <y>',
    );
  });

  it('welcomes an applied join with the character id', () => {
    expect(viewerFeedback({
      status: 'applied',
      viewerId: 'viewer-1',
      result: {
        commandId: 'command-1',
        status: 'applied',
        tick: 4,
        events: [{
          eventId: 'event-1',
          type: 'character.created',
          version: 1,
          tick: 4,
          elapsedSeconds: 0.4,
          payload: { characterId: 'villager', x: 1, y: 2 },
        }],
      },
    }, message())).toBe('@ada Welcome! villager has entered the world.');
  });

  it('explains a second-character refusal safely', () => {
    expect(viewerFeedback({
      status: 'rejected',
      viewerId: 'viewer-1',
      result: {
        commandId: 'command-2',
        status: 'rejected',
        reason: 'viewer_has_character',
        message: 'Viewer viewer-1 already has a character',
      },
    }, message())).toBe('@ada You already have a character in this world.');
  });

  it('does not echo ban internals', () => {
    expect(viewerFeedback({ status: 'banned', viewerId: 'viewer-1' }, message())).toBe(
      '@ada You cannot join right now.',
    );
  });
});
