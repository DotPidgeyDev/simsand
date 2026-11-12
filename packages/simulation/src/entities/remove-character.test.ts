import { describe, expect, it } from 'vitest';

import { createSimulationWorld } from '../core/world.js';
import { createWorldSnapshot } from '../systems/snapshot.js';
import { createCharacter } from './create-character.js';
import type { CharacterDefinition } from './create-character.js';
import { removeCharacter } from './remove-character.js';

function character(id: string, x = 1): CharacterDefinition {
  return {
    id,
    x,
    y: 1,
    velocityX: 0,
    velocityY: 0,
    color: 0xffffff,
    sprite: 1,
  };
}

function snapshotIds(world: ReturnType<typeof createSimulationWorld>) {
  return createWorldSnapshot(world, 0, 0).entities.map((entity) => entity.id);
}

describe('removeCharacter', () => {
  it('removes the character from snapshots by its stable ID', () => {
    const world = createSimulationWorld();
    createCharacter(world, character('character-0001'));
    createCharacter(world, character('character-0002'));

    expect(removeCharacter(world, 'character-0001')).toBe(true);

    expect(snapshotIds(world)).toEqual(['character-0002']);
  });

  it('returns false for an unknown ID', () => {
    const world = createSimulationWorld();

    expect(removeCharacter(world, 'character-9999')).toBe(false);
  });

  it('keeps stable IDs correct when a removed handle is reused', () => {
    const world = createSimulationWorld();
    createCharacter(world, character('character-0001', 5));
    removeCharacter(world, 'character-0001');

    createCharacter(world, character('character-0002', 9));

    expect(snapshotIds(world)).toEqual(['character-0002']);
    expect(removeCharacter(world, 'character-0001')).toBe(false);
    expect(createWorldSnapshot(world, 0, 0).entities[0].x).toBe(9);
  });

  it('allows an ID to be reused after removal but not while it exists', () => {
    const world = createSimulationWorld();
    createCharacter(world, character('character-0001'));

    expect(() => createCharacter(world, character('character-0001'))).toThrow(
      'Character ID already exists',
    );

    removeCharacter(world, 'character-0001');

    expect(() => createCharacter(world, character('character-0001'))).not.toThrow();
  });
});
