import { addEntity, addComponents } from 'bitecs';

import type { SimulationWorld } from '../core/world.js';

import { Identity } from '../components/identity.js';
import { Position } from '../components/position.js';
import { Velocity } from '../components/velocity.js';
import { Appearance } from '../components/appearance.js';

export interface CharacterDefinition {
  id: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  color: number;
  sprite: number;
}

// pass in the world and character attr, and get the id of a new char entity added to the world.
export function createCharacter(
  world: SimulationWorld,
  definition: CharacterDefinition,
): number {
  if (!definition.id.trim()) {
    throw new Error('Character ID cannot be empty');
  }

  const eid = addEntity(world.ecs);

  addComponents(
    world.ecs,
    eid,
    Identity,
    Position,
    Velocity,
    Appearance,
  );

  Identity.id[eid] = definition.id;

  Position.x[eid] = definition.x;
  Position.y[eid] = definition.y;

  Velocity.x[eid] = definition.velocityX;
  Velocity.y[eid] = definition.velocityY;

  Appearance.color[eid] = definition.color;
  Appearance.sprite[eid] = definition.sprite;

  return eid;
}