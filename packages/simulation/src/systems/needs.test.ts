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
  HUNGER_EAT_AT,
  HUNGER_GAIN_PER_SECOND,
  HUNGER_RECOVERY_PER_SECOND,
  THIRST_DRINK_AT,
  THIRST_GAIN_PER_SECOND,
  THIRST_RECOVERY_PER_SECOND,
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
  it('raises fatigue, hunger and thirst while a character is active', () => {
    const { world, eid, hunger } = character(5, 0.2);
    const thirst = Needs.thirst[eid];

    updateNeeds(world, 1);

    expect(Needs.fatigue[eid]).toBeCloseTo(0.2 + fatigueGainPerSecond(5));
    expect(Needs.hunger[eid]).toBeCloseTo(hunger + HUNGER_GAIN_PER_SECOND);
    expect(Needs.thirst[eid]).toBeCloseTo(thirst + THIRST_GAIN_PER_SECOND);
    expect(Condition.resting[eid]).toBe(0);
    expect(Condition.eating[eid]).toBe(0);
    expect(Condition.drinking[eid]).toBe(0);
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

  it('recovers a need only while its flag is set, and leaves the flag alone', () => {
    const { world, eid } = character(5, 0.5);
    Needs.hunger[eid] = 0.5;
    Needs.thirst[eid] = 0.5;
    Condition.resting[eid] = 1;
    Condition.eating[eid] = 1;
    Condition.drinking[eid] = 1;

    updateNeeds(world, 1);

    expect(Needs.fatigue[eid]).toBeCloseTo(0.5 - FATIGUE_RECOVERY_PER_SECOND);
    expect(Needs.hunger[eid]).toBeCloseTo(0.5 - HUNGER_RECOVERY_PER_SECOND);
    expect(Needs.thirst[eid]).toBeCloseTo(0.5 - THIRST_RECOVERY_PER_SECOND);
    expect(Condition.resting[eid]).toBe(1);
    expect(Condition.eating[eid]).toBe(1);
    expect(Condition.drinking[eid]).toBe(1);
  });

  it('does not start a recovery when a need crosses the old threshold', () => {
    const { world, eid } = character(5, FATIGUE_REST_AT);
    Needs.hunger[eid] = HUNGER_EAT_AT;
    Needs.thirst[eid] = THIRST_DRINK_AT;

    updateNeeds(world, 1);

    expect(Condition.resting[eid]).toBe(0);
    expect(Condition.eating[eid]).toBe(0);
    expect(Condition.drinking[eid]).toBe(0);
    expect(Needs.fatigue[eid]).toBeGreaterThan(FATIGUE_REST_AT);
  });

  it('does not change the needs of a dead character', () => {
    const { world, eid, hunger } = character(5, 0.5);
    const thirst = Needs.thirst[eid];
    Lifecycle.state[eid] = LIFECYCLE_STATES.indexOf('dead');

    updateNeeds(world, 10);

    expect(Needs.fatigue[eid]).toBe(0.5);
    expect(Needs.hunger[eid]).toBe(hunger);
    expect(Needs.thirst[eid]).toBe(thirst);
    expect(Condition.resting[eid]).toBe(0);
    expect(Condition.eating[eid]).toBe(0);
    expect(Condition.drinking[eid]).toBe(0);
  });

  it('keeps fatigue inside the range when nobody chooses to rest', () => {
    const { world, eid } = character(1, 0.2);

    for (let i = 0; i < 2_000; i++) {
      updateNeeds(world, 0.1);
      expect(Needs.fatigue[eid]).toBeGreaterThanOrEqual(0);
      expect(Needs.fatigue[eid]).toBeLessThanOrEqual(1);
    }

    expect(Needs.fatigue[eid]).toBeCloseTo(1);
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

  it('keeps hunger inside the range when nobody chooses to eat', () => {
    const { world, eid } = character(5, 0.2);
    Needs.hunger[eid] = 0.2;

    for (let i = 0; i < 2_000; i++) {
      updateNeeds(world, 0.1);
      expect(Needs.hunger[eid]).toBeGreaterThanOrEqual(0);
      expect(Needs.hunger[eid]).toBeLessThanOrEqual(1);
    }

    expect(Needs.hunger[eid]).toBeCloseTo(1);
    expect(Condition.eating[eid]).toBe(0);
  });

  it('resumes a meal that was saved mid-recovery', () => {
    const { world, eid } = character(5, 0.2);
    Needs.hunger[eid] = 0.5;
    Condition.eating[eid] = 1;

    const persisted = capturePersistedWorld(world, createSimulationClock(), 1);
    const restored = restorePersistedWorld(persisted).world;
    const restoredId = restored.entityIds.get('walker');

    expect(persisted.entities[0].eating).toBe(true);
    expect(restoredId).toBeDefined();

    updateNeeds(restored, 1);
    updateMovement(restored, 1);

    expect(Condition.eating[restoredId!]).toBe(1);
    expect(Needs.hunger[restoredId!]).toBeCloseTo(0.5 - HUNGER_RECOVERY_PER_SECOND);
    expect(Position.x[restoredId!]).toBe(10);
  });
});
