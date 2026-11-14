import { query } from 'bitecs';

import { ACTION_IDS, ACTION_OUTCOMES, LIFECYCLE_STATES } from '@simsand/shared';
import type { ActionCooldowns, ActionEnding, ActionId, ActionResult } from '@simsand/shared';

import type { SimulationWorld } from '../core/world.js';

import { Identity } from '../components/identity.js';
import { Action } from '../components/action.js';
import { Condition } from '../components/condition.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';
import { Personality } from '../components/personality.js';
import { createRandom } from '../core/random.js';
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

// Small enough that a pressing need still wins, large enough to break a tie
// between two characters who otherwise want the same thing. Stable per
// character, from its own salt, so it never shifts the profile.
export const ACTION_BIAS = 0.05;
const ACTION_BIAS_SALT = 0x27d4eb2f;

export function emptyCooldowns(): ActionCooldowns {
  return { idle: 0, move: 0, eat: 0, rest: 0, drink: 0 };
}

interface NeedState {
  hunger: number;
  thirst: number;
  fatigue: number;
  curiosity: number;
}

function comfort(state: NeedState): number {
  return 1 - Math.max(state.hunger, state.thirst, state.fatigue);
}

interface ActionDefinition {
  id: ActionId;
  score: (state: NeedState) => number;
  // Idle stays available after death. Every other action requires a living
  // character whose cooldown for it has elapsed.
  requiresLife: boolean;
  ready: (state: NeedState) => boolean;
  // After the minimum commitment, keep going while this is true.
  sustain: (state: NeedState) => boolean;
  // At the urgent line, this need cuts off whatever else they are doing.
  urgent: (state: NeedState) => boolean;
  resting: boolean;
  eating: boolean;
  drinking: boolean;
}

// Order is the tie break: eat, then drink, then rest, then move, then idle.
export const actionDefinitions: readonly ActionDefinition[] = [
  {
    id: 'eat',
    score: (state) => state.hunger,
    requiresLife: true,
    ready: (state) => state.hunger > HUNGER_RESUME_AT,
    sustain: (state) => state.hunger > HUNGER_RESUME_AT,
    urgent: (state) => state.hunger >= HUNGER_EAT_AT,
    resting: false,
    eating: true,
    drinking: false,
  },
  {
    id: 'drink',
    score: (state) => state.thirst,
    requiresLife: true,
    ready: (state) => state.thirst > THIRST_RESUME_AT,
    sustain: (state) => state.thirst > THIRST_RESUME_AT,
    urgent: (state) => state.thirst >= THIRST_DRINK_AT,
    resting: false,
    eating: false,
    drinking: true,
  },
  {
    id: 'rest',
    score: (state) => state.fatigue,
    requiresLife: true,
    ready: (state) => state.fatigue > FATIGUE_RESUME_AT,
    sustain: (state) => state.fatigue > FATIGUE_RESUME_AT,
    urgent: (state) => state.fatigue >= FATIGUE_REST_AT,
    resting: true,
    eating: false,
    drinking: false,
  },
  {
    id: 'move',
    score: (state) => state.curiosity * comfort(state),
    requiresLife: true,
    ready: () => true,
    sustain: () => false,
    urgent: () => false,
    resting: false,
    eating: false,
    drinking: false,
  },
  {
    id: 'idle',
    score: (state) => (1 - state.curiosity) * comfort(state),
    requiresLife: false,
    ready: () => true,
    sustain: () => false,
    urgent: () => false,
    resting: false,
    eating: false,
    drinking: false,
  },
];

function definitionFor(id: ActionId): ActionDefinition {
  const definition = actionDefinitions.find((candidate) => candidate.id === id);

  if (!definition) throw new Error(`Unknown action: ${id}`);

  return definition;
}

function needState(input: {
  hunger: number;
  thirst: number;
  fatigue: number;
  curiosity: number;
}): NeedState {
  return {
    hunger: input.hunger,
    thirst: input.thirst,
    fatigue: input.fatigue,
    curiosity: Math.min(1, Math.max(0, input.curiosity)),
  };
}

export function actionUtilities(input: {
  hunger: number;
  thirst: number;
  fatigue: number;
  curiosity: number;
}): Record<ActionId, number> {
  const state = needState(input);
  const utilities = emptyCooldowns();

  for (const definition of actionDefinitions) {
    utilities[definition.id] = definition.score(state);
  }

  return utilities;
}

export function actionBias(worldSeed: number, characterId: string): Record<ActionId, number> {
  let hash = (worldSeed ^ ACTION_BIAS_SALT) | 0;

  for (let i = 0; i < characterId.length; i++) {
    hash = Math.imul(hash ^ characterId.charCodeAt(i), 0x5bd1e995);
  }

  const random = createRandom(hash >>> 0);
  const bias = emptyCooldowns();

  for (const id of ACTION_IDS) {
    bias[id] = (random() * 2 - 1) * ACTION_BIAS;
  }

  return bias;
}

export function biasedUtilities(
  utilities: Record<ActionId, number>,
  bias: Record<ActionId, number>,
): Record<ActionId, number> {
  return {
    idle: utilities.idle + bias.idle,
    move: utilities.move + bias.move,
    eat: utilities.eat + bias.eat,
    rest: utilities.rest + bias.rest,
    drink: utilities.drink + bias.drink,
  };
}

// Idle is always available, including for the dead. A meal, drink or rest is
// only available while that need is still above the point where the recovery
// would keep going, so a small bias cannot start one they would not keep.
export function actionAvailability(input: {
  alive: boolean;
  hunger: number;
  thirst: number;
  fatigue: number;
  cooldowns?: ActionCooldowns;
}): Record<ActionId, boolean> {
  const cooldowns = input.cooldowns ?? emptyCooldowns();
  const state = needState({ ...input, curiosity: 0 });
  const available = { idle: false, move: false, eat: false, rest: false, drink: false };

  for (const definition of actionDefinitions) {
    const open = !definition.requiresLife || (input.alive && cooldowns[definition.id] <= 0);
    available[definition.id] = open && definition.ready(state);
  }

  return available;
}

export function chooseAction(
  utilities: Record<ActionId, number>,
  available: Record<ActionId, boolean> = actionAvailability({
    alive: true,
    hunger: 1,
    thirst: 1,
    fatigue: 1,
  }),
): ActionId {
  const candidates = actionDefinitions.filter((definition) => available[definition.id]);

  if (candidates.length === 0) return 'idle';

  return candidates.reduce((best, definition) => (
    utilities[definition.id] > utilities[best.id] ? definition : best
  )).id;
}

export function assertActionId(value: unknown): ActionId {
  if (!(ACTION_IDS as readonly string[]).includes(String(value))) {
    throw new Error(`Unknown action: ${String(value)}`);
  }

  return value as ActionId;
}

function isUrgent(action: ActionId, state: NeedState): boolean {
  return actionDefinitions.some((definition) => definition.id !== action && definition.urgent(state));
}

function continueAction(action: ActionId, elapsed: number, state: NeedState): boolean {
  if (isUrgent(action, state)) return false;
  if (elapsed < MIN_ACTION_SECONDS) return true;

  return definitionFor(action).sustain(state);
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

export function readActionOutcome(eid: number): ActionEnding | null {
  const action = ACTION_IDS[Action.outcomeAction[eid]];
  const result = ACTION_OUTCOMES[Action.outcomeResult[eid]];

  if (action === undefined || Action.outcomeAction[eid] < 0) return null;

  return { action, result };
}

function writeActionOutcome(eid: number, action: ActionId, result: ActionResult): void {
  Action.outcomeAction[eid] = ACTION_IDS.indexOf(action);
  Action.outcomeResult[eid] = ACTION_OUTCOMES.indexOf(result);
}

function clearActionOutcome(eid: number): void {
  Action.outcomeAction[eid] = -1;
  Action.outcomeResult[eid] = 0;
}

function applyAction(eid: number, action: ActionId): void {
  const definition = definitionFor(action);
  Condition.resting[eid] = definition.resting ? 1 : 0;
  Condition.eating[eid] = definition.eating ? 1 : 0;
  Condition.drinking[eid] = definition.drinking ? 1 : 0;
}

// Runs after lifecycle and before needs. One action at a time. A need at
// 0.8 interrupts, and the action it cuts off cannot be chosen again until
// its cooldown elapses. Finishing a meal, drink or rest does not cool it.
export function updateActions(world: SimulationWorld, deltaSeconds: number): void {
  const entities = query(world.ecs, [Action, Needs, Personality, Condition, Lifecycle, Identity]);

  for (const eid of entities) {
    tickCooldowns(eid, deltaSeconds);

    if (Lifecycle.state[eid] === DEAD) {
      Action.kind[eid] = ACTION_IDS.indexOf('idle');
      Action.elapsed[eid] = 0;
      writeCooldowns(eid, emptyCooldowns());
      clearActionOutcome(eid);
      applyAction(eid, 'idle');
      continue;
    }

    const state = needState({
      hunger: Needs.hunger[eid],
      thirst: Needs.thirst[eid],
      fatigue: Needs.fatigue[eid],
      curiosity: Personality.curiosity[eid],
    });
    const utilities = biasedUtilities(
      actionUtilities(state),
      actionBias(world.seed, Identity.id[eid]),
    );
    const current = ACTION_IDS[Action.kind[eid]] ?? 'move';

    if (Action.elapsed[eid] > 0 && continueAction(current, Action.elapsed[eid], state)) {
      Action.elapsed[eid] += deltaSeconds;
      applyAction(eid, current);
      continue;
    }

    if (Action.elapsed[eid] > 0 && isUrgent(current, state)) {
      Action.cooldown[current][eid] = ACTION_COOLDOWN_SECONDS;
      writeActionOutcome(eid, current, 'interrupted');
    } else if (Action.elapsed[eid] > 0) {
      writeActionOutcome(eid, current, 'completed');
    }

    const next = chooseAction(utilities, actionAvailability({
      alive: true,
      ...state,
      cooldowns: readCooldowns(eid),
    }));
    Action.kind[eid] = ACTION_IDS.indexOf(next);
    Action.elapsed[eid] = deltaSeconds;
    applyAction(eid, next);
  }
}
