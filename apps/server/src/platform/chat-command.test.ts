import { describe, expect, it } from 'vitest';

import { commandRequestBody, parseChatCommand } from './chat-command.js';

describe('parseChatCommand', () => {
  it('parses a join command', () => {
    expect(parseChatCommand('!join ada 32 45', 'msg-1')).toEqual({
      idempotencyKey: 'msg-1',
      command: { type: 'character.create', params: { characterId: 'ada', x: 32, y: 45 } },
    });
    expect(commandRequestBody(parseChatCommand('!join ada 32 45', 'msg-1')!)).toEqual({
      protocolVersion: 1,
      idempotencyKey: 'msg-1',
      command: { type: 'character.create', params: { characterId: 'ada', x: 32, y: 45 } },
    });
  });

  it('rejects a bad character id', () => {
    expect(parseChatCommand('!join Bad-ID! 1 2', 'msg-2')).toBeUndefined();
  });

  it('ignores other chat', () => {
    expect(parseChatCommand('hello world', 'msg-3')).toBeUndefined();
  });
});