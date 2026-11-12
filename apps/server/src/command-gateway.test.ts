import { describe, expect, it, vi } from 'vitest';

import type { CommandIssuer, CommandResult, DomainEvent, SimulationCommand } from '@simsand/shared';

import { CommandGateway } from './command-gateway.js';
import type { CommandDispatcher } from './command-gateway.js';

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

function setup(result?: CommandResult | Error) {
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

  it('rejects commands the issuer is not permitted to send', async () => {
    const { gateway, sent } = setup();

    const result = await gateway.submit(createRequest, { source: 'viewer', id: 'twitch:123' });

    expect(result).toEqual({
      commandId: 'command-1',
      status: 'rejected',
      reason: 'forbidden',
      message: 'viewer issuers may not character.create',
    });
    expect(sent).toHaveLength(0);
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
