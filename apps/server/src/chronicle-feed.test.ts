import { describe, expect, it } from 'vitest';

import type { ChronicleEntry, ChronicleTier } from '@simsand/shared';

import { ChronicleFeed } from './chronicle-feed.js';

function entry(eventId: string, tier: ChronicleTier = 'notable'): ChronicleEntry {
  return {
    eventId,
    type: 'character.greeted',
    tick: 1,
    elapsedSeconds: 0.1,
    participants: ['a', 'b'],
    score: 0.35,
    tier,
    summary: 'a met b',
  };
}

describe('ChronicleFeed', () => {
  it('keeps feed-tier entries oldest first and drops minor ones', () => {
    const feed = new ChronicleFeed();

    expect(feed.push([entry('log-1'), entry('log-2', 'minor'), entry('log-3', 'significant')]))
      .toEqual([entry('log-1'), entry('log-3', 'significant')]);
    expect(feed.recent().map((item) => item.eventId)).toEqual(['log-1', 'log-3']);
  });

  it('keeps only the newest entries up to its limit', () => {
    const feed = new ChronicleFeed(2);

    feed.push([entry('log-1'), entry('log-2')]);
    feed.push([entry('log-3')]);

    expect(feed.recent().map((item) => item.eventId)).toEqual(['log-2', 'log-3']);
  });
});
