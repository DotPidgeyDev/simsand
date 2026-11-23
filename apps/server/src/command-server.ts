import { randomUUID } from 'node:crypto';

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { VIEWER_ID_PATTERN } from '@simsand/shared';

import type { CommandGateway } from './command-gateway.js';
import type { ViewerRecord } from './world-store.js';

export interface ViewerDirectory {
  createViewer(viewer: ViewerRecord): void;
  getViewer(id: string): ViewerRecord | undefined;
}

const displayNameSchema = z.string().trim().min(1).max(64).regex(/^[\p{L}\p{N} .'_-]+$/u);

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

    return options.gateway.submit(request.body, { source: 'viewer', id: viewer.id });
  });

  return app;
}
