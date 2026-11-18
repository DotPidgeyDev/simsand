import type { ActionId, ActionResult, MemoryKind, SimulationLogEvent, SimulationLogType } from '@simsand/shared';

import { Position } from '../components/position.js';
import type { SimulationWorld } from '../core/world.js';
import { rememberEvent } from '../social/memories.js';
import { pairKey, rememberMeeting, sortedPair } from '../social/relationships.js';

export const LOG_LIMIT = 10_000;

function nextEventId(world: SimulationWorld): string {
  return `log-${world.nextLogId++}`;
}

function append(world: SimulationWorld, event: SimulationLogEvent): SimulationLogEvent {
  world.log.push(event);

  if (world.log.length > LOG_LIMIT) {
    world.log.splice(0, world.log.length - LOG_LIMIT);
  }

  return event;
}

function pairEventThisTick(
  world: SimulationWorld,
  type: SimulationLogType,
  a: string,
  b: string,
): SimulationLogEvent | undefined {
  const key = pairKey(a, b);

  for (let i = world.log.length - 1; i >= 0; i--) {
    const event = world.log[i];

    if (event.tick !== world.tick) break;
    if (event.type !== type) continue;
    if (event.participants.length < 2) continue;
    if (pairKey(event.participants[0], event.participants[1]) === key) return event;
  }

  return undefined;
}

function recordSocialCompletion(
  world: SimulationWorld,
  initiatorEid: number,
  initiatorId: string,
  otherId: string,
  type: SimulationLogType,
  action: 'greet' | 'comfort',
  memory: MemoryKind,
): SimulationLogEvent {
  const existing = pairEventThisTick(world, type, initiatorId, otherId);

  if (existing) return existing;

  const event: SimulationLogEvent = {
    eventId: nextEventId(world),
    type,
    tick: world.tick,
    elapsedSeconds: world.elapsedSeconds,
    participants: sortedPair(initiatorId, otherId),
    location: { x: Position.x[initiatorEid], y: Position.y[initiatorEid] },
    payload: { action, result: 'completed', initiator: initiatorId },
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

export function historyFor(world: SimulationWorld, id: string): SimulationLogEvent[] {
  return world.log.filter((event) => event.participants.includes(id));
}
