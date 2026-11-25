import { z } from 'zod';

import { PLATFORM_IDS } from '@simsand/shared';
import type { NormalizedChatMessage } from '@simsand/shared';

const platformUserId = z.string().min(1).max(64);
const name = z.string().min(1).max(64);
const messageId = z.string().min(1).max(128);
const text = z.string().max(500);

export const normalizedChatMessageSchema = z.strictObject({
  platform: z.enum(PLATFORM_IDS),
  platformUserId,
  platformUsername: name,
  displayName: name,
  messageId,
  text,
  receivedAt: z.number().finite(),
});

export function parseNormalizedChatMessage(input: unknown): NormalizedChatMessage {
  return normalizedChatMessageSchema.parse(input);
}