import { addEntity, addComponents } from 'bitecs';

import type { CharacterProfile } from '@simsand/shared';

import { assertCharacterProfile, generateCharacterProfile, writeCharacterProfile } from '../characters/profile.js';
import type { SimulationWorld } from '../core/world.js';

import { Attributes } from '../components/attributes.js';
import { Appearance } from '../components/appearance.js';
import { Identity } from '../components/identity.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';
import { Personality } from '../components/personality.js';
import { Position } from '../components/position.js';
import { Velocity } from '../components/velocity.js';

export interface CharacterDefinition extends Partial<CharacterProfile> {
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

  if (world.entityIds.has(definition.id)) {
    throw new Error(`Character ID already exists: ${definition.id}`);
  }

  const eid = addEntity(world.ecs);
  world.entityIds.set(definition.id, eid);

  addComponents(
    world.ecs,
    eid,
    Identity,
    Position,
    Velocity,
    Appearance,
    Attributes,
    Personality,
    Needs,
    Lifecycle,
  );

  Identity.id[eid] = definition.id;
  writeCharacterProfile(eid, profileFor(world, definition));

  Position.x[eid] = definition.x;
  Position.y[eid] = definition.y;

  Velocity.x[eid] = definition.velocityX;
  Velocity.y[eid] = definition.velocityY;

  Appearance.color[eid] = definition.color;
  Appearance.sprite[eid] = definition.sprite;

  return eid;
}

// A definition without a name gets a seeded profile. A provided profile is
// checked and stored as given, which is how a save is restored.
function profileFor(world: SimulationWorld, definition: CharacterDefinition): CharacterProfile {
  if (definition.name === undefined) {
    return generateCharacterProfile(world.seed, definition.id);
  }

  return assertCharacterProfile({
    name: definition.name,
    attributes: definition.attributes,
    personality: definition.personality,
    needs: definition.needs,
    lifecycle: definition.lifecycle,
  });
}