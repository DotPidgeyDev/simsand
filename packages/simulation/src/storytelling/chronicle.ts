import { isInterventionLogEvent } from '@simsand/shared';
import type {
  ActionLogEvent,
  ChronicleEntry,
  ChronicleTier,
  InterventionLogEvent,
  SimulationLogEvent,
  SimulationLogType,
} from '@simsand/shared';

import type { SimulationWorld } from '../core/world.js';

// Consequential log types for stream presentation. Ordinary action.ended
// noise stays out. Scores choose a tier; they do not change simulation.
const SIGNIFICANCE: Partial<Record<SimulationLogType, { score: number; tier: ChronicleTier }>> = {
  'character.greeted': { score: 0.35, tier: 'notable' },
  'character.comforted': { score: 0.45, tier: 'notable' },
  'character.kept': { score: 0.4, tier: 'notable' },
  'character.confided': { score: 0.55, tier: 'significant' },
  'character.bluffed': { score: 0.5, tier: 'notable' },
  'item.transferred': { score: 0.5, tier: 'notable' },
  'item.traded': { score: 0.55, tier: 'significant' },
  'intervention.blessed': { score: 0.85, tier: 'dramatic' },
  'intervention.cursed': { score: 0.85, tier: 'dramatic' },
  'intervention.bounty': { score: 0.6, tier: 'significant' },
  'intervention.gifted': { score: 0.6, tier: 'significant' },
};

function pairIds(event: ActionLogEvent): { initiator: string; other: string } | undefined {
  const initiator = event.payload.initiator ?? event.participants[0];
  const other = event.participants.find((id) => id !== initiator) ?? event.participants[1];

  if (!initiator || !other) return undefined;

  return { initiator, other };
}

function summaryFor(event: SimulationLogEvent): string | undefined {
  if (isInterventionLogEvent(event)) return interventionSummary(event);

  return actionSummary(event);
}

function interventionSummary(event: InterventionLogEvent): string {
  switch (event.type) {
    case 'intervention.blessed':
      return `${event.payload.target} was blessed`;
    case 'intervention.cursed':
      return `${event.payload.target} was cursed with ${event.payload.need}`;
    case 'intervention.bounty': {
      const x = Math.floor(event.location.x);
      const y = Math.floor(event.location.y);

      return `A bounty of ${event.payload.quantity} ${event.payload.item} appeared at (${x}, ${y})`;
    }
    case 'intervention.gifted':
      return `${event.payload.target} received ${event.payload.quantity} ${event.payload.item}`;
  }
}

function actionSummary(event: ActionLogEvent): string | undefined {
  if (event.payload.result !== 'completed') return undefined;

  const pair = pairIds(event);

  if (!pair) return undefined;

  const { initiator, other } = pair;

  switch (event.type) {
    case 'character.greeted':
      return `${initiator} met ${other}`;
    case 'character.comforted':
      return `${initiator} comforted ${other}`;
    case 'character.kept':
      return `${initiator} stayed with ${other}`;
    case 'character.confided':
      return `${initiator} confided in ${other}`;
    case 'character.bluffed':
      return `${initiator} bluffed ${other}`;
    case 'item.transferred': {
      const quantity = event.payload.quantity ?? 1;
      const item = event.payload.item ?? 'goods';

      return `${initiator} gave ${quantity} ${item} to ${other}`;
    }
    case 'item.traded': {
      const quantity = event.payload.quantity ?? 1;
      const item = event.payload.item ?? 'food';
      const price = event.payload.price;

      if (price === undefined) {
        return `${initiator} bought ${quantity} ${item} from ${other}`;
      }

      return `${initiator} bought ${quantity} ${item} from ${other} for ${price} goods`;
    }
    default:
      return undefined;
  }
}

/** Score one log event into a chronicle entry, or skip it. */
export function chronicleEntryFromEvent(event: SimulationLogEvent): ChronicleEntry | undefined {
  const significance = SIGNIFICANCE[event.type];
  const summary = summaryFor(event);

  if (!significance || !summary) return undefined;

  return {
    eventId: event.eventId,
    type: event.type,
    tick: event.tick,
    elapsedSeconds: event.elapsedSeconds,
    participants: [...event.participants],
    location: { ...event.location },
    score: significance.score,
    tier: significance.tier,
    summary,
  };
}

/** Filter and score a log window. Order matches the input (usually tick order). */
export function chronicleFromEvents(events: readonly SimulationLogEvent[]): ChronicleEntry[] {
  const entries: ChronicleEntry[] = [];

  for (const event of events) {
    const entry = chronicleEntryFromEvent(event);

    if (entry) entries.push(entry);
  }

  return entries;
}

function logSequence(event: SimulationLogEvent): number {
  return Number(event.eventId.slice('log-'.length));
}

// Scores the live-log events written since `cursor`, a previous
// `world.nextLogId`. Pass the returned cursor to the next call. Reads the
// tail of the log only, so the cost follows what is new, not the log size.
export function chronicleSince(
  world: SimulationWorld,
  cursor: number,
): { entries: ChronicleEntry[]; cursor: number } {
  let start = world.log.length;

  while (start > 0 && logSequence(world.log[start - 1]!) >= cursor) start--;

  return {
    entries: chronicleFromEvents(world.log.slice(start)),
    cursor: world.nextLogId,
  };
}
