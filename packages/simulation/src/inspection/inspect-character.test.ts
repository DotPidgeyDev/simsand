import { describe, expect, it } from 'vitest';

import { TERRAIN_TYPES } from '@simsand/shared';

import { generateCharacterProfile } from '../characters/profile.js';
import { createWorldMap } from '../core/map.js';
import { createSimulationWorld } from '../core/world.js';
import { createCharacter } from '../entities/create-character.js';
import { inspectCharacter } from './inspect-character.js';

describe('inspectCharacter', () => {
  it('reports full state and the terrain under the character', () => {
    const map = createWorldMap(8, 8);
    map.tiles[3 * 8 + 2] = TERRAIN_TYPES.indexOf('water');
    const world = createSimulationWorld(map);

    createCharacter(world, {
      id: 'swimmer',
      x: 2.5,
      y: 3.9,
      velocityX: 0.25,
      velocityY: -0.5,
      color: 0x123456,
      sprite: 2,
    });

    expect(inspectCharacter(world, 'swimmer')).toEqual({
      id: 'swimmer',
      x: 2.5,
      y: expect.closeTo(3.9),
      velocityX: 0.25,
      velocityY: -0.5,
      color: 0x123456,
      sprite: 2,
      ...generateCharacterProfile(0, 'swimmer'),
      tile: { x: 2, y: 3, terrain: 'water' },
    });
  });

  it('reports the last tile for a character on the far edge of the map', () => {
    const world = createSimulationWorld(createWorldMap(8, 8, 'dirt'));

    createCharacter(world, { id: 'edge', x: 8, y: 8, velocityX: 0, velocityY: 0, color: 0, sprite: 1 });

    expect(inspectCharacter(world, 'edge')?.tile).toEqual({ x: 7, y: 7, terrain: 'dirt' });
  });

  it('returns undefined for an unknown character', () => {
    expect(inspectCharacter(createSimulationWorld(), 'nobody')).toBeUndefined();
  });
});
