import { describe, expect, it } from 'vitest';

import { LIFECYCLE_STATES } from '@simsand/shared';

import { Attributes } from '../components/attributes.js';
import { Condition } from '../components/condition.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';
import { Position } from '../components/position.js';
import { createSimulationClock } from '../core/clock.js';
import { capturePersistedWorld, restorePersistedWorld } from '../core/persistence.js';
import { createSimulationWorld } from '../core/world.js';
import { createCharacter } from '../entities/create-character.js';
import { updateMovement } from './movement.js';
import {
  FATIGUE_RECOVERY_PER_SECOND,
  FATIGUE_REST_AT,
  FATIGUE_RESUME_AT,
  fatigueGainPerSecond,
  updateNeeds,
} from './needs.js';

function character(constitution = 5, fatigue = 0.2) {
  const world = createSimulationWorld();
  const eid = createCharacter(world, {
    id: 'walker',
    x: 10,
    y: 10,
    velocityX: 1,
    velocityY: 0,
    color: 0xffffff,
    sprite: 'wanderer',
  });

  Attributes.constitution[eid] = constitution;
  Needs.fatigue[eid] = fatigue;
  const hunger = Needs.hunger[eid];

  return { world, eid, hunger };
}

describe('updateNeeds', () => {
  it('raises fatigue while a character is active and leaves hunger alone', () => {
    const { world, eid, hunger } = character(5, 0.2);

    updateNeeds(world, 1);

    expect(Needs.fatigue[eid]).toBeCloseTo(0.2 + fatigueGainPerSecond(5));
    expect(Needs.hunger[eid]).toBe(hunger);
    expect(Condition.resting[eid]).toBe(0);
  });

  it('lets a hardy character tire more slowly', () => {
    const world = createSimulationWorld();

    function add(id: string, constitution: number): number {
      const eid = createCharacter(world, {
        id,
        x: 10,
        y: 10,
        velocityX: 1,
        velocityY: 0,
        color: 0xffffff,
        sprite: 'wanderer',
      });

      Attributes.constitution[eid] = constitution;
      Needs.fatigue[eid] = 0.2;
      return eid;
    }

    const weak = add('weak', 1);
    const hardy = add('hardy', 10);

    updateNeeds(world, 10);

    expect(Needs.fatigue[weak]).toBeGreaterThan(Needs.fatigue[hardy]);
    expect(fatigueGainPerSecond(1)).toBeCloseTo(fatigueGainPerSecond(10) * 10);
  });

  it('stops a character at the rest threshold and then lets them recover', () => {
    const { world, eid } = character(5, FATIGUE_REST_AT - 0.001);

    updateNeeds(world, 1);
    expect(Condition.resting[eid]).toBe(1);

    const beforeMove = Position.x[eid];
    updateMovement(world, 1);
    expect(Position.x[eid]).toBe(beforeMove);

    const restingFatigue = Needs.fatigue[eid];
    updateNeeds(world, 1);
    expect(Needs.fatigue[eid]).toBeCloseTo(restingFatigue - FATIGUE_RECOVERY_PER_SECOND);
    expect(Condition.resting[eid]).toBe(1);
  });

  it('resumes movement only after fatigue falls to the resume threshold', () => {
    const { world, eid } = character(5, FATIGUE_RESUME_AT + 0.001);
    Condition.resting[eid] = 1;

    updateNeeds(world, 1);
    expect(Condition.resting[eid]).toBe(0);

    updateMovement(world, 1);
    expect(Position.x[eid]).toBe(11);
  });

  it('does not tire a dead character', () => {
    const { world, eid } = character(5, 0.5);
    Lifecycle.state[eid] = LIFECYCLE_STATES.indexOf('dead');

    updateNeeds(world, 10);

    expect(Needs.fatigue[eid]).toBe(0.5);
    expect(Condition.resting[eid]).toBe(0);
  });

  it('keeps fatigue inside the range and cycles out of rest over a long run', () => {
    const { world, eid } = character(1, 0.2);
    let sawRest = false;

    for (let i = 0; i < 2_000; i++) {
      updateNeeds(world, 0.1);
      if (Condition.resting[eid] === 1) sawRest = true;
      expect(Needs.fatigue[eid]).toBeGreaterThanOrEqual(0);
      expect(Needs.fatigue[eid]).toBeLessThanOrEqual(1);
    }

    expect(sawRest).toBe(true);

    for (let i = 0; i < 500 && Condition.resting[eid] === 1; i++) {
      updateNeeds(world, 0.1);
    }

    expect(Condition.resting[eid]).toBe(0);
  });

  it('resumes a rest that was saved mid-recovery', () => {
    const { world, eid } = character(5, 0.5);
    Condition.resting[eid] = 1;

    const persisted = capturePersistedWorld(world, createSimulationClock(), 1);
    const restored = restorePersistedWorld(persisted).world;
    const restoredId = restored.entityIds.get('walker');

    expect(persisted.entities[0].resting).toBe(true);
    expect(restoredId).toBeDefined();

    updateNeeds(restored, 1);
    updateMovement(restored, 1);

    expect(Condition.resting[restoredId!]).toBe(1);
    expect(Needs.fatigue[restoredId!]).toBeCloseTo(0.5 - FATIGUE_RECOVERY_PER_SECOND);
    expect(Position.x[restoredId!]).toBe(10);
  });
});
