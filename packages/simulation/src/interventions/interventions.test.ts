import { describe, expect, it } from 'vitest';

import { LIFECYCLE_STATES } from '@simsand/shared';
import type { SimulationCommand } from '@simsand/shared';

import { executeCommand } from '../commands/execute-command.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';
import { createSimulationClock } from '../core/clock.js';
import { createWorldMap } from '../core/map.js';
import { capturePersistedWorld, restorePersistedWorld } from '../core/persistence.js';
import { createSimulationWorld } from '../core/world.js';
import { heldQuantity } from '../economy/inventory.js';
import { economyViolations } from '../economy/invariants.js';
import { nodeKey } from '../economy/nodes.js';
import { createCharacter } from '../entities/create-character.js';
import { historyFor } from '../log/events.js';

const issuer = { source: 'streamer', id: 'local-streamer' } as const;

type InterventionRequest = Extract<SimulationCommand, { type: `intervention.${string}` }>;

function command(request: Pick<InterventionRequest, 'type' | 'params'>, id = 'cmd-1'): SimulationCommand {
  return { commandId: id, issuer, submittedAt: 0, ...request } as SimulationCommand;
}

function setup() {
  const map = createWorldMap(8, 8, 'grass');
  const world = createSimulationWorld(map, 1);
  const clock = createSimulationClock();
  const eid = createCharacter(world, {
    id: 'hero',
    x: 3.5,
    y: 2.5,
    velocityX: 0,
    velocityY: 0,
    color: 0xffffff,
    sprite: 'wanderer',
  });

  Needs.hunger[eid] = 0.5;
  Needs.thirst[eid] = 0.6;
  Needs.fatigue[eid] = 0.9;

  return { world, clock, eid };
}

describe('interventions', () => {
  it('blesses every need back to satisfied and logs who asked', () => {
    const { world, clock, eid } = setup();

    const result = executeCommand(world, clock, command({ type: 'intervention.bless', params: { characterId: 'hero' } }));

    expect([Needs.hunger[eid], Needs.thirst[eid], Needs.fatigue[eid]]).toEqual([0, 0, 0]);
    expect(historyFor(world, 'hero')).toEqual([
      {
        eventId: 'log-1',
        type: 'intervention.blessed',
        tick: 0,
        elapsedSeconds: 0,
        participants: ['hero'],
        location: { x: 3.5, y: 2.5 },
        payload: { commandId: 'cmd-1', issuer, target: 'hero' },
      },
    ]);
    expect(result).toMatchObject({
      status: 'applied',
      events: [{ type: 'intervention.applied', payload: { logEventId: 'log-1', logType: 'intervention.blessed' } }],
    });
  });

  it('curses one need up to its urgent line and leaves a worse need alone', () => {
    const { world, clock, eid } = setup();

    executeCommand(world, clock, command({ type: 'intervention.curse', params: { characterId: 'hero', need: 'hunger' } }));
    executeCommand(world, clock, command({ type: 'intervention.curse', params: { characterId: 'hero', need: 'fatigue' } }, 'cmd-2'));

    expect(Needs.hunger[eid]).toBe(0.8);
    expect(Needs.thirst[eid]).toBe(0.6);
    expect(Needs.fatigue[eid]).toBe(0.9);
    expect(historyFor(world, 'hero')).toMatchObject([
      { type: 'intervention.cursed', payload: { need: 'hunger', level: 0.8 } },
      { type: 'intervention.cursed', payload: { need: 'fatigue', level: 0.9 } },
    ]);
  });

  it('gifts items into the inventory', () => {
    const { world, clock } = setup();

    executeCommand(world, clock, command({ type: 'intervention.gift', params: { characterId: 'hero', item: 'food', quantity: 2 } }));

    expect(heldQuantity(world, 'hero', 'food')).toBe(2);
    expect(historyFor(world, 'hero')).toMatchObject([
      { type: 'intervention.gifted', payload: { target: 'hero', item: 'food', quantity: 2 } },
    ]);
    expect(economyViolations(world)).toEqual([]);
  });

  it('refuses missing and dead targets without logging anything', () => {
    const { world, clock, eid } = setup();

    expect(executeCommand(world, clock, command({ type: 'intervention.bless', params: { characterId: 'nobody' } })))
      .toMatchObject({ status: 'rejected', reason: 'character_not_found' });

    Lifecycle.state[eid] = LIFECYCLE_STATES.indexOf('dead');

    expect(executeCommand(world, clock, command({ type: 'intervention.gift', params: { characterId: 'hero', item: 'goods', quantity: 1 } })))
      .toMatchObject({ status: 'rejected', reason: 'character_dead' });
    expect(heldQuantity(world, 'hero', 'goods')).toBe(0);
    expect(world.log).toEqual([]);
  });

  it('adds a bounty to a pile that is there', () => {
    const { world, clock } = setup();
    const key = nodeKey(8, 5, 5);
    world.nodes.set(key, { x: 5, y: 5, item: 'material', quantity: 1 });

    executeCommand(world, clock, command({ type: 'intervention.bounty', params: { x: 5, y: 5, quantity: 3 } }));

    expect(world.nodes.get(key)).toEqual({ x: 5, y: 5, item: 'material', quantity: 4 });
    expect(world.log).toMatchObject([
      { type: 'intervention.bounty', participants: [], location: { x: 5.5, y: 5.5 }, payload: { item: 'material', quantity: 3 } },
    ]);
  });

  it('brings a depleted pile back early with the bounty', () => {
    const { world, clock } = setup();
    const key = nodeKey(8, 5, 5);
    world.returning.set(key, 999);

    executeCommand(world, clock, command({ type: 'intervention.bounty', params: { x: 5, y: 5, quantity: 2 } }));

    expect(world.returning.has(key)).toBe(false);
    expect(world.nodes.get(key)).toEqual({ x: 5, y: 5, item: 'material', quantity: 2 });
    expect(economyViolations(world)).toEqual([]);
  });

  it('refuses a bounty on a tile that is not a pile site or is off the map', () => {
    const { world, clock } = setup();

    expect(executeCommand(world, clock, command({ type: 'intervention.bounty', params: { x: 1, y: 1, quantity: 3 } })))
      .toMatchObject({ status: 'rejected', reason: 'tile_unavailable' });
    expect(executeCommand(world, clock, command({ type: 'intervention.bounty', params: { x: 8, y: 0, quantity: 3 } })))
      .toMatchObject({ status: 'rejected', reason: 'out_of_bounds' });
    expect(world.nodes.size).toBe(0);
    expect(world.log).toEqual([]);
  });

  it('keeps intervention facts through a save and restore', () => {
    const { world, clock } = setup();
    executeCommand(world, clock, command({ type: 'intervention.bless', params: { characterId: 'hero' } }));

    const restored = restorePersistedWorld(capturePersistedWorld(world, clock, 1));

    expect(historyFor(restored.world, 'hero')).toEqual(historyFor(world, 'hero'));
  });
});
