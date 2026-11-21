import { describe, expect, it } from 'vitest';

import type { SimulationLogEvent } from '@simsand/shared';

import { mergeHistory } from './log-history.js';

function event(eventId: string, tick: number, participant: string): SimulationLogEvent {
  return {
    eventId,
    type: 'action.ended',
    tick,
    elapsedSeconds: tick / 10,
    participants: [participant],
    location: { x: 1, y: 1 },
    payload: { action: 'eat', result: 'completed', initiator: participant },
  };
}

describe('mergeHistory', () => {
  it('keeps a retained event the live log has dropped and prefers the live copy', () => {
    const retained = [event('log-1', 1, 'left'), event('log-2', 2, 'left')];
    const live = [event('log-2', 2, 'left'), event('log-3', 3, 'left')];

    expect(mergeHistory(retained, live).map((entry) => entry.eventId)).toEqual([
      'log-1',
      'log-2',
      'log-3',
    ]);
  });
});
