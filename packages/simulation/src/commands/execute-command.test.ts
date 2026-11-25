import { describe, expect, it } from 'vitest';

import { LIFECYCLE_STATES } from '@simsand/shared';
import type { SimulationCommand } from '@simsand/shared';

import { spriteIdFor } from '../characters/profile.js';
import { Lifecycle } from '../components/lifecycle.js';
import { createSimulationClock } from '../core/clock.js';
import { capturePersistedWorld } from '../core/persistence.js';
import { createSimulationWorld } from '../core/world.js';
import { createWorldSnapshot } from '../systems/snapshot.js';
import { executeCommand } from './execute-command.js';

const issuer = { source: 'admin', id: 'local-admin' } as const;

function create(characterId: string, x = 10, y = 20): SimulationCommand {
  return {
    commandId: `cmd-create-${characterId}`,
    issuer,
    submittedAt: 0,
    type: 'character.create',
    params: { characterId, x, y },
  };
}

function remove(characterId: string): SimulationCommand {
  return {
    commandId: `cmd-remove-${characterId}`,
    issuer,
    submittedAt: 0,
    type: 'character.remove',
    params: { characterId },
  };
}

function setup() {
  const world = createSimulationWorld();
  const clock = createSimulationClock();
  clock.tick = 42;
  clock.elapsedSeconds = 4.2;
  return { world, clock };
}

describe('executeCommand', () => {
  it('creates a character and emits character.created', () => {
    const { world, clock } = setup();

    const result = executeCommand(world, clock, create('visitor-0001'));

    expect(result).toMatchObject({ commandId: 'cmd-create-visitor-0001', status: 'applied', tick: 42 });
    expect(result.status === 'applied' && result.events).toEqual([
      {
        eventId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        type: 'character.created',
        version: 1,
        tick: 42,
        elapsedSeconds: 4.2,
        causedByCommandId: 'cmd-create-visitor-0001',
        payload: { characterId: 'visitor-0001', x: 10, y: 20 },
      },
    ]);
    expect(createWorldSnapshot(world, 0, 0).entities).toEqual([
      {
        id: 'visitor-0001',
        x: 10,
        y: 20,
        color: 0xffffff,
        sprite: spriteIdFor(0, 'visitor-0001'),
        resting: false,
        eating: false,
        drinking: false,
        working: false,
        lifecycle: 'alive',
        inventory: [],
      },
    ]);
    expect(createWorldSnapshot(world, 0, 0).nodes).toEqual([]);
  });

  it('removes a character and emits character.removed', () => {
    const { world, clock } = setup();
    executeCommand(world, clock, create('visitor-0001'));

    const result = executeCommand(world, clock, remove('visitor-0001'));

    expect(result.status).toBe('applied');
    expect(result.status === 'applied' && result.events.map((e) => [e.type, e.payload])).toEqual([
      ['character.removed', { characterId: 'visitor-0001' }],
    ]);
    expect(createWorldSnapshot(world, 0, 0).entities).toEqual([]);
  });

  it('rejects creating a character whose ID already exists', () => {
    const { world, clock } = setup();
    executeCommand(world, clock, create('visitor-0001'));

    expect(executeCommand(world, clock, create('visitor-0001'))).toEqual({
      commandId: 'cmd-create-visitor-0001',
      status: 'rejected',
      reason: 'character_exists',
      message: 'Character visitor-0001 already exists',
    });
  });

  it('rejects a position outside the world without changing it', () => {
    const { world, clock } = setup();

    expect(executeCommand(world, clock, create('visitor-0001', 65, 10))).toMatchObject({
      status: 'rejected',
      reason: 'out_of_bounds',
    });
    expect(world.entityIds.size).toBe(0);
  });

  it('lets one viewer own one character, including after that character dies', () => {
    const { world, clock } = setup();
    const viewer = { source: 'viewer' as const, id: 'viewer-1' };
    const owned = { ...create('ada'), issuer: viewer };

    expect(executeCommand(world, clock, owned).status).toBe('applied');
    expect(capturePersistedWorld(world, clock, world.seed).entities[0]?.viewerId).toBe('viewer-1');

    const eid = world.entityIds.get('ada');
    Lifecycle.state[eid!] = LIFECYCLE_STATES.indexOf('dead');

    expect(executeCommand(world, clock, { ...create('bea'), issuer: viewer, commandId: 'cmd-again' })).toEqual({
      commandId: 'cmd-again',
      status: 'rejected',
      reason: 'viewer_has_character',
      message: 'Viewer viewer-1 already has a character',
    });
    expect(world.entityIds.has('bea')).toBe(false);

    executeCommand(world, clock, remove('ada'));

    expect(executeCommand(world, clock, { ...create('bea'), issuer: viewer, commandId: 'cmd-after-remove' }).status).toBe('applied');
  });

  it('rejects a viewer id the server did not issue', () => {
    const { world, clock } = setup();

    expect(executeCommand(world, clock, {
      ...create('ada'),
      issuer: { source: 'viewer', id: 'twitch:123' },
    })).toMatchObject({ status: 'rejected', reason: 'invalid_issuer' });
    expect(world.entityIds.size).toBe(0);
  });

  it('leaves an admin-created character unowned', () => {
    const { world, clock } = setup();

    executeCommand(world, clock, create('visitor-0001'));

    expect(capturePersistedWorld(world, clock, world.seed).entities[0]?.viewerId).toBeNull();
  });

  it('rejects removing a character that does not exist', () => {
    const { world, clock } = setup();

    expect(executeCommand(world, clock, remove('character-9999'))).toMatchObject({
      status: 'rejected',
      reason: 'character_not_found',
    });
  });
});
