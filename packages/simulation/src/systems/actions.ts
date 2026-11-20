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
import { Position } from '../components/position.js';
import { getTile, nearestTerrainTile } from '../core/map.js';
import { CAMP_YIELD, heldQuantity } from '../economy/inventory.js';
import { nodeAt } from '../economy/nodes.js';
import { recordActionEnding } from '../log/events.js';
import { adjacentLivingId, buildOccupancy, distressOf, isAdjacentLiving, livingNeighbors, mostDistressedNeighbor } from '../social/presence.js';
import { knownNeighborId } from '../social/relationships.js';
import { steerToward } from './movement.js';
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
  const cooldowns = {} as ActionCooldowns;

  for (const id of ACTION_IDS) {
    cooldowns[id] = 0;
  }

  return cooldowns;
}

function emptyAvailability(): Record<ActionId, boolean> {
  const available = {} as Record<ActionId, boolean>;

  for (const id of ACTION_IDS) {
    available[id] = false;
  }

  return available;
}

interface NeedState {
  hunger: number;
  thirst: number;
  fatigue: number;
  curiosity: number;
  industriousness: number;
  sociability: number;
  empathy: number;
  loyalty: number;
  honesty: number;
  greed: number;
  alive: boolean;
  onWater: boolean;
  onCamp: boolean;
  // False when the shared route has no tile of that kind to walk to.
  canReachWater: boolean;
  canReachLand: boolean;
  canReachCamp: boolean;
  hasNeighbor: boolean;
  hasKnownNeighbor: boolean;
  // True when they are holding something they can hand over.
  canGive: boolean;
  // Quantity of the pile on the tile under them. Zero when there is none.
  nodeStock: number;
  targetAdjacent: boolean;
  // Highest need of a living neighbour, or of the character already chosen.
  neighborDistress: number;
  targetDistress: number;
}

function comfort(state: NeedState): number {
  return 1 - Math.max(state.hunger, state.thirst, state.fatigue);
}

function comfortable(state: NeedState): boolean {
  return state.hunger <= HUNGER_RESUME_AT
    && state.thirst <= THIRST_RESUME_AT
    && state.fatigue <= FATIGUE_RESUME_AT;
}

function stands(state: NeedState): boolean {
  if (state.onWater) return !state.canReachLand && state.thirst <= THIRST_RESUME_AT;
  if (state.thirst > THIRST_RESUME_AT && state.canReachWater) return false;
  if (seeksCamp(state)) return false;

  return true;
}

function workOutranksWander(state: NeedState): boolean {
  const work = state.industriousness * comfort(state);
  const move = state.curiosity * comfort(state);
  const idle = (1 - state.curiosity) * comfort(state);

  return work >= move && work >= idle;
}

// Work has to beat idle and move. An incurious lazy character stands;
// a curious lazy one keeps walking.
function seeksCamp(state: NeedState): boolean {
  return comfortable(state) && state.canReachCamp && !state.onCamp && workOutranksWander(state);
}

interface ActionDefinition {
  id: ActionId;
  score: (state: NeedState) => number;
  // Idle stays available after death. Every other action requires a living
  // character whose cooldown for it has elapsed.
  requiresLife: boolean;
  ready: (state: NeedState) => boolean;
  // False ends the current commitment immediately. The minimum time does not
  // keep them in a place where the action cannot happen.
  holds: (state: NeedState) => boolean;
  // After the minimum commitment, keep going while this is true.
  sustain: (state: NeedState) => boolean;
  // At the urgent line, this need cuts off whatever else they are doing.
  urgent: (state: NeedState) => boolean;
  resting: boolean;
  eating: boolean;
  drinking: boolean;
  working: boolean;
  // Losing the other character ends the action as a failure, not a completion.
  losesTarget: boolean;
}

// Order is the tie break: eat, then drink, then rest, then work, then gather,
// then comfort, then keep, then confide, then bluff, then greet, then give,
// then move, then idle.
export const actionDefinitions: readonly ActionDefinition[] = [
  {
    id: 'eat',
    score: (state) => state.hunger,
    requiresLife: true,
    ready: (state) => !state.onWater && state.hunger > HUNGER_RESUME_AT,
    holds: (state) => !state.onWater,
    sustain: (state) => state.hunger > HUNGER_RESUME_AT,
    urgent: (state) => !state.onWater && state.hunger >= HUNGER_EAT_AT,
    resting: false,
    eating: true,
    drinking: false,
    working: false,
    losesTarget: false,
  },
  {
    id: 'drink',
    score: (state) => state.thirst,
    requiresLife: true,
    // Water is the only source on the map. A drink anywhere else cannot happen.
    ready: (state) => state.onWater && state.thirst > THIRST_RESUME_AT,
    holds: (state) => state.onWater,
    sustain: (state) => state.thirst > THIRST_RESUME_AT,
    urgent: (state) => state.onWater && state.thirst >= THIRST_DRINK_AT,
    resting: false,
    eating: false,
    drinking: true,
    working: false,
    losesTarget: false,
  },
  {
    id: 'rest',
    score: (state) => state.fatigue,
    requiresLife: true,
    ready: (state) => !state.onWater && state.fatigue > FATIGUE_RESUME_AT,
    holds: (state) => !state.onWater,
    sustain: (state) => state.fatigue > FATIGUE_RESUME_AT,
    urgent: (state) => !state.onWater && state.fatigue >= FATIGUE_REST_AT,
    resting: true,
    eating: false,
    drinking: false,
    working: false,
    losesTarget: false,
  },
  {
    id: 'work',
    score: (state) => state.industriousness * comfort(state),
    requiresLife: true,
    // A camp is the only workplace. The visit happens while every need is quiet.
    ready: (state) => state.onCamp && comfortable(state),
    holds: (state) => state.onCamp && comfortable(state),
    sustain: (state) => state.onCamp && comfortable(state),
    urgent: () => false,
    resting: false,
    eating: false,
    drinking: false,
    working: true,
    losesTarget: false,
  },
  {
    id: 'gather',
    // Same preference as work. The pile has to be underfoot. Nothing walks
    // them toward one.
    score: (state) => state.industriousness * comfort(state),
    requiresLife: true,
    ready: (state) => state.nodeStock > 0 && comfortable(state),
    holds: (state) => state.nodeStock > 0 && comfortable(state),
    sustain: (state) => state.nodeStock > 0 && comfortable(state),
    urgent: () => false,
    resting: false,
    eating: false,
    drinking: false,
    working: false,
    losesTarget: false,
  },
  {
    id: 'comfort',
    score: (state) => state.empathy * comfort(state),
    requiresLife: true,
    // Someone beside them is still past the point where a meal, drink or rest
    // would keep going. Their own needs have to be quiet first.
    ready: (state) => comfortable(state) && state.neighborDistress > HUNGER_RESUME_AT,
    holds: (state) => state.targetAdjacent,
    sustain: (state) => comfortable(state) && state.targetDistress > HUNGER_RESUME_AT,
    urgent: () => false,
    resting: false,
    eating: false,
    drinking: false,
    working: false,
    losesTarget: true,
  },
  {
    id: 'keep',
    score: (state) => state.loyalty * comfort(state),
    requiresLife: true,
    // Only someone they have already met. The first meeting is still a greeting.
    ready: (state) => comfortable(state) && state.hasKnownNeighbor,
    holds: (state) => state.targetAdjacent,
    sustain: (state) => comfortable(state) && state.targetAdjacent,
    urgent: () => false,
    resting: false,
    eating: false,
    drinking: false,
    working: false,
    losesTarget: true,
  },
  {
    id: 'confide',
    score: (state) => state.honesty * comfort(state),
    requiresLife: true,
    ready: (state) => comfortable(state) && state.hasKnownNeighbor,
    holds: (state) => state.targetAdjacent,
    sustain: () => false,
    urgent: () => false,
    resting: false,
    eating: false,
    drinking: false,
    working: false,
    losesTarget: true,
  },
  {
    id: 'bluff',
    score: (state) => (1 - state.honesty) * comfort(state),
    requiresLife: true,
    ready: (state) => comfortable(state) && state.hasKnownNeighbor,
    holds: (state) => state.targetAdjacent,
    sustain: () => false,
    urgent: () => false,
    resting: false,
    eating: false,
    drinking: false,
    working: false,
    losesTarget: true,
  },
  {
    id: 'greet',
    score: (state) => state.sociability * comfort(state),
    requiresLife: true,
    ready: (state) => comfortable(state) && state.hasNeighbor,
    holds: (state) => state.targetAdjacent,
    sustain: () => false,
    urgent: () => false,
    resting: false,
    eating: false,
    drinking: false,
    working: false,
    losesTarget: true,
  },
  {
    id: 'give',
    // A greedy character keeps the stack. Giving scores what greed does not.
    score: (state) => (1 - state.greed) * comfort(state),
    requiresLife: true,
    ready: (state) => comfortable(state) && state.hasKnownNeighbor && state.canGive,
    holds: (state) => state.targetAdjacent && state.canGive,
    sustain: () => false,
    urgent: () => false,
    resting: false,
    eating: false,
    drinking: false,
    working: false,
    losesTarget: true,
  },
  {
    id: 'move',
    score: (state) => state.curiosity * comfort(state),
    requiresLife: true,
    // In the water with a thirst to deal with, walking would carry them off
    // the only place they can drink.
    ready: (state) => !(state.onWater && state.thirst > THIRST_RESUME_AT) && !(state.onCamp && comfortable(state) && workOutranksWander(state)),
    holds: (state) => !(state.onWater && state.thirst > THIRST_RESUME_AT) && !(state.onCamp && comfortable(state) && workOutranksWander(state)),
    sustain: () => false,
    urgent: () => false,
    resting: false,
    eating: false,
    drinking: false,
    working: false,
    losesTarget: false,
  },
  {
    id: 'idle',
    score: (state) => (1 - state.curiosity) * comfort(state),
    requiresLife: false,
    // A living character stands on land when they are not thirsty, and when
    // thirst has nowhere to lead. They do not stand in water they can leave.
    ready: (state) => !state.alive || stands(state),
    holds: (state) => stands(state),
    sustain: () => false,
    urgent: () => false,
    resting: false,
    eating: false,
    drinking: false,
    working: false,
    losesTarget: false,
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
  curiosity?: number;
  industriousness?: number;
  sociability?: number;
  empathy?: number;
  loyalty?: number;
  honesty?: number;
  greed?: number;
  alive?: boolean;
  onWater?: boolean;
  onCamp?: boolean;
  canReachWater?: boolean;
  canReachLand?: boolean;
  canReachCamp?: boolean;
  hasNeighbor?: boolean;
  hasKnownNeighbor?: boolean;
  canGive?: boolean;
  nodeStock?: number;
  targetAdjacent?: boolean;
  neighborDistress?: number;
  targetDistress?: number;
}): NeedState {
  return {
    hunger: input.hunger,
    thirst: input.thirst,
    fatigue: input.fatigue,
    curiosity: Math.min(1, Math.max(0, input.curiosity ?? 0)),
    industriousness: Math.min(1, Math.max(0, input.industriousness ?? 1)),
    sociability: Math.min(1, Math.max(0, input.sociability ?? 0)),
    empathy: Math.min(1, Math.max(0, input.empathy ?? 0)),
    loyalty: Math.min(1, Math.max(0, input.loyalty ?? 0)),
    honesty: Math.min(1, Math.max(0, input.honesty ?? 0)),
    greed: Math.min(1, Math.max(0, input.greed ?? 0)),
    alive: input.alive ?? true,
    onWater: input.onWater ?? false,
    onCamp: input.onCamp ?? false,
    canReachWater: input.canReachWater ?? true,
    canReachLand: input.canReachLand ?? true,
    canReachCamp: input.canReachCamp ?? false,
    hasNeighbor: input.hasNeighbor ?? false,
    hasKnownNeighbor: input.hasKnownNeighbor ?? false,
    canGive: input.canGive ?? false,
    nodeStock: Math.max(0, input.nodeStock ?? 0),
    targetAdjacent: input.targetAdjacent ?? false,
    neighborDistress: Math.min(1, Math.max(0, input.neighborDistress ?? 0)),
    targetDistress: Math.min(1, Math.max(0, input.targetDistress ?? 0)),
  };
}

export function standingOnWater(world: SimulationWorld, x: number, y: number): boolean {
  const tileX = Math.min(world.map.width - 1, Math.max(0, Math.floor(x)));
  const tileY = Math.min(world.map.height - 1, Math.max(0, Math.floor(y)));

  return getTile(world.map, tileX, tileY) === 'water';
}

export function standingOnCamp(world: SimulationWorld, x: number, y: number): boolean {
  const tileX = Math.min(world.map.width - 1, Math.max(0, Math.floor(x)));
  const tileY = Math.min(world.map.height - 1, Math.max(0, Math.floor(y)));

  return getTile(world.map, tileX, tileY) === 'camp';
}

export function actionUtilities(input: {
  hunger: number;
  thirst: number;
  fatigue: number;
  curiosity: number;
  industriousness?: number;
  sociability?: number;
  empathy?: number;
  loyalty?: number;
  honesty?: number;
  greed?: number;
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
  const result = {} as Record<ActionId, number>;

  for (const id of ACTION_IDS) {
    result[id] = utilities[id] + bias[id];
  }

  return result;
}

// Idle is always available to the dead, and to the living when they are not
// thirsty. A meal or rest is available while that need is above the point
// where the recovery would keep going. A drink also requires water underfoot,
// so a small bias cannot start a recovery the character would not keep.
export function actionAvailability(input: {
  alive: boolean;
  hunger: number;
  thirst: number;
  fatigue: number;
  curiosity?: number;
  industriousness?: number;
  sociability?: number;
  empathy?: number;
  loyalty?: number;
  honesty?: number;
  greed?: number;
  onWater?: boolean;
  onCamp?: boolean;
  canReachWater?: boolean;
  canReachLand?: boolean;
  canReachCamp?: boolean;
  hasNeighbor?: boolean;
  hasKnownNeighbor?: boolean;
  canGive?: boolean;
  nodeStock?: number;
  targetAdjacent?: boolean;
  neighborDistress?: number;
  targetDistress?: number;
  cooldowns?: ActionCooldowns;
}): Record<ActionId, boolean> {
  const cooldowns = input.cooldowns ?? emptyCooldowns();
  const state = needState(input);
  const available = emptyAvailability();

  for (const definition of actionDefinitions) {
    available[definition.id] = isOpen(definition, input.alive, cooldowns) && definition.ready(state);
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

function isOpen(
  definition: ActionDefinition,
  alive: boolean,
  cooldowns: ActionCooldowns,
): boolean {
  return !definition.requiresLife || (alive && cooldowns[definition.id] <= 0);
}

// Highest scoring action whose cooldown has elapsed, including ones that
// cannot start here. Those are a failure when there is also no route to a
// place where they could.
function preferredAction(
  utilities: Record<ActionId, number>,
  alive: boolean,
  cooldowns: ActionCooldowns,
): ActionId {
  const open = emptyAvailability();

  for (const definition of actionDefinitions) {
    open[definition.id] = isOpen(definition, alive, cooldowns);
  }

  return chooseAction(utilities, open);
}

function canApproach(action: ActionId, state: NeedState): boolean {
  if (action === 'drink') return !state.onWater && state.canReachWater;
  if (action === 'eat' || action === 'rest') return state.onWater && state.canReachLand;

  return false;
}

function selectionFailed(action: ActionId, available: Record<ActionId, boolean>, state: NeedState): boolean {
  if (action !== 'eat' && action !== 'drink' && action !== 'rest') return false;

  return !available[action] && !canApproach(action, state);
}

function endingResult(action: ActionId, state: NeedState): ActionResult {
  if (isUrgent(action, state)) return 'interrupted';

  // Leaving the pile, or finding it empty, is not a finished gathering.
  if (action === 'gather' && state.nodeStock <= 0) return 'failed';

  const definition = definitionFor(action);

  if (definition.losesTarget && !definition.holds(state)) return 'failed';
  if (!definition.holds(state) && definition.sustain(state)) return 'failed';

  return 'completed';
}

function continueAction(action: ActionId, elapsed: number, state: NeedState): boolean {
  if (isUrgent(action, state)) return false;
  if (!definitionFor(action).holds(state)) return false;
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
    work: Action.cooldown.work[eid],
    greet: Action.cooldown.greet[eid],
    comfort: Action.cooldown.comfort[eid],
    keep: Action.cooldown.keep[eid],
    confide: Action.cooldown.confide[eid],
    bluff: Action.cooldown.bluff[eid],
    give: Action.cooldown.give[eid],
    gather: Action.cooldown.gather[eid],
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
  Condition.working[eid] = definition.working ? 1 : 0;
}

// Runs after lifecycle and before needs. One action at a time. A need at
// 0.8 interrupts, and the action it cuts off cannot be chosen again until
// its cooldown elapses. Finishing a meal, drink, rest or visit does not
// cool it. An action that cannot continue where they stand, or that they
// would take but have no way to start, is recorded as failed.
export function updateActions(world: SimulationWorld, deltaSeconds: number): void {
  const entities = query(world.ecs, [Action, Needs, Personality, Condition, Lifecycle, Identity]);
  const occupancy = buildOccupancy(world);

  for (const eid of entities) {
    tickCooldowns(eid, deltaSeconds);

    if (Lifecycle.state[eid] === DEAD) {
      Action.kind[eid] = ACTION_IDS.indexOf('idle');
      Action.elapsed[eid] = 0;
      Action.target[eid] = '';
      writeCooldowns(eid, emptyCooldowns());
      clearActionOutcome(eid);
      applyAction(eid, 'idle');
      continue;
    }

    const nearby = livingNeighbors(world, eid, occupancy);
    const neighborId = adjacentLivingId(nearby);
    const knownId = knownNeighborId(world, Identity.id[eid], nearby);
    const distressed = mostDistressedNeighbor(nearby);
    const targetId = Action.target[eid];
    const onWater = standingOnWater(world, Position.x[eid], Position.y[eid]);
    const onCamp = standingOnCamp(world, Position.x[eid], Position.y[eid]);
    const waterRoute = nearestTerrainTile(world.map, Position.x[eid], Position.y[eid], 'water');
    const landRoute = nearestTerrainTile(world.map, Position.x[eid], Position.y[eid], 'land');
    const campRoute = nearestTerrainTile(world.map, Position.x[eid], Position.y[eid], 'camp');
    const state = needState({
      hunger: Needs.hunger[eid],
      thirst: Needs.thirst[eid],
      fatigue: Needs.fatigue[eid],
      curiosity: Personality.curiosity[eid],
      industriousness: Personality.industriousness[eid],
      sociability: Personality.sociability[eid],
      empathy: Personality.empathy[eid],
      loyalty: Personality.loyalty[eid],
      honesty: Personality.honesty[eid],
      greed: Personality.greed[eid],
      alive: true,
      onWater,
      onCamp,
      canReachWater: waterRoute !== undefined,
      canReachLand: landRoute !== undefined && landRoute.distance > 0,
      canReachCamp: campRoute !== undefined && campRoute.distance > 0,
      hasNeighbor: neighborId !== undefined,
      hasKnownNeighbor: knownId !== undefined,
      canGive: heldQuantity(world, Identity.id[eid], CAMP_YIELD) >= 1,
      nodeStock: nodeAt(world, Position.x[eid], Position.y[eid])?.quantity ?? 0,
      targetAdjacent: Boolean(targetId) && isAdjacentLiving(world, eid, targetId),
      neighborDistress: distressed?.distress ?? 0,
      targetDistress: targetId ? distressOf(world, targetId) : 0,
    });
    const utilities = biasedUtilities(
      actionUtilities(state),
      actionBias(world.seed, Identity.id[eid]),
    );
    const current = ACTION_IDS[Action.kind[eid]] ?? 'move';

    if (Action.elapsed[eid] > 0 && continueAction(current, Action.elapsed[eid], state)) {
      Action.elapsed[eid] += deltaSeconds;
      applyAction(eid, current);
      directMove(world, eid, current, state);
      continue;
    }

    if (Action.elapsed[eid] > 0) {
      const result = endingResult(current, state);

      if (result === 'interrupted') {
        Action.cooldown[current][eid] = ACTION_COOLDOWN_SECONDS;
      }

      noteEnding(world, eid, current, result);
    }

    const cooldowns = readCooldowns(eid);
    const available = actionAvailability({
      alive: state.alive,
      hunger: state.hunger,
      thirst: state.thirst,
      fatigue: state.fatigue,
      curiosity: state.curiosity,
      industriousness: state.industriousness,
      sociability: state.sociability,
      empathy: state.empathy,
      loyalty: state.loyalty,
      honesty: state.honesty,
      greed: state.greed,
      onWater: state.onWater,
      canReachWater: state.canReachWater,
      canReachLand: state.canReachLand,
      onCamp: state.onCamp,
      canReachCamp: state.canReachCamp,
      hasNeighbor: state.hasNeighbor,
      hasKnownNeighbor: state.hasKnownNeighbor,
      canGive: state.canGive,
      nodeStock: state.nodeStock,
      targetAdjacent: state.targetAdjacent,
      neighborDistress: state.neighborDistress,
      targetDistress: state.targetDistress,
      cooldowns,
    });
    const preferred = preferredAction(utilities, state.alive, cooldowns);

    if (selectionFailed(preferred, available, state)) {
      noteEnding(world, eid, preferred, 'failed');
    }

    const next = chooseAction(utilities, available);
    Action.kind[eid] = ACTION_IDS.indexOf(next);
    Action.elapsed[eid] = deltaSeconds;
    Action.target[eid] = socialTarget(next, neighborId, distressed?.id, knownId);
    applyAction(eid, next);
    directMove(world, eid, next, state);
  }
}

function socialTarget(
  action: ActionId,
  neighborId: string | undefined,
  distressedId: string | undefined,
  knownId: string | undefined,
): string {
  if (action === 'greet') return neighborId ?? '';
  if (action === 'comfort') return distressedId ?? '';
  if (action === 'keep' || action === 'confide' || action === 'bluff' || action === 'give') return knownId ?? '';

  return '';
}

function noteEnding(
  world: SimulationWorld,
  eid: number,
  action: ActionId,
  result: ActionResult,
): void {
  writeActionOutcome(eid, action, result);
  recordActionEnding(
    world,
    eid,
    Identity.id[eid],
    action,
    result,
    definitionFor(action).losesTarget ? Action.target[eid] || undefined : undefined,
  );
}

function directMove(world: SimulationWorld, eid: number, action: ActionId, state: NeedState): void {
  if (action !== 'move') return;

  // Thirst aims at water. Leaving the water aims at land. A quiet need aims
  // at a camp. Any other walk keeps the direction they already had.
  if (state.thirst > THIRST_RESUME_AT && !state.onWater) {
    if (!state.canReachWater) return;

    steerToward(world, eid, 'water');
  } else if (state.onWater && state.canReachLand) {
    steerToward(world, eid, 'land');
  } else if (seeksCamp(state)) {
    steerToward(world, eid, 'camp');
  }
}
