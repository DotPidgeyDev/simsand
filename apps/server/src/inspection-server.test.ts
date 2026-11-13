import { afterEach, describe, expect, it } from 'vitest';

import type { EntityInspection, SimulationStatus, WorldSnapshot } from '@simsand/shared';
import { actionAvailability, actionUtilities, derivedStats, emptyCooldowns, generateCharacterProfile } from '@simsand/simulation';

import { createInspectionServer } from './inspection-server.js';
import type { InspectionSource } from './inspection-server.js';

const status: SimulationStatus = {
  tick: 120,
  elapsedSeconds: 12,
  paused: false,
  population: 2,
  ticksRun: 120,
  ticksDropped: 0,
  recentTicks: 120,
  meanTickMs: 0.02,
  maxTickMs: 0.4,
};

const entity: EntityInspection = {
  id: 'character-0001',
  x: 1.5,
  y: 2.5,
  velocityX: 0.1,
  velocityY: -0.2,
  color: 0xff0000,
  sprite: 'wanderer',
  ...generateCharacterProfile(1, 'character-0001'),
  resting: false, eating: false, drinking: false,
  ageSeconds: 12,
  action: 'move',
  utilities: actionUtilities({
    ...generateCharacterProfile(1, 'character-0001').needs,
    curiosity: generateCharacterProfile(1, 'character-0001').personality.curiosity,
  }),
  cooldowns: emptyCooldowns(),
  available: actionAvailability({
    alive: true,
    ...generateCharacterProfile(1, 'character-0001').needs,
    cooldowns: emptyCooldowns(),
  }),
  derived: derivedStats(generateCharacterProfile(1, 'character-0001').attributes.constitution),
  tile: { x: 1, y: 2, terrain: 'grass' },
};

const snapshot: WorldSnapshot = {
  tick: 118,
  elapsedSeconds: 11.8,
  map: { width: 1, height: 1, tiles: [0] },
  entities: [
    { id: 'character-0001', x: 1.5, y: 2.5, color: 0xff0000, sprite: 'wanderer', resting: false, eating: false, drinking: false, lifecycle: 'alive' },
    { id: 'character-0002', x: 3, y: 4, color: 0x00ff00, sprite: 'wanderer', resting: false, eating: false, drinking: false, lifecycle: 'alive' },
  ],
};

function source(overrides: Partial<InspectionSource> = {}): InspectionSource {
  return {
    getStatus: async () => status,
    inspectEntity: async (id) => (id === entity.id ? entity : undefined),
    getSnapshot: () => snapshot,
    getServerInfo: () => ({
      startedAt: new Date(Date.now() - 90_000),
      browserClients: 3,
      lastSave: { tick: 100, savedAt: '2026-11-13T07:00:00.000Z' },
    }),
    ...overrides,
  };
}

describe('inspection server', () => {
  let app: ReturnType<typeof createInspectionServer> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('reports server and simulation status', async () => {
    app = createInspectionServer(source());

    const response = await app.inject({ method: 'GET', url: '/status' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      server: {
        uptimeSeconds: 90,
        browserClients: 3,
        lastSave: { tick: 100, savedAt: '2026-11-13T07:00:00.000Z' },
      },
      simulation: status,
    });
  });

  it('returns 503 when the simulation does not answer', async () => {
    app = createInspectionServer(source({
      getStatus: async () => { throw new Error('Simulation worker is not running'); },
    }));

    const response = await app.inject({ method: 'GET', url: '/status' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: 'simulation_unavailable',
      message: 'Simulation worker is not running',
    });
  });

  it('lists entity IDs and positions from the latest snapshot', async () => {
    app = createInspectionServer(source());

    const response = await app.inject({ method: 'GET', url: '/entities' });

    expect(response.json()).toEqual({
      tick: 118,
      count: 2,
      entities: [
        { id: 'character-0001', x: 1.5, y: 2.5 },
        { id: 'character-0002', x: 3, y: 4 },
      ],
    });
  });

  it('returns 503 for the entity list before the first snapshot', async () => {
    app = createInspectionServer(source({ getSnapshot: () => undefined }));

    const response = await app.inject({ method: 'GET', url: '/entities' });

    expect(response.statusCode).toBe(503);
  });

  it('returns the full state of one entity', async () => {
    app = createInspectionServer(source());

    const response = await app.inject({ method: 'GET', url: '/entities/character-0001' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(entity);
  });

  it('returns 404 for an unknown entity', async () => {
    app = createInspectionServer(source());

    const response = await app.inject({ method: 'GET', url: '/entities/nobody' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
  });

  it('does not accept writes', async () => {
    app = createInspectionServer(source());

    const response = await app.inject({ method: 'POST', url: '/entities/character-0001' });

    expect(response.statusCode).toBe(404);
  });
});
