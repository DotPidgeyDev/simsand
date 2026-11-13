import { query } from 'bitecs';

import { ACTION_IDS, LIFECYCLE_STATES } from '@simsand/shared';
import type { ActionId } from '@simsand/shared';

import type { SimulationWorld } from '../core/world.js';

import { Action } from '../components/action.js';
import { Condition } from '../components/condition.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';
import { Personality } from '../components/personality.js';
import {
  FATIGUE_REST_AT,
  FATIGUE_RESUME_AT,
  HUNGER_EAT_AT,
  HUNGER_RESUME_AT,
  THIRST_DRINK_AT,
  THIRST_RESUME_AT,
} from './needs.js';

const DEAD = LIFECYCLE_STATES.indexOf('dead');

// Long enough that a character does not flicker between idle and move,
// short enough that the choice is visible.
export const MIN_ACTION_SECONDS = 5;

// Eat, drink and rest outrank wandering when the scores are equal.
const TIE_BREAK: readonly ActionId[] = ['eat', 'drink', 'rest', 'move', 'idle'];

export function actionUtilities(input: {
  hunger: number;
  thirst: number;
  fatigue: number;
  curiosity: number;
}): Record<ActionId, number> {
  const curiosity = Math.min(1, Math.max(0, input.curiosity));
  const comfort = 1 - Math.max(input.hunger, input.thirst, input.fatigue);

  return {
    idle: (1 - curiosity) * comfort,
    move: curiosity * comfort,
    eat: input.hunger,
    rest: input.fatigue,
    drink: input.thirst,
  };
}

export function chooseAction(utilities: Record<ActionId, number>): ActionId {
  return TIE_BREAK.reduce((best, id) => (utilities[id] > utilities[best] ? id : best));
}

export function assertActionId(value: unknown): ActionId {
  if (!(ACTION_IDS as readonly string[]).includes(String(value))) {
    throw new Error(`Unknown action: ${String(value)}`);
  }

  return value as ActionId;
}

function continueAction(
  action: ActionId,
  elapsed: number,
  hunger: number,
  thirst: number,
  fatigue: number,
): boolean {
  const urgent = (hunger >= HUNGER_EAT_AT && action !== 'eat')
    || (thirst >= THIRST_DRINK_AT && action !== 'drink')
    || (fatigue >= FATIGUE_REST_AT && action !== 'rest');

  if (urgent) return false;
  if (elapsed < MIN_ACTION_SECONDS) return true;
  if (action === 'eat') return hunger > HUNGER_RESUME_AT;
  if (action === 'drink') return thirst > THIRST_RESUME_AT;
  if (action === 'rest') return fatigue > FATIGUE_RESUME_AT;

  return false;
}

function applyAction(eid: number, action: ActionId): void {
  Condition.resting[eid] = action === 'rest' ? 1 : 0;
  Condition.eating[eid] = action === 'eat' ? 1 : 0;
  Condition.drinking[eid] = action === 'drink' ? 1 : 0;
}

// Runs after lifecycle and before needs. One action at a time: eating and
// drinking no longer happen together. A need at the old start threshold
// interrupts the current choice.
export function updateActions(world: SimulationWorld, deltaSeconds: number): void {
  const entities = query(world.ecs, [Action, Needs, Personality, Condition, Lifecycle]);

  for (const eid of entities) {
    if (Lifecycle.state[eid] === DEAD) {
      Action.kind[eid] = ACTION_IDS.indexOf('idle');
      Action.elapsed[eid] = 0;
      applyAction(eid, 'idle');
      continue;
    }

    const utilities = actionUtilities({
      hunger: Needs.hunger[eid],
      thirst: Needs.thirst[eid],
      fatigue: Needs.fatigue[eid],
      curiosity: Personality.curiosity[eid],
    });
    const current = ACTION_IDS[Action.kind[eid]] ?? 'move';

    if (
      Action.elapsed[eid] > 0
      && continueAction(current, Action.elapsed[eid], Needs.hunger[eid], Needs.thirst[eid], Needs.fatigue[eid])
    ) {
      Action.elapsed[eid] += deltaSeconds;
      applyAction(eid, current);
      continue;
    }

    const next = chooseAction(utilities);
    Action.kind[eid] = ACTION_IDS.indexOf(next);
    Action.elapsed[eid] = deltaSeconds;
    applyAction(eid, next);
  }
}
