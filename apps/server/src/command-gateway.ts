import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { COMMAND_PROTOCOL_VERSION } from '@simsand/shared';
import type {
  CommandIssuer,
  CommandRejectionReason,
  CommandResult,
  CommandSource,
  CommandType,
  DomainEvent,
  SimulationCommand,
} from '@simsand/shared';

const characterId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Must be 1-64 lowercase letters, digits or hyphens');
const coordinate = z.number().finite();

// Strict objects reject unknown keys, so a request cannot smuggle in its own
// issuer or other fields the server is meant to set.
const commandRequestSchema = z.strictObject({
  protocolVersion: z.literal(COMMAND_PROTOCOL_VERSION),
  command: z.discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('character.create'),
      params: z.strictObject({
        characterId,
        x: coordinate,
        y: coordinate,
        velocityX: z.number().min(-1).max(1).optional(),
        velocityY: z.number().min(-1).max(1).optional(),
        color: z.number().int().min(0).max(0xffffff).optional(),
      }),
    }),
    z.strictObject({
      type: z.literal('character.remove'),
      params: z.strictObject({ characterId }),
    }),
  ]),
});

// Viewers get no commands until viewer identity and character ownership exist.
const PERMISSIONS: Record<CommandSource, readonly CommandType[]> = {
  admin: ['character.create', 'character.remove'],
  streamer: ['character.create', 'character.remove'],
  system: ['character.create', 'character.remove'],
  viewer: [],
};

export interface CommandDispatcher {
  executeCommand(command: SimulationCommand): Promise<CommandResult>;
}

export interface CommandGatewayOptions {
  onEvents?: (events: DomainEvent[]) => void;
  now?: () => number;
  newId?: () => string;
}

export class CommandGateway {
  private readonly now: () => number;

  private readonly newId: () => string;

  constructor(
    private readonly dispatcher: CommandDispatcher,
    private readonly options: CommandGatewayOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? randomUUID;
  }

  async submit(input: unknown, issuer: CommandIssuer): Promise<CommandResult> {
    const commandId = this.newId();

    const reject = (reason: CommandRejectionReason, message: string): CommandResult => ({
      commandId,
      status: 'rejected',
      reason,
      message,
    });

    const version = (input as { protocolVersion?: unknown } | null)?.protocolVersion;

    if (version !== undefined && version !== COMMAND_PROTOCOL_VERSION) {
      return reject('unsupported_version', `Unsupported command protocol version: ${String(version)}`);
    }

    const parsed = commandRequestSchema.safeParse(input);

    if (!parsed.success) {
      return reject('invalid_command', z.prettifyError(parsed.error));
    }

    const request = parsed.data.command;

    if (!PERMISSIONS[issuer.source].includes(request.type)) {
      return reject('forbidden', `${issuer.source} issuers may not ${request.type}`);
    }

    const command = {
      ...request,
      commandId,
      issuer,
      submittedAt: this.now(),
    } as SimulationCommand;

    let result: CommandResult;

    try {
      result = await this.dispatcher.executeCommand(command);
    } catch (error) {
      return reject('simulation_unavailable', error instanceof Error ? error.message : String(error));
    }

    if (result.status === 'applied' && result.events.length > 0) {
      this.options.onEvents?.(result.events);
    }

    return result;
  }
}
