import { randomUUID } from 'node:crypto';

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { PLATFORM_IDS, VIEWER_ID_PATTERN } from '@simsand/shared';

import type { CommandGateway } from './command-gateway.js';
import { parseNormalizedChatMessage } from './platform/normalize.js';
import { processChatMessage, type PlatformViewerDirectory } from './platform/process-chat.js';
import type { ModerationAction, ViewerRecord } from './world-store.js';

export interface ViewerDirectory extends PlatformViewerDirectory {
  createViewer(viewer: ViewerRecord): void;
  getViewer(id: string): ViewerRecord | undefined;
  banViewer(viewerId: string, reason: string, actor: string, at: string): ModerationAction;
  unbanViewer(viewerId: string, reason: string, actor: string, at: string): ModerationAction;
  banPlatform(
    platform: (typeof PLATFORM_IDS)[number],
    platformUserId: string,
    reason: string,
    actor: string,
    at: string,
    platformUsername?: string,
    newViewerId?: () => string,
  ): ModerationAction;
  unbanPlatform(
    platform: (typeof PLATFORM_IDS)[number],
    platformUserId: string,
    reason: string,
    actor: string,
    at: string,
  ): ModerationAction;
  listModerationActions(limit?: number): ModerationAction[];
}

const displayNameSchema = z.string().trim().min(1).max(64).regex(/^[\p{L}\p{N} .'_-]+$/u);
const reasonSchema = z.string().trim().min(1).max(200);
const LOCAL_ADMIN = 'local-admin';

const banBodySchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('viewer'),
    viewerId: z.string().regex(VIEWER_ID_PATTERN),
    reason: reasonSchema,
  }),
  z.strictObject({
    type: z.literal('platform'),
    platform: z.enum(PLATFORM_IDS),
    platformUserId: z.string().min(1).max(64),
    platformUsername: z.string().min(1).max(64).optional(),
    reason: reasonSchema,
  }),
]);

// Local only, until a platform adapter authenticates the viewer. The
// command body cannot name the issuer. The server uses the viewer id
// from the route, and only after that viewer was registered here.
export function createCommandServer(options: {
  viewers: ViewerDirectory;
  gateway: CommandGateway;
  now?: () => Date;
  newViewerId?: () => string;
}): FastifyInstance {
  const now = options.now ?? (() => new Date());
  const newViewerId = options.newViewerId ?? (() => `viewer-${randomUUID().replace(/-/g, '')}`);
  const app = Fastify({ logger: false });

  app.post('/viewers', async (request, reply) => {
    const parsed = z.strictObject({ displayName: displayNameSchema }).safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_viewer',
        message: z.prettifyError(parsed.error),
      });
    }

    const viewer: ViewerRecord = {
      id: newViewerId(),
      displayName: parsed.data.displayName,
      createdAt: now().toISOString(),
      status: 'active',
    };

    options.viewers.createViewer(viewer);
    return reply.code(201).send(viewer);
  });

  app.post<{ Params: { id: string } }>('/viewers/:id/commands', async (request, reply) => {
    if (!VIEWER_ID_PATTERN.test(request.params.id)) {
      return reply.code(404).send({ error: 'not_found', message: 'No viewer with that id' });
    }

    const viewer = options.viewers.getViewer(request.params.id);

    if (!viewer) {
      return reply.code(404).send({ error: 'not_found', message: `No viewer with id ${request.params.id}` });
    }

    if (viewer.status === 'banned') {
      return {
        commandId: randomUUID(),
        status: 'rejected',
        reason: 'banned',
        message: `Viewer ${viewer.id} is banned`,
      };
    }

    return options.gateway.submit(request.body, { source: 'viewer', id: viewer.id });
  });

  app.post('/platform/chat', async (request, reply) => {
    let message;

    try {
      message = parseNormalizedChatMessage(request.body);
    } catch (error) {
      return reply.code(400).send({
        error: 'invalid_message',
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const outcome = await processChatMessage(message, options.viewers, options.gateway, {
      now: () => now().toISOString(),
      newViewerId,
    });

    return outcome;
  });

  app.post('/moderation/bans', async (request, reply) => {
    const parsed = banBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_ban',
        message: z.prettifyError(parsed.error),
      });
    }

    const at = now().toISOString();

    try {
      if (parsed.data.type === 'viewer') {
        return reply.code(201).send(
          options.viewers.banViewer(parsed.data.viewerId, parsed.data.reason, LOCAL_ADMIN, at),
        );
      }

      return reply.code(201).send(
        options.viewers.banPlatform(
          parsed.data.platform,
          parsed.data.platformUserId,
          parsed.data.reason,
          LOCAL_ADMIN,
          at,
          parsed.data.platformUsername,
          newViewerId,
        ),
      );
    } catch (error) {
      return reply.code(404).send({
        error: 'not_found',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post('/moderation/unbans', async (request, reply) => {
    const parsed = banBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_unban',
        message: z.prettifyError(parsed.error),
      });
    }

    const at = now().toISOString();

    try {
      if (parsed.data.type === 'viewer') {
        return reply.code(201).send(
          options.viewers.unbanViewer(parsed.data.viewerId, parsed.data.reason, LOCAL_ADMIN, at),
        );
      }

      return reply.code(201).send(
        options.viewers.unbanPlatform(
          parsed.data.platform,
          parsed.data.platformUserId,
          parsed.data.reason,
          LOCAL_ADMIN,
          at,
        ),
      );
    } catch (error) {
      return reply.code(404).send({
        error: 'not_found',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/moderation/actions', async () => ({
    actions: options.viewers.listModerationActions(),
  }));

  return app;
}
