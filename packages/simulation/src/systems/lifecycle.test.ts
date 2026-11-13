import { describe, expect, it } from 'vitest';

import { LIFECYCLE_STATES } from '@simsand/shared';

import { Attributes } from '../components/attributes.js';
import { Condition } from '../components/condition.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';
import { Position } from '../components/position.js';
import { createSimulationWorld } from '../core/world.js';
import { createCharacter } from '../entities/create-character.js';
import { lifespanSeconds, updateLifecycle } from './lifecycle.js';
import { updateMovement } from './movement.js';
import { updateNeeds } from './needs.js';

function character(constitution = 5) {
  const world = createSimulationWorld();
  const eid = createCharacter(world, {
    id: 'elder',
    x: 10,
    y: 10,
    velocityX: 1,
    velocityY: 0,
    color: 0xffffff,
    sprite: 'elder',
  });

  Attributes.constitution[eid] = constitution;
  Lifecycle.ageSeconds[eid] = 0;
  return { world, eid };
}

describe('updateLifecycle', () => {
  it('gives a hardy character a longer life', () => {
    expect(lifespanSeconds(10)).toBe(lifespanSeconds(1) * 10);
  });

  it('ages a living character and leaves them alive before the span is up', () => {
    const { world, eid } = character(1);
    Lifecycle.ageSeconds[eid] = lifespanSeconds(1) - 1;

    updateLifecycle(world, 0.5);

    expect(Lifecycle.ageSeconds[eid]).toBeCloseTo(lifespanSeconds(1) - 0.5);
    expect(Lifecycle.state[eid]).toBe(LIFECYCLE_STATES.indexOf('alive'));
  });

  it('ends a life at the span, and that character then stays still', () => {
    const { world, eid } = character(1);
    Lifecycle.ageSeconds[eid] = lifespanSeconds(1) - 0.05;
    Needs.hunger[eid] = 0.4;
    Condition.eating[eid] = 1;

    updateLifecycle(world, 0.1);

    expect(Lifecycle.state[eid]).toBe(LIFECYCLE_STATES.indexOf('dead'));
    expect(Condition.eating[eid]).toBe(0);
    expect(Condition.resting[eid]).toBe(0);
    expect(Condition.drinking[eid]).toBe(0);

    updateNeeds(world, 10);
    updateMovement(world, 1);

    expect(Needs.hunger[eid]).toBe(0.4);
    expect(Position.x[eid]).toBe(10);
    expect(Lifecycle.ageSeconds[eid]).toBeCloseTo(lifespanSeconds(1) + 0.05);
  });

  it('does not keep aging a character who is already dead', () => {
    const { world, eid } = character(1);
    Lifecycle.state[eid] = LIFECYCLE_STATES.indexOf('dead');
    Lifecycle.ageSeconds[eid] = 10;

    updateLifecycle(world, 5);

    expect(Lifecycle.ageSeconds[eid]).toBe(10);
  });
});
