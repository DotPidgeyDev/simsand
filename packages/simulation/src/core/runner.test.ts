import { describe, expect, it } from 'vitest';

import {
  createSimulationClock,
  createSimulationRunner,
  tickSimulation,
} from '../index.js';

import { createSimulationWorld } from './world.js';
import { createCharacter } from '../entities/create-character.js';
import { Position } from '../components/position.js';

describe('simulation runner', () => {
  it('runs movement and advances the clock', () => {
    const world = createSimulationWorld();

    const eid = createCharacter(world, {
      id: 'test-character',
      x: 10,
      y: 10,
      velocityX: 1,
      velocityY: 0,
      color: 0xffffff,
      sprite: 1,
    });

    const clock = createSimulationClock();
    const runner = createSimulationRunner(world, clock);

    tickSimulation(runner);

    expect(Position.x[eid]).toBeCloseTo(10.1);
    expect(clock.tick).toBe(1);
    expect(clock.elapsedSeconds).toBeCloseTo(0.1);
  });

  it('does not advance while paused', () => {
    const world = createSimulationWorld();
    const clock = createSimulationClock();
    const runner = createSimulationRunner(world, clock);

    runner.paused = true;

    tickSimulation(runner);

    expect(clock.tick).toBe(0);
    expect(clock.elapsedSeconds).toBe(0);
  });
});