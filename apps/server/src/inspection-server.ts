import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

import type { EntityInspection, SimulationLogEvent, SimulationStatus, WorldSnapshot } from '@simsand/shared';
import { chronicleFromEvents } from '@simsand/simulation';

export interface ServerInfo {
  startedAt: Date;
  browserClients: number;
  lastSave: { tick: number; savedAt: string } | undefined;
}

export interface InspectionSource {
  getStatus(): Promise<SimulationStatus>;
  inspectEntity(id: string): Promise<EntityInspection | undefined>;
  inspectHistory(id: string): Promise<SimulationLogEvent[] | undefined>;
  getSnapshot(): WorldSnapshot | undefined;
  getServerInfo(): ServerInfo;
}

function unavailable(error: unknown) {
  return {
    error: 'simulation_unavailable',
    message: error instanceof Error ? error.message : String(error),
  };
}

// Read-only. It must only be bound to a local interface until it has
// authentication.
export function createInspectionServer(source: InspectionSource): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/status', async (_request, reply) => {
    const info = source.getServerInfo();

    let simulation: SimulationStatus;

    try {
      simulation = await source.getStatus();
    } catch (error) {
      return reply.code(503).send(unavailable(error));
    }

    return {
      server: {
        uptimeSeconds: Math.round((Date.now() - info.startedAt.getTime()) / 1000),
        browserClients: info.browserClients,
        lastSave: info.lastSave ?? null,
      },
      simulation,
    };
  });

  app.get('/entities', async (_request, reply) => {
    const snapshot = source.getSnapshot();

    if (!snapshot) {
      return reply.code(503).send(unavailable('No world snapshot is available yet'));
    }

    return {
      tick: snapshot.tick,
      count: snapshot.entities.length,
      entities: snapshot.entities.map(({ id, x, y }) => ({ id, x, y })),
    };
  });

  app.get<{ Params: { id: string } }>('/entities/:id/history', async (request, reply) => {
    let events: SimulationLogEvent[] | undefined;

    try {
      events = await source.inspectHistory(request.params.id);
    } catch (error) {
      return reply.code(503).send(unavailable(error));
    }

    if (!events) {
      return reply.code(404).send({ error: 'not_found', message: `No entity with ID ${request.params.id}` });
    }

    return { id: request.params.id, count: events.length, events };
  });

  // Presentation over the same retained+live history. Scoring stays here;
  // the simulation does not store chronicle rows.
  app.get<{ Params: { id: string } }>('/entities/:id/chronicle', async (request, reply) => {
    let events: SimulationLogEvent[] | undefined;

    try {
      events = await source.inspectHistory(request.params.id);
    } catch (error) {
      return reply.code(503).send(unavailable(error));
    }

    if (!events) {
      return reply.code(404).send({ error: 'not_found', message: `No entity with ID ${request.params.id}` });
    }

    const entries = chronicleFromEvents(events);

    return { id: request.params.id, count: entries.length, entries };
  });

  app.get<{ Params: { id: string } }>('/entities/:id', async (request, reply) => {
    let entity: EntityInspection | undefined;

    try {
      entity = await source.inspectEntity(request.params.id);
    } catch (error) {
      return reply.code(503).send(unavailable(error));
    }

    if (!entity) {
      return reply.code(404).send({ error: 'not_found', message: `No entity with ID ${request.params.id}` });
    }

    return entity;
  });

  return app;
}
