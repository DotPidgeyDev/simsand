import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';

import { TwitchIrcAdapter } from './adapter.js';

describe('TwitchIrcAdapter.say', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a trimmed PRIVMSG when the socket is open', () => {
    const send = vi.fn();
    const adapter = new TwitchIrcAdapter({
      channel: '#SimSand',
      nick: 'bot',
      token: 'secret',
      onMessage: () => undefined,
    });

    (adapter as unknown as { socket: { readyState: number; send: typeof send } }).socket = {
      readyState: WebSocket.OPEN,
      send,
    };

    adapter.say('  @ada Welcome!  \n');

    expect(send).toHaveBeenCalledWith('PRIVMSG #simsand :@ada Welcome!');
  });

  it('does nothing when disconnected', () => {
    const adapter = new TwitchIrcAdapter({
      channel: 'simsand',
      nick: 'bot',
      token: 'secret',
      onMessage: () => undefined,
    });

    expect(() => adapter.say('@ada hi')).not.toThrow();
  });
});
