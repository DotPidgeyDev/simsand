import { addEntity, addComponents } from 'bitecs';

import { ACTION_IDS, ACTION_OUTCOMES } from '@simsand/shared';
import type { ActionCooldowns, ActionEnding, ActionId, CharacterProfile, ProfessionId, SpriteId } from '@simsand/shared';

import { assertCharacterProfile, assertProfessionId, assertSpriteId, generateCharacterProfile, professionFor, startingAgeSeconds, writeCharacterProfile } from '../characters/profile.js';
import { emptyCooldowns } from '../systems/actions.js';
import type { SimulationWorld } from '../core/world.js';

import { Action } from '../components/action.js';
import { Attributes } from '../components/attributes.js';
import { Appearance } from '../components/appearance.js';
import { Condition } from '../components/condition.js';
import { Identity } from '../components/identity.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';
import { Personality } from '../components/personality.js';
import { Position } from '../components/position.js';
import { Profession } from '../components/profession.js';
import { Velocity } from '../components/velocity.js';

export interface CharacterDefinition extends Partial<CharacterProfile> {
  id: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  color: number;
  sprite: SpriteId;
  // Seeded from the world seed and ID when missing.
  profession?: ProfessionId;
  resting?: boolean;
  eating?: boolean;
  drinking?: boolean;
  working?: boolean;
  ageSeconds?: number;
  action?: ActionId;
  actionSeconds?: number;
  cooldowns?: ActionCooldowns;
  outcome?: ActionEnding | null;
  actionTarget?: string;
  viewerId?: string | null;
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

  if (definition.viewerId != null && world.characterByViewer.has(definition.viewerId)) {
    const existing = world.characterByViewer.get(definition.viewerId);
    throw new Error(`Viewer ${definition.viewerId} already has character ${existing}`);
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
    Condition,
    Action,
    Profession,
  );

  Identity.id[eid] = definition.id;
  const profile = profileFor(world, definition);
  writeCharacterProfile(eid, profile);
  Lifecycle.ageSeconds[eid] = definition.ageSeconds ?? startingAgeSeconds(
    world.seed,
    definition.id,
    profile.attributes.constitution,
  );
  Condition.resting[eid] = definition.resting ? 1 : 0;
  Condition.eating[eid] = definition.eating ? 1 : 0;
  Condition.drinking[eid] = definition.drinking ? 1 : 0;
  Condition.working[eid] = definition.working ? 1 : 0;
  Action.kind[eid] = ACTION_IDS.indexOf(definition.action ?? 'move');
  Action.elapsed[eid] = definition.actionSeconds ?? 0;
  const cooldowns = definition.cooldowns ?? emptyCooldowns();

  for (const id of ACTION_IDS) {
    Action.cooldown[id][eid] = cooldowns[id];
  }

  Action.outcomeAction[eid] = definition.outcome ? ACTION_IDS.indexOf(definition.outcome.action) : -1;
  Action.outcomeResult[eid] = definition.outcome ? ACTION_OUTCOMES.indexOf(definition.outcome.result) : 0;
  Action.target[eid] = definition.actionTarget ?? '';
  claimViewer(world, definition.id, definition.viewerId);

  Position.x[eid] = definition.x;
  Position.y[eid] = definition.y;

  Velocity.x[eid] = definition.velocityX;
  Velocity.y[eid] = definition.velocityY;

  Appearance.color[eid] = definition.color;
  Appearance.sprite[eid] = assertSpriteId(definition.sprite);
  Profession.id[eid] = assertProfessionId(definition.profession ?? professionFor(world.seed, definition.id));

  return eid;
}

function claimViewer(
  world: SimulationWorld,
  characterId: string,
  viewerId: string | null | undefined,
): void {
  if (viewerId == null) return;

  world.characterByViewer.set(viewerId, characterId);
  world.viewerByCharacter.set(characterId, viewerId);
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