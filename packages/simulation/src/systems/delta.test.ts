import { describe, expect, it } from 'vitest';

import { createWorldDelta } from './delta.js';

import type { WorldSnapshot } from '@simsand/shared';

describe('createWorldDelta', () => {
  const map = { width: 1, height: 1, tiles: [0] };

  const previous: WorldSnapshot = {
    tick: 10,
    elapsedSeconds: 1,
    map,
    entities: [
      {
        id: 'character-0001',
        x: 10,
        y: 10,
        color: 0xffffff,
        sprite: 'wanderer',
        resting: false,
        eating: false,
        drinking: false,
        working: false,
        lifecycle: 'alive',
        inventory: [],
      },
      {
        id: 'character-0002',
        x: 20,
        y: 20,
        color: 0xff0000,
        sprite: 'wanderer',
        resting: false,
        eating: false,
        drinking: false,
        working: false,
        lifecycle: 'alive',
        inventory: [{ item: 'goods', quantity: 1 }],
      },
    ],
    nodes: [{ x: 0, y: 0, item: 'material', quantity: 3 }],
  };

  it('only includes entities whose state changed', () => {
    const current: WorldSnapshot = {
      tick: 11,
      elapsedSeconds: 1.1,
      map,
      entities: [
        { ...previous.entities[0]!, x: 11 },
        previous.entities[1]!,
      ],
      nodes: previous.nodes,
    };

    const delta = createWorldDelta(previous, current);

    expect(delta.tick).toBe(11);
    expect(delta.entities).toHaveLength(1);
    expect(delta.entities[0]!.id).toBe('character-0001');
    expect(delta.nodes).toBeUndefined();
  });

  it('includes newly created entities', () => {
    const current: WorldSnapshot = {
      tick: 11,
      elapsedSeconds: 1.1,
      map,
      entities: [
        ...previous.entities,
        {
          id: 'character-0003',
          x: 30,
          y: 30,
          color: 0x00ff00,
          sprite: 'wanderer',
          resting: false,
          eating: false,
          drinking: false,
          working: false,
          lifecycle: 'alive',
          inventory: [],
        },
      ],
      nodes: previous.nodes,
    };

    const delta = createWorldDelta(previous, current);

    expect(delta.entities).toHaveLength(1);
    expect(delta.entities[0]!.id).toBe('character-0003');
  });

  it('lists the IDs of entities that no longer exist', () => {
    const current: WorldSnapshot = {
      tick: 11,
      elapsedSeconds: 1.1,
      map,
      entities: [previous.entities[1]!],
      nodes: previous.nodes,
    };

    const delta = createWorldDelta(previous, current);

    expect(delta.entities).toHaveLength(0);
    expect(delta.removed).toEqual(['character-0001']);
  });

  it('includes a character who died without moving', () => {
    const delta = createWorldDelta(previous, {
      ...previous,
      tick: 11,
      entities: [
        { ...previous.entities[0]!, lifecycle: 'dead', resting: false },
        previous.entities[1]!,
      ],
    });

    expect(delta.entities.map((entity) => entity.id)).toEqual(['character-0001']);
  });

  it('includes a character who started or stopped resting without moving', () => {
    const delta = createWorldDelta(previous, {
      ...previous,
      tick: 11,
      entities: [
        { ...previous.entities[0]!, resting: true },
        previous.entities[1]!,
      ],
    });

    expect(delta.entities.map((entity) => entity.id)).toEqual(['character-0001']);
  });

  it('includes a character whose inventory changed without moving', () => {
    const delta = createWorldDelta(previous, {
      ...previous,
      tick: 11,
      entities: [
        { ...previous.entities[0]!, inventory: [{ item: 'goods', quantity: 1 }] },
        previous.entities[1]!,
      ],
    });

    expect(delta.entities.map((entity) => entity.id)).toEqual(['character-0001']);
    expect(delta.entities[0]!.inventory).toEqual([{ item: 'goods', quantity: 1 }]);
  });

  it('replaces the node list when a pile changes', () => {
    const delta = createWorldDelta(previous, {
      ...previous,
      tick: 11,
      nodes: [{ x: 0, y: 0, item: 'material', quantity: 2 }],
    });

    expect(delta.entities).toHaveLength(0);
    expect(delta.nodes).toEqual([{ x: 0, y: 0, item: 'material', quantity: 2 }]);
  });

  it('returns an empty delta when nothing changed', () => {
    const delta = createWorldDelta(previous, {
      ...previous,
      tick: 11,
      elapsedSeconds: 1.1,
    });

    expect(delta.entities).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
    expect(delta.nodes).toBeUndefined();
  });
});
