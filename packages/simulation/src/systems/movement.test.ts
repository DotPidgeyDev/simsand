import { describe, expect, it } from 'vitest';

import { createWorldMap } from '../core/map.js';
import { createSimulationWorld } from '../core/world.js';
import { createCharacter } from '../entities/create-character.js';
import { Position } from '../components/position.js';
import { updateMovement } from './movement.js';

describe('updateMovement', () => {
  it('updates character positions using velocity', () => {
    const world = createSimulationWorld();

    const eid = createCharacter(world, {
      id: 'test-character',
      x: 10,
      y: 10,
      velocityX: 2,
      velocityY: -1,
      color: 0xffffff,
      sprite: 1,
    });

    updateMovement(world, 0.5);

    expect(Position.x[eid]).toBe(11);
    expect(Position.y[eid]).toBe(9.5);
  });

  it('keeps characters inside world boundaries', () => {
    const world = createSimulationWorld();

    const eid = createCharacter(world, {
      id: 'test-character',
      x: 63.5,
      y: 0.5,
      velocityX: 2,
      velocityY: -2,
      color: 0xffffff,
      sprite: 1,
    });

    updateMovement(world, 1);

    expect(Position.x[eid]).toBe(64);
    expect(Position.y[eid]).toBe(0);
  });

  it('uses the map dimensions as the world boundaries', () => {
    const world = createSimulationWorld(createWorldMap(10, 20));

    const eid = createCharacter(world, {
      id: 'test-character',
      x: 9,
      y: 19,
      velocityX: 5,
      velocityY: 5,
      color: 0xffffff,
      sprite: 1,
    });

    updateMovement(world, 1);

    expect(Position.x[eid]).toBe(10);
    expect(Position.y[eid]).toBe(20);
  });
});