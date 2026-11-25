import type { CommandResult, NormalizedChatMessage } from '@simsand/shared';

import type { ChatCommandOutcome } from './process-chat.js';

// Short, safe replies for chat. Keep diagnostic detail out of the message.
export function viewerFeedback(
  outcome: ChatCommandOutcome,
  message: NormalizedChatMessage,
): string | undefined {
  const who = mention(message.platformUsername);

  switch (outcome.status) {
    case 'ignored':
      return undefined;
    case 'invalid_chat_command':
      return `${who} Usage: !join <characterId> <x> <y>`;
    case 'banned':
      return `${who} You cannot join right now.`;
    case 'applied': {
      const characterId = characterIdFrom(outcome.result);
      return characterId
        ? `${who} Welcome! ${characterId} has entered the world.`
        : `${who} Welcome! Your character has entered the world.`;
    }
    case 'rejected':
      return outcome.result.status === 'rejected'
        ? `${who} ${friendlyRejection(outcome.result)}`
        : `${who} That join did not work. Try again.`;
  }
}

function mention(platformUsername: string): string {
  return `@${platformUsername.replace(/^@/, '')}`;
}

function characterIdFrom(result: CommandResult): string | undefined {
  if (result.status !== 'applied') return undefined;

  const created = result.events.find((event) => event.type === 'character.created');

  return created?.type === 'character.created' ? created.payload.characterId : undefined;
}

function friendlyRejection(result: Extract<CommandResult, { status: 'rejected' }>): string {
  switch (result.reason) {
    case 'viewer_has_character':
      return 'You already have a character in this world.';
    case 'character_exists':
      return 'That character id is already taken. Try another.';
    case 'out_of_bounds':
      return 'That position is outside the world. Pick coordinates on the map.';
    case 'rate_limited':
      return 'Too many commands. Wait a moment and try again.';
    case 'idempotency_conflict':
      return 'That chat command was already used for something else.';
    case 'banned':
      return 'You cannot join right now.';
    case 'forbidden':
      return 'That command is not allowed.';
    case 'invalid_command':
    case 'unsupported_version':
    case 'invalid_issuer':
      return 'That join command could not be understood.';
    case 'simulation_unavailable':
      return 'The world is busy. Try again in a moment.';
    case 'character_not_found':
      return 'That character was not found.';
    default:
      return 'That join did not work. Try again.';
  }
}
