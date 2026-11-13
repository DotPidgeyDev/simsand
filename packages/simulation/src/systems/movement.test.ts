import { query } from 'bitecs';
import { describe, expect, it } from 'vitest';

import { createWorldMap } from '../core/map.js';
import { createSimulationWorld } from '../core/world.js';
import { createCharacter } from '../entities/create-character.js';
import { createPopulation } from '../entities/create-population.js';
import { LIFECYCLE_STATES } from '@simsand/shared';

import { Lifecycle } from '../components/lifecycle.js';
import { Position } from '../components/position.js';
import { Velocity } from '../components/velocity.js';
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
      sprite: 'wanderer',
    });

    updateMovement(world, 0.5);

    expect(Position.x[eid]).toBe(11);
    expect(Position.y[eid]).toBe(9.5);
  });

  it('bounces characters off the world boundaries', () => {
    const world = createSimulationWorld();

    const eid = createCharacter(world, {
      id: 'test-character',
      x: 63.5,
      y: 0.5,
      velocityX: 2,
      velocityY: -2,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    updateMovement(world, 1);

    expect(Position.x[eid]).toBe(62.5);
    expect(Position.y[eid]).toBe(1.5);
    expect(Velocity.x[eid]).toBe(-2);
    expect(Velocity.y[eid]).toBe(2);
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
      sprite: 'wanderer',
    });

    updateMovement(world, 1);

    expect(Position.x[eid]).toBe(6);
    expect(Position.y[eid]).toBe(16);
  });

  it('stays inside the map even when one step overshoots by more than the map size', () => {
    const world = createSimulationWorld(createWorldMap(10, 10));

    const eid = createCharacter(world, {
      id: 'test-character',
      x: 5,
      y: 5,
      velocityX: 100,
      velocityY: -100,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    updateMovement(world, 1);

    expect(Position.x[eid]).toBe(0);
    expect(Position.y[eid]).toBe(10);
  });

  it('leaves dead characters where they are', () => {
    const world = createSimulationWorld();

    const eid = createCharacter(world, {
      id: 'test-character',
      x: 10,
      y: 10,
      velocityX: 2,
      velocityY: 2,
      color: 0xffffff,
      sprite: 'wanderer',
    });

    Lifecycle.state[eid] = LIFECYCLE_STATES.indexOf('dead');
    updateMovement(world, 1);

    expect(Position.x[eid]).toBe(10);
    expect(Position.y[eid]).toBe(10);
    expect(Velocity.x[eid]).toBe(2);
  });

  it('does not pin characters in the corners over a long run', () => {
    const world = createSimulationWorld();
    createPopulation(world, 20, 12345);

    const speeds = query(world.ecs, [Velocity]).map((eid) => Math.hypot(Velocity.x[eid], Velocity.y[eid]));

    // 30,000 ticks is about 50 minutes of simulated time.
    for (let i = 0; i < 30_000; i++) {
      updateMovement(world, 0.1);
    }

    const eids = query(world.ecs, [Position, Velocity]);
    const atCorner = eids.filter((eid) =>
      [0, 64].includes(Math.round(Position.x[eid])) && [0, 64].includes(Math.round(Position.y[eid])));

    expect(atCorner).toHaveLength(0);
    expect(eids.every((eid) =>
      Position.x[eid] >= 0 && Position.x[eid] <= 64 && Position.y[eid] >= 0 && Position.y[eid] <= 64)).toBe(true);
    expect(eids.map((eid) => Math.hypot(Velocity.x[eid], Velocity.y[eid]))).toEqual(speeds);
  });
});