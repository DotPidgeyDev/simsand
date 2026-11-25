import { describe, expect, it } from 'vitest';

import { ACTION_IDS } from '@simsand/shared';

import { Action } from '../components/action.js';
import { Needs } from '../components/needs.js';
import { Personality } from '../components/personality.js';
import { Position } from '../components/position.js';
import { createWorldMap } from '../core/map.js';
import { createSimulationWorld } from '../core/world.js';
import { createCharacter } from '../entities/create-character.js';
import { grantItem } from '../economy/inventory.js';
import { nodeKey } from '../economy/nodes.js';
import { MIN_ACTION_SECONDS, updateActions } from './actions.js';
import { createWorldDelta } from './delta.js';
import { createWorldSnapshot } from './snapshot.js';

describe('createWorldSnapshot', () => {
  it('puts inventories and resource piles on the render snapshot', () => {
    const map = createWorldMap(8, 8, 'grass');
    const world = createSimulationWorld(map, 1);
    world.nodes.set(nodeKey(map.width, 3, 2), { x: 3, y: 2, item: 'material', quantity: 3 });
    world.nodes.set(nodeKey(map.width, 1, 4), { x: 1, y: 4, item: 'material', quantity: 1 });

    const eid = createCharacter(world, {
      id: 'carrier',
      x: 3.5,
      y: 2.5,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'wanderer',
    });
    grantItem(world, 'carrier', 'goods', 2);

    const snapshot = createWorldSnapshot(world, 7, 0.7);

    expect(snapshot.entities).toEqual([
      {
        id: 'carrier',
        x: 3.5,
        y: 2.5,
        color: 0xffffff,
        sprite: 'wanderer',
        resting: false,
        eating: false,
        drinking: false,
        working: false,
        lifecycle: 'alive',
        inventory: [{ item: 'goods', quantity: 2 }],
      },
    ]);
    expect(snapshot.nodes).toEqual([
      { x: 3, y: 2, item: 'material', quantity: 3 },
      { x: 1, y: 4, item: 'material', quantity: 1 },
    ]);

    Action.kind[eid] = ACTION_IDS.indexOf('gather');
    Action.elapsed[eid] = MIN_ACTION_SECONDS;
    Needs.hunger[eid] = 0.6;
    Needs.thirst[eid] = 0.2;
    Needs.fatigue[eid] = 0.2;
    Personality.industriousness[eid] = 1;
    Position.x[eid] = 3.5;
    Position.y[eid] = 2.5;
    updateActions(world, 0.1);

    const after = createWorldSnapshot(world, 8, 0.8);
    const delta = createWorldDelta(snapshot, after);

    expect(after.entities[0]?.inventory).toEqual([
      { item: 'goods', quantity: 2 },
      { item: 'material', quantity: 1 },
    ]);
    expect(delta.entities.map((entity) => entity.id)).toContain('carrier');
    expect(delta.nodes).toEqual([
      { x: 3, y: 2, item: 'material', quantity: 2 },
      { x: 1, y: 4, item: 'material', quantity: 1 },
    ]);
  });
});
