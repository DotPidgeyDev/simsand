import { query } from 'bitecs';

import { ACTION_IDS, LIFECYCLE_STATES } from '@simsand/shared';
import type { ActionCooldowns, ActionId } from '@simsand/shared';

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

// An interrupted action sits out about as long as a recovery takes to matter,
// so thirst cannot yank someone off a meal and straight back again.
export const ACTION_COOLDOWN_SECONDS = 20;

export function emptyCooldowns(): ActionCooldowns {
  return { idle: 0, move: 0, eat: 0, rest: 0, drink: 0 };
}

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

export function chooseAction(
  utilities: Record<ActionId, number>,
  cooldowns: ActionCooldowns = emptyCooldowns(),
): ActionId {
  const available = TIE_BREAK.filter((id) => cooldowns[id] <= 0);

  if (available.length === 0) return 'idle';

  return available.reduce((best, id) => (utilities[id] > utilities[best] ? id : best));
}

export function assertActionId(value: unknown): ActionId {
  if (!(ACTION_IDS as readonly string[]).includes(String(value))) {
    throw new Error(`Unknown action: ${String(value)}`);
  }

  return value as ActionId;
}

function isUrgent(action: ActionId, hunger: number, thirst: number, fatigue: number): boolean {
  return (hunger >= HUNGER_EAT_AT && action !== 'eat')
    || (thirst >= THIRST_DRINK_AT && action !== 'drink')
    || (fatigue >= FATIGUE_REST_AT && action !== 'rest');
}

function continueAction(
  action: ActionId,
  elapsed: number,
  hunger: number,
  thirst: number,
  fatigue: number,
): boolean {
  if (isUrgent(action, hunger, thirst, fatigue)) return false;
  if (elapsed < MIN_ACTION_SECONDS) return true;
  if (action === 'eat') return hunger > HUNGER_RESUME_AT;
  if (action === 'drink') return thirst > THIRST_RESUME_AT;
  if (action === 'rest') return fatigue > FATIGUE_RESUME_AT;

  return false;
}

function readCooldowns(eid: number): ActionCooldowns {
  return {
    idle: Action.cooldown.idle[eid],
    move: Action.cooldown.move[eid],
    eat: Action.cooldown.eat[eid],
    rest: Action.cooldown.rest[eid],
    drink: Action.cooldown.drink[eid],
  };
}

function writeCooldowns(eid: number, cooldowns: ActionCooldowns): void {
  for (const id of ACTION_IDS) {
    Action.cooldown[id][eid] = cooldowns[id];
  }
}

function tickCooldowns(eid: number, deltaSeconds: number): void {
  for (const id of ACTION_IDS) {
    Action.cooldown[id][eid] = Math.max(0, Action.cooldown[id][eid] - deltaSeconds);
  }
}

function applyAction(eid: number, action: ActionId): void {
  Condition.resting[eid] = action === 'rest' ? 1 : 0;
  Condition.eating[eid] = action === 'eat' ? 1 : 0;
  Condition.drinking[eid] = action === 'drink' ? 1 : 0;
}

// Runs after lifecycle and before needs. One action at a time. A need at
// 0.8 interrupts, and the action it cuts off cannot be chosen again until
// its cooldown elapses. Finishing a meal, drink or rest does not cool it.
export function updateActions(world: SimulationWorld, deltaSeconds: number): void {
  const entities = query(world.ecs, [Action, Needs, Personality, Condition, Lifecycle]);

  for (const eid of entities) {
    tickCooldowns(eid, deltaSeconds);

    if (Lifecycle.state[eid] === DEAD) {
      Action.kind[eid] = ACTION_IDS.indexOf('idle');
      Action.elapsed[eid] = 0;
      writeCooldowns(eid, emptyCooldowns());
      applyAction(eid, 'idle');
      continue;
    }

    const hunger = Needs.hunger[eid];
    const thirst = Needs.thirst[eid];
    const fatigue = Needs.fatigue[eid];
    const utilities = actionUtilities({
      hunger,
      thirst,
      fatigue,
      curiosity: Personality.curiosity[eid],
    });
    const current = ACTION_IDS[Action.kind[eid]] ?? 'move';

    if (Action.elapsed[eid] > 0 && continueAction(current, Action.elapsed[eid], hunger, thirst, fatigue)) {
      Action.elapsed[eid] += deltaSeconds;
      applyAction(eid, current);
      continue;
    }

    if (Action.elapsed[eid] > 0 && isUrgent(current, hunger, thirst, fatigue)) {
      Action.cooldown[current][eid] = ACTION_COOLDOWN_SECONDS;
    }

    const next = chooseAction(utilities, readCooldowns(eid));
    Action.kind[eid] = ACTION_IDS.indexOf(next);
    Action.elapsed[eid] = deltaSeconds;
    applyAction(eid, next);
  }
}
