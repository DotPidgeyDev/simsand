import { DOMAIN_EVENT_VERSION } from '@simsand/shared';
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

function rejected(
  command: SimulationCommand,
  reason: Extract<CommandResult, { status: 'rejected' }>['reason'],
  message: string,
): CommandResult {
  return { commandId: command.commandId, status: 'rejected', reason, message };
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

      if (world.entityIds.has(characterId)) {
        return rejected(command, 'character_exists', `Character ${characterId} already exists`);
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
  }
}
