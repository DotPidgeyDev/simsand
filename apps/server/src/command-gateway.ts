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
const idempotencyKey = characterId;
const coordinate = z.number().finite();

// Strict objects reject unknown keys, so a request cannot smuggle in its own
// issuer or other fields the server is meant to set.
const commandRequestSchema = z.strictObject({
  protocolVersion: z.literal(COMMAND_PROTOCOL_VERSION),
  idempotencyKey: idempotencyKey.optional(),
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

// A viewer may create the one character they own. Removal stays with
// admin, streamer, and system.
const PERMISSIONS: Record<CommandSource, readonly CommandType[]> = {
  admin: ['character.create', 'character.remove'],
  streamer: ['character.create', 'character.remove'],
  system: ['character.create', 'character.remove'],
  viewer: ['character.create'],
};

export interface CommandDispatcher {
  executeCommand(command: SimulationCommand): Promise<CommandResult>;
}

export interface CommandReceipt {
  fingerprint: string;
  result: CommandResult;
}

// Remembered by issuer and key. A retry returns the stored result. The
// character log is a different record and is not this store.
export interface CommandReceiptStore {
  getReceipt(issuer: CommandIssuer, key: string, now: number): CommandReceipt | undefined;
  putReceipt(
    issuer: CommandIssuer,
    key: string,
    fingerprint: string,
    result: CommandResult,
    now: number,
  ): void;
}

export interface CommandRateLimit {
  limit: number;
  windowMs: number;
}

export interface CommandGatewayOptions {
  onEvents?: (events: DomainEvent[]) => void;
  now?: () => number;
  newId?: () => string;
  receipts?: CommandReceiptStore;
  rateLimit?: CommandRateLimit;
}

export class CommandGateway {
  private readonly now: () => number;

  private readonly newId: () => string;

  private readonly attempts = new Map<string, number[]>();

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
    const key = parsed.data.idempotencyKey;
    const fingerprint = JSON.stringify(request);
    const submittedAt = this.now();

    if (key && this.options.receipts) {
      let existing: CommandReceipt | undefined;

      try {
        existing = this.options.receipts.getReceipt(issuer, key, submittedAt);
      } catch (error) {
        return reject('simulation_unavailable', error instanceof Error ? error.message : String(error));
      }

      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          return reject('idempotency_conflict', 'Idempotency key was already used for a different command');
        }

        return existing.result;
      }
    }

    if (!this.allow(issuer, submittedAt)) {
      return reject('rate_limited', `Too many commands from ${issuer.source} ${issuer.id}`);
    }

    if (!PERMISSIONS[issuer.source].includes(request.type)) {
      return reject('forbidden', `${issuer.source} issuers may not ${request.type}`);
    }

    const command = {
      ...request,
      commandId,
      issuer,
      submittedAt,
    } as SimulationCommand;

    let result: CommandResult;

    try {
      result = await this.dispatcher.executeCommand(command);
    } catch (error) {
      return reject('simulation_unavailable', error instanceof Error ? error.message : String(error));
    }

    if (key && this.options.receipts) {
      try {
        this.options.receipts.putReceipt(issuer, key, fingerprint, result, submittedAt);
      } catch (error) {
        return reject('simulation_unavailable', error instanceof Error ? error.message : String(error));
      }
    }

    if (result.status === 'applied' && result.events.length > 0) {
      this.options.onEvents?.(result.events);
    }

    return result;
  }

  // One window per issuer. A remembered retry does not take a slot.
  private allow(issuer: CommandIssuer, at: number): boolean {
    const policy = this.options.rateLimit;

    if (!policy) return true;

    const bucket = `${issuer.source}\0${issuer.id}`;
    const recent = (this.attempts.get(bucket) ?? []).filter((time) => at - time < policy.windowMs);

    if (recent.length >= policy.limit) {
      this.attempts.set(bucket, recent);
      return false;
    }

    recent.push(at);
    this.attempts.set(bucket, recent);
    return true;
  }
}
