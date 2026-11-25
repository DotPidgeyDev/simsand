import type { CommandResult, NormalizedChatMessage } from '@simsand/shared';

import type { CommandGateway } from '../command-gateway.js';
import type { ViewerRecord } from '../world-store.js';
import { commandRequestBody, parseChatCommand } from './chat-command.js';

export interface PlatformViewerDirectory {
  ensureViewerForPlatform(
    platform: NormalizedChatMessage['platform'],
    platformUserId: string,
    platformUsername: string,
    displayName: string,
    now: () => string,
    newViewerId: () => string,
  ): ViewerRecord;
}

export type ChatCommandOutcome =
  | { status: 'ignored' }
  | { status: 'invalid_chat_command' }
  | { status: 'banned'; viewerId: string }
  | { status: 'applied' | 'rejected'; viewerId: string; result: CommandResult };

export async function processChatMessage(
  message: NormalizedChatMessage,
  viewers: PlatformViewerDirectory,
  gateway: CommandGateway,
  deps: {
    now: () => string;
    newViewerId: () => string;
  },
): Promise<ChatCommandOutcome> {
  const trimmed = message.text.trim();

  if (!trimmed.toLowerCase().startsWith('!join')) {
    return { status: 'ignored' };
  }

  const parsed = parseChatCommand(trimmed, message.messageId);

  if (!parsed) {
    return { status: 'invalid_chat_command' };
  }

  const viewer = viewers.ensureViewerForPlatform(
    message.platform,
    message.platformUserId,
    message.platformUsername,
    message.displayName,
    deps.now,
    deps.newViewerId,
  );

  if (viewer.status === 'banned') {
    return { status: 'banned', viewerId: viewer.id };
  }

  const result = await gateway.submit(commandRequestBody(parsed), {
    source: 'viewer',
    id: viewer.id,
  });

  return {
    status: result.status,
    viewerId: viewer.id,
    result,
  };
}
