import { describe, expect, it } from 'vitest';

import { parseTwitchPrivmsg } from './parse-irc.js';

describe('parseTwitchPrivmsg', () => {
  it('reads user id and text from tagged PRIVMSG', () => {
    const line = '@badge-info=;display-name=Ada;id=abc-123;login=ada;user-id=9001 :ada!ada@ada.tmi.twitch.tv PRIVMSG #simsand :!join villager 10 20';

    expect(parseTwitchPrivmsg(line, 1_000)).toEqual({
      platform: 'twitch',
      platformUserId: '9001',
      platformUsername: 'ada',
      displayName: 'Ada',
      messageId: 'abc-123',
      text: '!join villager 10 20',
      receivedAt: 1_000,
    });
  });

  it('falls back to the login when tags are missing', () => {
    const line = ':ada!ada@ada.tmi.twitch.tv PRIVMSG #simsand :hello';

    expect(parseTwitchPrivmsg(line, 2_000)).toMatchObject({
      platformUserId: 'ada',
      platformUsername: 'ada',
      text: 'hello',
    });
  });
});