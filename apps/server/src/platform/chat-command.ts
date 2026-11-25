import { COMMAND_PROTOCOL_VERSION, VIEWER_ID_PATTERN } from '@simsand/shared';
import type { CommandRequest } from '@simsand/shared';

export interface ParsedChatCommand {
  idempotencyKey: string;
  command: CommandRequest;
}

const joinPattern = /^!join\s+(\S+)\s+(\S+)\s+(\S+)/u;

// The first viewer command channel. Platform adapters stay out of gameplay
// rules and only turn chat text into the shared command request shape.
export function parseChatCommand(text: string, messageId: string): ParsedChatCommand | undefined {
  const match = joinPattern.exec(text.trim());

  if (!match) return undefined;

  const characterId = match[1].toLowerCase();
  const x = Number(match[2]);
  const y = Number(match[3]);

  if (!VIEWER_ID_PATTERN.test(characterId) || !Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }

  return {
    idempotencyKey: messageId.slice(0, 64),
    command: {
      type: 'character.create',
      params: { characterId, x, y },
    },
  };
}

export function commandRequestBody(
  parsed: ParsedChatCommand,
): { protocolVersion: number; idempotencyKey: string; command: CommandRequest } {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    idempotencyKey: parsed.idempotencyKey,
    command: parsed.command,
  };
}