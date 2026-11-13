import { describe, expect, it } from 'vitest';

import { LIFECYCLE_STATES, TERRAIN_TYPES } from '@simsand/shared';

import { generateCharacterProfile, startingAgeSeconds } from '../characters/profile.js';
import { actionAvailability, actionBias, actionUtilities, biasedUtilities, emptyCooldowns } from '../systems/actions.js';
import { derivedStats } from '../systems/needs.js';
import { createWorldMap } from '../core/map.js';
import { createSimulationWorld } from '../core/world.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';
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
      sprite: 'scout',
    });

    expect(inspectCharacter(world, 'swimmer')).toEqual({
      id: 'swimmer',
      x: 2.5,
      y: expect.closeTo(3.9),
      velocityX: 0.25,
      velocityY: -0.5,
      color: 0x123456,
      sprite: 'scout',
      ...generateCharacterProfile(0, 'swimmer'),
      resting: false,
      eating: false,
      drinking: false,
      ageSeconds: startingAgeSeconds(0, 'swimmer', generateCharacterProfile(0, 'swimmer').attributes.constitution),
      action: 'move',
      utilities: biasedUtilities(
        actionUtilities({
          ...generateCharacterProfile(0, 'swimmer').needs,
          curiosity: generateCharacterProfile(0, 'swimmer').personality.curiosity,
        }),
        actionBias(0, 'swimmer'),
      ),
      cooldowns: emptyCooldowns(),
      available: actionAvailability({
        alive: true,
        ...generateCharacterProfile(0, 'swimmer').needs,
        cooldowns: emptyCooldowns(),
      }),
      derived: derivedStats(generateCharacterProfile(0, 'swimmer').attributes.constitution),
      tile: { x: 2, y: 3, terrain: 'water' },
    });
  });

  it('offers a dead character only idle, even when a need is pressing', () => {
    const world = createSimulationWorld();
    const eid = createCharacter(world, {
      id: 'corpse',
      x: 1,
      y: 1,
      velocityX: 0,
      velocityY: 0,
      color: 0xffffff,
      sprite: 'elder',
    });

    Lifecycle.state[eid] = LIFECYCLE_STATES.indexOf('dead');
    Needs.hunger[eid] = 0.9;
    Needs.thirst[eid] = 0.9;
    Needs.fatigue[eid] = 0.9;

    expect(inspectCharacter(world, 'corpse')?.available).toEqual({
      idle: true,
      move: false,
      eat: false,
      rest: false,
      drink: false,
    });
  });

  it('reports the last tile for a character on the far edge of the map', () => {
    const world = createSimulationWorld(createWorldMap(8, 8, 'dirt'));

    createCharacter(world, { id: 'edge', x: 8, y: 8, velocityX: 0, velocityY: 0, color: 0, sprite: 'elder' });

    expect(inspectCharacter(world, 'edge')?.tile).toEqual({ x: 7, y: 7, terrain: 'dirt' });
  });

  it('returns undefined for an unknown character', () => {
    expect(inspectCharacter(createSimulationWorld(), 'nobody')).toBeUndefined();
  });
});
