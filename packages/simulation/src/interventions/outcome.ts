import { LIFECYCLE_STATES } from '@simsand/shared';
import type { CommandIssuer, CommandRejectionReason, DirectorReason, InterventionLogEvent } from '@simsand/shared';

import { Lifecycle } from '../components/lifecycle.js';
import type { SimulationWorld } from '../core/world.js';

export type InterventionOutcome =
  | { status: 'applied'; event: InterventionLogEvent }
  | { status: 'rejected'; reason: CommandRejectionReason; message: string };

export interface InterventionCause {
  commandId: string;
  issuer: CommandIssuer;
  reason?: DirectorReason;
}

export function refuse(reason: CommandRejectionReason, message: string): InterventionOutcome {
  return { status: 'rejected', reason, message };
}

const DEAD = LIFECYCLE_STATES.indexOf('dead');

// Interventions act on the living. A corpse keeps what it had.
export function livingTarget(
  world: SimulationWorld,
  characterId: string,
): { eid: number } | InterventionOutcome {
  const eid = world.entityIds.get(characterId);

  if (eid === undefined) {
    return refuse('character_not_found', `Character ${characterId} does not exist`);
  }

  if (Lifecycle.state[eid] === DEAD) {
    return refuse('character_dead', `Character ${characterId} is dead`);
  }

  return { eid };
}
