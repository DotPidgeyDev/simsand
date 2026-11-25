import type { ChronicleEntry, ChronicleTier, SimulationLogEvent, SimulationLogType } from '@simsand/shared';

// First consequential type for Milestone 08. More types join this table
// as the director grows; action.ended noise stays out.
const SIGNIFICANCE: Partial<Record<SimulationLogType, { score: number; tier: ChronicleTier }>> = {
  'character.greeted': { score: 0.35, tier: 'notable' },
};

function summaryFor(event: SimulationLogEvent): string | undefined {
  if (event.type !== 'character.greeted' || event.payload.result !== 'completed') {
    return undefined;
  }

  const initiator = event.payload.initiator ?? event.participants[0];
  const other = event.participants.find((id) => id !== initiator) ?? event.participants[1];

  if (!initiator || !other) return undefined;

  return `${initiator} met ${other}`;
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
