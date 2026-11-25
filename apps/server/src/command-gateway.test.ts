import { describe, expect, it, vi } from 'vitest';

import type { CommandIssuer, CommandResult, DomainEvent, SimulationCommand } from '@simsand/shared';

import { CommandGateway } from './command-gateway.js';
import type { CommandDispatcher, CommandReceiptStore } from './command-gateway.js';

const admin: CommandIssuer = { source: 'admin', id: 'local-admin' };

const createRequest = {
  protocolVersion: 1,
  command: {
    type: 'character.create',
    params: { characterId: 'visitor-0001', x: 32, y: 32 },
  },
};

const createdEvent: DomainEvent = {
  eventId: 'event-1',
  type: 'character.created',
  version: 1,
  tick: 7,
  elapsedSeconds: 0.7,
  causedByCommandId: 'command-1',
  payload: { characterId: 'visitor-0001', x: 32, y: 32 },
};

function memoryReceipts(): CommandReceiptStore {
  const rows = new Map<string, { fingerprint: string; result: CommandResult }>();

  return {
    getReceipt(issuer, key) {
      return rows.get(`${issuer.source}:${issuer.id}:${key}`);
    },
    putReceipt(issuer, key, fingerprint, result) {
      rows.set(`${issuer.source}:${issuer.id}:${key}`, { fingerprint, result });
    },
  };
}

function setup(result?: CommandResult | Error, options: { receipts?: boolean; limit?: number } = {}) {
  const sent: SimulationCommand[] = [];
  const dispatcher: CommandDispatcher = {
    executeCommand: async (command) => {
      sent.push(command);
      if (result instanceof Error) throw result;
      return result ?? { commandId: command.commandId, status: 'applied', tick: 7, events: [createdEvent] };
    },
  };
  const onEvents = vi.fn();
  const gateway = new CommandGateway(dispatcher, {
    onEvents,
    now: () => 1_000,
    newId: () => 'command-1',
    receipts: options.receipts ? memoryReceipts() : undefined,
    rateLimit: options.limit === undefined ? undefined : { limit: options.limit, windowMs: 60_000 },
  });

  return { gateway, sent, onEvents };
}

describe('CommandGateway', () => {
  it('sends a valid command with server-assigned ID, issuer and time', async () => {
    const { gateway, sent, onEvents } = setup();

    const result = await gateway.submit(createRequest, admin);

    expect(result).toEqual({ commandId: 'command-1', status: 'applied', tick: 7, events: [createdEvent] });
    expect(sent).toEqual([
      {
        commandId: 'command-1',
        issuer: admin,
        submittedAt: 1_000,
        type: 'character.create',
        params: { characterId: 'visitor-0001', x: 32, y: 32 },
      },
    ]);
    expect(onEvents).toHaveBeenCalledWith([createdEvent]);
  });

  it('rejects an unsupported protocol version before parsing', async () => {
    const { gateway, sent } = setup();

    const result = await gateway.submit({ ...createRequest, protocolVersion: 2 }, admin);

    expect(result).toMatchObject({ status: 'rejected', reason: 'unsupported_version' });
    expect(sent).toHaveLength(0);
  });

  it.each([
    ['an unknown command type', { protocolVersion: 1, command: { type: 'world.destroy', params: {} } }],
    ['a missing parameter', { protocolVersion: 1, command: { type: 'character.remove', params: {} } }],
    ['an invalid character ID', { protocolVersion: 1, command: { type: 'character.remove', params: { characterId: 'Bad ID!' } } }],
    ['a non-finite coordinate', { ...createRequest, command: { ...createRequest.command, params: { characterId: 'a', x: Infinity, y: 1 } } }],
    ['a client-supplied issuer', { ...createRequest, command: { ...createRequest.command, issuer: { source: 'admin', id: 'x' } } }],
    ['a non-object body', 'character.create visitor-0001'],
  ])('rejects %s without contacting the simulation', async (_label, input) => {
    const { gateway, sent } = setup();

    const result = await gateway.submit(input, admin);

    expect(result).toMatchObject({ commandId: 'command-1', status: 'rejected', reason: 'invalid_command' });
    expect(sent).toHaveLength(0);
  });

  it('lets a viewer create a character and refuses removal', async () => {
    const { gateway, sent } = setup();
    const viewer = { source: 'viewer' as const, id: 'viewer-1' };

    const created = await gateway.submit(createRequest, viewer);

    expect(created.status).toBe('applied');
    expect(sent[0]?.issuer).toEqual(viewer);

    const removed = await gateway.submit({
      protocolVersion: 1,
      command: { type: 'character.remove', params: { characterId: 'visitor-0001' } },
    }, viewer);

    expect(removed).toEqual({
      commandId: 'command-1',
      status: 'rejected',
      reason: 'forbidden',
      message: 'viewer issuers may not character.remove',
    });
    expect(sent).toHaveLength(1);
  });

  it('passes simulation rejections through without emitting events', async () => {
    const rejection: CommandResult = {
      commandId: 'command-1',
      status: 'rejected',
      reason: 'character_exists',
      message: 'Character visitor-0001 already exists',
    };
    const { gateway, onEvents } = setup(rejection);

    expect(await gateway.submit(createRequest, admin)).toEqual(rejection);
    expect(onEvents).not.toHaveBeenCalled();
  });

  it('returns the first result when the same idempotency key is submitted again', async () => {
    const { gateway, sent, onEvents } = setup(undefined, { receipts: true });
    const keyed = { ...createRequest, idempotencyKey: 'create-ada' };

    const first = await gateway.submit(keyed, admin);
    const second = await gateway.submit(keyed, admin);

    expect(second).toEqual(first);
    expect(sent).toHaveLength(1);
    expect(onEvents).toHaveBeenCalledTimes(1);
  });

  it('refuses to reuse an idempotency key for a different command', async () => {
    const { gateway, sent } = setup(undefined, { receipts: true });

    await gateway.submit({ ...createRequest, idempotencyKey: 'create-ada' }, admin);
    const conflict = await gateway.submit({
      ...createRequest,
      idempotencyKey: 'create-ada',
      command: { type: 'character.create', params: { characterId: 'visitor-0002', x: 1, y: 1 } },
    }, admin);

    expect(conflict).toMatchObject({ status: 'rejected', reason: 'idempotency_conflict' });
    expect(sent).toHaveLength(1);
  });

  it('limits how many new commands one issuer can submit', async () => {
    const { gateway, sent } = setup(undefined, { receipts: true, limit: 2 });
    const keyed = { ...createRequest, idempotencyKey: 'create-ada' };

    await gateway.submit(keyed, admin);
    await gateway.submit({ ...createRequest, idempotencyKey: 'create-bea' }, admin);

    const limited = await gateway.submit({ ...createRequest, idempotencyKey: 'create-cy' }, admin);

    expect(limited).toMatchObject({
      status: 'rejected',
      reason: 'rate_limited',
      message: 'Too many commands from admin local-admin',
    });
    expect(sent).toHaveLength(2);
    expect((await gateway.submit(keyed, admin)).status).toBe('applied');
    expect(sent).toHaveLength(2);
  });

  it('fills in the bounty quantity and caps intervention quantities', async () => {
    const { gateway, sent } = setup();

    await gateway.submit({ protocolVersion: 1, command: { type: 'intervention.bounty', params: { x: 4, y: 5 } } }, admin);

    expect(sent[0]).toMatchObject({ type: 'intervention.bounty', params: { x: 4, y: 5, quantity: 3 } });
    expect(await gateway.submit({
      protocolVersion: 1,
      command: { type: 'intervention.gift', params: { characterId: 'ada', item: 'food', quantity: 6 } },
    }, admin)).toMatchObject({ status: 'rejected', reason: 'invalid_command' });
    expect(await gateway.submit({
      protocolVersion: 1,
      command: { type: 'intervention.curse', params: { characterId: 'ada', need: 'boredom' } },
    }, admin)).toMatchObject({ status: 'rejected', reason: 'invalid_command' });
    expect(sent).toHaveLength(1);
  });

  it('keeps interventions away from viewers', async () => {
    const { gateway, sent } = setup();
    const viewer = { source: 'viewer' as const, id: 'viewer-1' };

    const result = await gateway.submit({
      protocolVersion: 1,
      command: { type: 'intervention.bless', params: { characterId: 'ada' } },
    }, viewer);

    expect(result).toMatchObject({ status: 'rejected', reason: 'forbidden' });
    expect(sent).toHaveLength(0);
  });

  it('cools each issuer down after an applied intervention, not after a rejected one', async () => {
    let now = 0;
    let outcome: CommandResult['status'] = 'rejected';
    const sent: SimulationCommand[] = [];
    const gateway = new CommandGateway({
      executeCommand: async (command) => {
        sent.push(command);
        return outcome === 'applied'
          ? { commandId: command.commandId, status: 'applied', tick: 1, events: [] }
          : { commandId: command.commandId, status: 'rejected', reason: 'character_dead', message: 'dead' };
      },
    }, { now: () => now, newId: () => 'command-1', cooldowns: { 'intervention.bless': 30_000 } });
    const bless = { protocolVersion: 1, command: { type: 'intervention.bless', params: { characterId: 'ada' } } };
    const streamer = { source: 'streamer' as const, id: 'local-streamer' };

    expect((await gateway.submit(bless, streamer)).status).toBe('rejected');
    outcome = 'applied';
    expect((await gateway.submit(bless, streamer)).status).toBe('applied');

    now = 20_000;
    expect(await gateway.submit(bless, streamer)).toEqual({
      commandId: 'command-1',
      status: 'rejected',
      reason: 'on_cooldown',
      message: 'intervention.bless is available again in 10s',
    });
    expect((await gateway.submit(bless, admin)).status).toBe('applied');
    expect((await gateway.submit({
      protocolVersion: 1,
      command: { type: 'intervention.curse', params: { characterId: 'ada', need: 'thirst' } },
    }, streamer)).status).toBe('applied');

    now = 30_000;
    expect((await gateway.submit(bless, streamer)).status).toBe('applied');
    expect(sent).toHaveLength(5);
  });

  it('reports the simulation as unavailable when dispatch fails', async () => {
    const { gateway } = setup(new Error('Simulation worker is not running'));

    expect(await gateway.submit(createRequest, admin)).toEqual({
      commandId: 'command-1',
      status: 'rejected',
      reason: 'simulation_unavailable',
      message: 'Simulation worker is not running',
    });
  });
});
