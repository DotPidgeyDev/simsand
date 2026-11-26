import { DOMAIN_EVENT_VERSION, VIEWER_ID_PATTERN } from '@simsand/shared';
import type {
  CommandResult,
  DomainEvent,
  SimulationCommand,
} from '@simsand/shared';

import type { SimulationClock } from '../core/clock.js';
import type { SimulationWorld } from '../core/world.js';
import { generateCharacterProfile, spriteIdFor } from '../characters/profile.js';
import { createCharacter } from '../entities/create-character.js';
import { removeCharacter } from '../entities/remove-character.js';
import { blessCharacter } from '../interventions/bless.js';
import { placeBounty } from '../interventions/bounty.js';
import { curseCharacter } from '../interventions/curse.js';
import { giftCharacter } from '../interventions/gift.js';
import type { InterventionCause, InterventionOutcome } from '../interventions/outcome.js';

const DEFAULT_COLOR = 0xffffff;

type EventFor<TType extends DomainEvent['type']> = Extract<DomainEvent, { type: TType }>;

function event<TType extends DomainEvent['type']>(
  type: TType,
  payload: EventFor<TType>['payload'],
  clock: SimulationClock,
  command: SimulationCommand,
): EventFor<TType> {
  return {
    eventId: crypto.randomUUID(),
    type,
    version: DOMAIN_EVENT_VERSION,
    tick: clock.tick,
    elapsedSeconds: clock.elapsedSeconds,
    causedByCommandId: command.commandId,
    payload,
  } as EventFor<TType>;
}

// Only a viewer create is owned. The id is the one the server put on the
// issuer. A request cannot supply it. Undefined means the id is unusable.
function viewerFor(command: SimulationCommand): string | null | undefined {
  if (command.issuer.source !== 'viewer') return null;

  return VIEWER_ID_PATTERN.test(command.issuer.id) ? command.issuer.id : undefined;
}

function rejected(
  command: SimulationCommand,
  reason: Extract<CommandResult, { status: 'rejected' }>['reason'],
  message: string,
): CommandResult {
  return { commandId: command.commandId, status: 'rejected', reason, message };
}

function causeOf(command: SimulationCommand): InterventionCause {
  const cause: InterventionCause = { commandId: command.commandId, issuer: command.issuer };

  if (command.reason) cause.reason = command.reason;

  return cause;
}

function interventionResult(
  command: SimulationCommand,
  clock: SimulationClock,
  outcome: InterventionOutcome,
): CommandResult {
  if (outcome.status === 'rejected') return rejected(command, outcome.reason, outcome.message);

  return {
    commandId: command.commandId,
    status: 'applied',
    tick: clock.tick,
    events: [
      event('intervention.applied', { logEventId: outcome.event.eventId, logType: outcome.event.type }, clock, command),
    ],
  };
}

// Gameplay validation happens here; the server has already checked syntax
// and permissions. Must run between ticks.
export function executeCommand(
  world: SimulationWorld,
  clock: SimulationClock,
  command: SimulationCommand,
): CommandResult {
  switch (command.type) {
    case 'character.create': {
      const { characterId, x, y, velocityX = 0, velocityY = 0, color = DEFAULT_COLOR } = command.params;
      const viewerId = viewerFor(command);

      if (typeof viewerId !== 'string' && viewerId !== null) {
        return rejected(command, 'invalid_issuer', 'Viewer id is not a server-issued id');
      }

      if (world.entityIds.has(characterId)) {
        return rejected(command, 'character_exists', `Character ${characterId} already exists`);
      }

      if (viewerId !== null && world.characterByViewer.has(viewerId)) {
        return rejected(
          command,
          'viewer_has_character',
          `Viewer ${viewerId} already has a character`,
        );
      }

      if (x < 0 || x > world.map.width || y < 0 || y > world.map.height) {
        return rejected(command, 'out_of_bounds', `Position (${x}, ${y}) is outside the world`);
      }

      createCharacter(world, {
        id: characterId,
        x,
        y,
        velocityX,
        velocityY,
        color,
        sprite: spriteIdFor(world.seed, characterId),
        ...generateCharacterProfile(world.seed, characterId),
        viewerId,
      });

      return {
        commandId: command.commandId,
        status: 'applied',
        tick: clock.tick,
        events: [event('character.created', { characterId, x, y }, clock, command)],
      };
    }

    case 'character.remove': {
      const { characterId } = command.params;

      if (!removeCharacter(world, characterId)) {
        return rejected(command, 'character_not_found', `Character ${characterId} does not exist`);
      }

      return {
        commandId: command.commandId,
        status: 'applied',
        tick: clock.tick,
        events: [event('character.removed', { characterId }, clock, command)],
      };
    }

    case 'intervention.bless': {
      return interventionResult(command, clock, blessCharacter(world, command.params.characterId, causeOf(command)));
    }

    case 'intervention.curse': {
      const { characterId, need } = command.params;

      return interventionResult(command, clock, curseCharacter(world, characterId, need, causeOf(command)));
    }

    case 'intervention.bounty': {
      const { x, y, quantity } = command.params;

      return interventionResult(command, clock, placeBounty(world, x, y, quantity, causeOf(command)));
    }

    case 'intervention.gift': {
      const { characterId, item, quantity } = command.params;

      return interventionResult(command, clock, giftCharacter(world, characterId, item, quantity, causeOf(command)));
    }
  }
}
