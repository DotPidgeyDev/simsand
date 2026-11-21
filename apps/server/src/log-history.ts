import type { SimulationLogEvent } from '@simsand/shared';

function eventSequence(eventId: string): number {
  const match = /^log-(\d+)$/.exec(eventId);

  return match ? Number(match[1]) : 0;
}

export function compareLogEvents(left: SimulationLogEvent, right: SimulationLogEvent): number {
  if (left.tick !== right.tick) return left.tick - right.tick;

  return eventSequence(left.eventId) - eventSequence(right.eventId);
}

// The live list is the newest window. The store keeps what that window
// has already dropped. The same event id is one fact, and the live copy wins.
export function mergeHistory(
  retained: readonly SimulationLogEvent[],
  live: readonly SimulationLogEvent[],
): SimulationLogEvent[] {
  const byId = new Map<string, SimulationLogEvent>();

  for (const event of retained) byId.set(event.eventId, event);
  for (const event of live) byId.set(event.eventId, event);

  return [...byId.values()].sort(compareLogEvents);
}
