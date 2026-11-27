import type {
  ActionId,
  ActionLogEvent,
  ActionLogType,
  ActionResult,
  CharacterNeeds,
  DeathCause,
  InterventionLogEvent,
  InterventionLogPayloads,
  InterventionLogType,
  MemoryKind,
  SimulationLogEvent,
  SimulationLogType,
} from '@simsand/shared';

import { Needs } from '../components/needs.js';
import { HUNGER_RESUME_AT } from '../systems/needs.js';
import { Position } from '../components/position.js';
import type { SimulationWorld } from '../core/world.js';
import { CAMP_YIELD, CAMP_YIELD_QUANTITY, CRAFT_INPUT, CRAFT_OUTPUT, CRAFT_QUANTITY, FOOD_PRICE, MEAL_ITEM, MEAL_QUANTITY, buyFood, grantItem, spendItem, transferItem } from '../economy/inventory.js';
import { takeResource } from '../economy/nodes.js';
import { eventsFor, eventsForPair, indexLogEvent, unindexLogEvent } from '../history/records.js';
import { rememberEvent } from '../social/memories.js';
import { pairKey, rememberMeeting, sortedPair } from '../social/relationships.js';

export const LOG_LIMIT = 10_000;

function nextEventId(world: SimulationWorld): string {
  return `log-${world.nextLogId++}`;
}

function append(world: SimulationWorld, event: SimulationLogEvent): SimulationLogEvent {
  world.log.push(event);
  indexLogEvent(world, event);

  const overflow = world.log.length - LOG_LIMIT;

  if (overflow > 0) {
    const removed = world.log.splice(0, overflow);

    for (const old of removed) {
      unindexLogEvent(world, old);
      world.pendingLog.push(old);
    }
  }

  return event;
}

function pairEventThisTick(
  world: SimulationWorld,
  type: SimulationLogType,
  a: string,
  b: string,
): SimulationLogEvent | undefined {
  const list = world.logByPair.get(pairKey(a, b));

  if (!list) return undefined;

  for (let i = list.length - 1; i >= 0; i--) {
    const event = list[i];

    if (event.tick !== world.tick) break;
    if (event.type === type) return event;
  }

  return undefined;
}

function statedNeeds(eid: number, honest: boolean): CharacterNeeds {
  const needs = {
    hunger: Needs.hunger[eid],
    thirst: Needs.thirst[eid],
    fatigue: Needs.fatigue[eid],
  };

  if (honest) return needs;

  const worst = Math.max(needs.hunger, needs.thirst, needs.fatigue);

  return {
    hunger: needs.hunger === worst ? 0 : needs.hunger,
    thirst: needs.thirst === worst ? 0 : needs.thirst,
    fatigue: needs.fatigue === worst ? 0 : needs.fatigue,
  };
}

function recordSocialCompletion(
  world: SimulationWorld,
  initiatorEid: number,
  initiatorId: string,
  otherId: string,
  type: ActionLogType,
  action: 'greet' | 'comfort' | 'keep' | 'confide' | 'bluff',
  memory: MemoryKind,
  reportedNeeds?: CharacterNeeds,
): SimulationLogEvent {
  const existing = pairEventThisTick(world, type, initiatorId, otherId);

  if (existing) return existing;

  const event: ActionLogEvent = {
    eventId: nextEventId(world),
    type,
    tick: world.tick,
    elapsedSeconds: world.elapsedSeconds,
    participants: sortedPair(initiatorId, otherId),
    location: { x: Position.x[initiatorEid], y: Position.y[initiatorEid] },
    payload: {
      action,
      result: 'completed',
      initiator: initiatorId,
      ...(reportedNeeds ? { reportedNeeds } : {}),
    },
  };

  append(world, event);
  rememberMeeting(world, initiatorId, otherId, event.eventId, world.tick);
  rememberEvent(world, memory, event.eventId, initiatorId, otherId);

  return event;
}

export function recordGreeting(
  world: SimulationWorld,
  initiatorEid: number,
  initiatorId: string,
  otherId: string,
): SimulationLogEvent {
  return recordSocialCompletion(
    world,
    initiatorEid,
    initiatorId,
    otherId,
    'character.greeted',
    'greet',
    'greeting',
  );
}

export function recordComfort(
  world: SimulationWorld,
  initiatorEid: number,
  initiatorId: string,
  otherId: string,
): SimulationLogEvent {
  return recordSocialCompletion(
    world,
    initiatorEid,
    initiatorId,
    otherId,
    'character.comforted',
    'comfort',
    'comforting',
  );
}

export function recordKeeping(
  world: SimulationWorld,
  initiatorEid: number,
  initiatorId: string,
  otherId: string,
): SimulationLogEvent {
  return recordSocialCompletion(
    world,
    initiatorEid,
    initiatorId,
    otherId,
    'character.kept',
    'keep',
    'keeping',
  );
}

export function recordConfiding(
  world: SimulationWorld,
  initiatorEid: number,
  initiatorId: string,
  otherId: string,
): SimulationLogEvent {
  return recordSocialCompletion(
    world,
    initiatorEid,
    initiatorId,
    otherId,
    'character.confided',
    'confide',
    'confiding',
    statedNeeds(initiatorEid, true),
  );
}

export function recordGiving(
  world: SimulationWorld,
  initiatorEid: number,
  initiatorId: string,
  otherId: string,
): SimulationLogEvent | undefined {
  const moved = transferItem(world, initiatorId, otherId, CAMP_YIELD, CAMP_YIELD_QUANTITY);

  if (!moved) return undefined;

  const event: SimulationLogEvent = {
    eventId: nextEventId(world),
    type: 'item.transferred',
    tick: world.tick,
    elapsedSeconds: world.elapsedSeconds,
    participants: sortedPair(initiatorId, otherId),
    location: { x: Position.x[initiatorEid], y: Position.y[initiatorEid] },
    payload: {
      action: 'give',
      result: 'completed',
      initiator: initiatorId,
      item: CAMP_YIELD,
      quantity: CAMP_YIELD_QUANTITY,
    },
  };

  append(world, event);
  rememberEvent(world, 'giving', event.eventId, initiatorId, otherId);

  return event;
}

export function recordBuying(
  world: SimulationWorld,
  initiatorEid: number,
  initiatorId: string,
  otherId: string,
): SimulationLogEvent | undefined {
  const moved = buyFood(world, initiatorId, otherId);

  if (!moved) return undefined;

  const event: SimulationLogEvent = {
    eventId: nextEventId(world),
    type: 'item.traded',
    tick: world.tick,
    elapsedSeconds: world.elapsedSeconds,
    participants: sortedPair(initiatorId, otherId),
    location: { x: Position.x[initiatorEid], y: Position.y[initiatorEid] },
    payload: {
      action: 'buy',
      result: 'completed',
      initiator: initiatorId,
      item: MEAL_ITEM,
      quantity: MEAL_QUANTITY,
      price: FOOD_PRICE,
    },
  };

  append(world, event);
  rememberEvent(world, 'trading', event.eventId, initiatorId, otherId);

  return event;
}

export function recordBluff(
  world: SimulationWorld,
  initiatorEid: number,
  initiatorId: string,
  otherId: string,
): SimulationLogEvent {
  return recordSocialCompletion(
    world,
    initiatorEid,
    initiatorId,
    otherId,
    'character.bluffed',
    'bluff',
    'bluffing',
    statedNeeds(initiatorEid, false),
  );
}

export function recordActionEnding(
  world: SimulationWorld,
  eid: number,
  actorId: string,
  action: ActionId,
  result: ActionResult,
  otherId?: string,
): SimulationLogEvent | undefined {
  if (action === 'greet' && result === 'completed') {
    if (!otherId) return undefined;

    return recordGreeting(world, eid, actorId, otherId);
  }

  if (action === 'comfort' && result === 'completed') {
    if (!otherId) return undefined;

    return recordComfort(world, eid, actorId, otherId);
  }

  if (action === 'keep' && result === 'completed') {
    if (!otherId) return undefined;

    return recordKeeping(world, eid, actorId, otherId);
  }

  if (action === 'confide' && result === 'completed') {
    if (!otherId) return undefined;

    return recordConfiding(world, eid, actorId, otherId);
  }

  if (action === 'bluff' && result === 'completed') {
    if (!otherId) return undefined;

    return recordBluff(world, eid, actorId, otherId);
  }

  if (action === 'give' && result === 'completed') {
    if (!otherId) return undefined;

    return recordGiving(world, eid, actorId, otherId);
  }

  if (action === 'buy' && result === 'completed') {
    if (!otherId) return undefined;

    return recordBuying(world, eid, actorId, otherId);
  }

  if (action === 'work' && result === 'completed') {
    grantItem(world, actorId, CAMP_YIELD, CAMP_YIELD_QUANTITY);
  }

  if (action === 'gather' && result === 'completed') {
    const taken = takeResource(world, Position.x[eid], Position.y[eid]);

    if (taken) grantItem(world, actorId, taken.item, taken.quantity);
  }

  if (action === 'craft' && result === 'completed') {
    if (spendItem(world, actorId, CRAFT_INPUT, CRAFT_QUANTITY)) {
      grantItem(world, actorId, CRAFT_OUTPUT, CRAFT_QUANTITY);
    }
  }

  if (action === 'dine' && result === 'completed') {
    if (spendItem(world, actorId, MEAL_ITEM, MEAL_QUANTITY)) {
      Needs.hunger[eid] = Math.min(Needs.hunger[eid], HUNGER_RESUME_AT);
    }
  }

  if (result === 'completed' && (action === 'idle' || action === 'move')) {
    return undefined;
  }

  return append(world, {
    eventId: nextEventId(world),
    type: 'action.ended',
    tick: world.tick,
    elapsedSeconds: world.elapsedSeconds,
    participants: otherId ? sortedPair(actorId, otherId) : [actorId],
    location: { x: Position.x[eid], y: Position.y[eid] },
    payload: { action, result, initiator: actorId },
  });
}

// One fact per intervention. It names the characters it touched, or
// nobody when it changed a place.
export function recordIntervention<TType extends InterventionLogType>(
  world: SimulationWorld,
  type: TType,
  participants: string[],
  location: { x: number; y: number },
  payload: InterventionLogPayloads[TType],
): InterventionLogEvent {
  const event = {
    eventId: nextEventId(world),
    type,
    tick: world.tick,
    elapsedSeconds: world.elapsedSeconds,
    participants,
    location,
    payload,
  } as InterventionLogEvent;

  append(world, event);
  return event;
}

export function recordDeath(
  world: SimulationWorld,
  eid: number,
  characterId: string,
  cause: DeathCause,
  ageSeconds: number,
): SimulationLogEvent {
  return append(world, {
    eventId: nextEventId(world),
    type: 'character.died',
    tick: world.tick,
    elapsedSeconds: world.elapsedSeconds,
    participants: [characterId],
    location: { x: Position.x[eid], y: Position.y[eid] },
    payload: { cause, ageSeconds },
  });
}

export function historyFor(world: SimulationWorld, id: string): SimulationLogEvent[] {
  return eventsFor(world, id);
}

export function historyForPair(
  world: SimulationWorld,
  a: string,
  b: string,
): SimulationLogEvent[] {
  return eventsForPair(world, a, b);
}
