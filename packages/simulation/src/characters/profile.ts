import {
  ATTRIBUTE_MAX,
  ATTRIBUTE_MIN,
  ATTRIBUTE_NAMES,
  BASIC_NEEDS,
  LIFECYCLE_STATES,
  PERSONALITY_TRAITS,
} from '@simsand/shared';
import type {
  CharacterAttributes,
  CharacterNeeds,
  CharacterPersonality,
  CharacterProfile,
} from '@simsand/shared';

import { createRandom } from '../core/random.js';
import { Attributes } from '../components/attributes.js';
import { Identity } from '../components/identity.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';
import { Personality } from '../components/personality.js';

const NAME_MAX_LENGTH = 64;

// New characters start comfortable rather than desperate. Decay comes later,
// with the actions that can bring a need back down.
const INITIAL_NEED_MIN = 0.15;
const INITIAL_NEED_SPAN = 0.3;

const GIVEN_NAMES = [
  'Ada', 'Bram', 'Cora', 'Duff', 'Eda', 'Finn', 'Gita', 'Holt',
  'Isla', 'Jory', 'Kira', 'Lem', 'Mira', 'Ned', 'Opal', 'Penn',
];

const FAMILY_NAMES = [
  'Ash', 'Brook', 'Clay', 'Dunn', 'Elms', 'Flint', 'Grove', 'Hart',
  'Ives', 'Keen', 'Moss', 'Nye', 'Oak', 'Pike', 'Reed', 'Shaw',
];

// Mixes the world seed with the character ID so a profile never depends on
// how many other random numbers were drawn, and an old save gets the same
// profile whenever it is upgraded.
function profileSeed(worldSeed: number, id: string): number {
  let hash = worldSeed | 0;

  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 0x5bd1e995);
  }

  return hash >>> 0;
}

export function generateCharacterProfile(worldSeed: number, id: string): CharacterProfile {
  const random = createRandom(profileSeed(worldSeed, id));
  const given = GIVEN_NAMES[Math.floor(random() * GIVEN_NAMES.length)];
  const family = FAMILY_NAMES[Math.floor(random() * FAMILY_NAMES.length)];

  const attributes = {} as CharacterAttributes;

  for (const name of ATTRIBUTE_NAMES) {
    attributes[name] = ATTRIBUTE_MIN + Math.floor(random() * (ATTRIBUTE_MAX - ATTRIBUTE_MIN + 1));
  }

  const personality = {} as CharacterPersonality;

  for (const trait of PERSONALITY_TRAITS) {
    personality[trait] = random();
  }

  const needs = {} as CharacterNeeds;

  for (const need of BASIC_NEEDS) {
    needs[need] = INITIAL_NEED_MIN + random() * INITIAL_NEED_SPAN;
  }

  return { name: `${given} ${family}`, attributes, personality, needs, lifecycle: 'alive' };
}

export function assertCharacterProfile(value: unknown): CharacterProfile {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Character profile is missing');
  }

  const profile = value as Record<string, unknown>;

  if (typeof profile.name !== 'string' || profile.name.trim() === '' || profile.name.length > NAME_MAX_LENGTH) {
    throw new Error(`Character name must be 1-${NAME_MAX_LENGTH} characters`);
  }

  assertScores(
    profile.attributes,
    ATTRIBUTE_NAMES,
    (score) => typeof score === 'number' && Number.isInteger(score) && score >= ATTRIBUTE_MIN && score <= ATTRIBUTE_MAX,
    'Character attributes are missing or out of range',
  );
  assertScores(
    profile.personality,
    PERSONALITY_TRAITS,
    (score) => typeof score === 'number' && score >= 0 && score <= 1,
    'Character personality is missing or out of range',
  );
  assertScores(
    profile.needs,
    BASIC_NEEDS,
    (score) => typeof score === 'number' && score >= 0 && score <= 1,
    'Character needs are missing or out of range',
  );

  if (!(LIFECYCLE_STATES as readonly string[]).includes(String(profile.lifecycle))) {
    throw new Error(`Unknown lifecycle state: ${String(profile.lifecycle)}`);
  }

  return profile as unknown as CharacterProfile;
}

function assertScores(
  value: unknown,
  keys: readonly string[],
  valid: (score: unknown) => boolean,
  message: string,
): void {
  if (typeof value !== 'object' || value === null) {
    throw new Error(message);
  }

  const scores = value as Record<string, unknown>;

  if (Object.keys(scores).length !== keys.length || keys.some((key) => !valid(scores[key]))) {
    throw new Error(message);
  }
}

export function writeCharacterProfile(eid: number, profile: CharacterProfile): void {
  Identity.name[eid] = profile.name;

  for (const name of ATTRIBUTE_NAMES) {
    Attributes[name][eid] = profile.attributes[name];
  }

  for (const trait of PERSONALITY_TRAITS) {
    Personality[trait][eid] = profile.personality[trait];
  }

  for (const need of BASIC_NEEDS) {
    Needs[need][eid] = profile.needs[need];
  }

  Lifecycle.state[eid] = LIFECYCLE_STATES.indexOf(profile.lifecycle);
}

export function readCharacterProfile(eid: number): CharacterProfile {
  const attributes = {} as CharacterAttributes;

  for (const name of ATTRIBUTE_NAMES) {
    attributes[name] = Attributes[name][eid];
  }

  const personality = {} as CharacterPersonality;

  for (const trait of PERSONALITY_TRAITS) {
    personality[trait] = Personality[trait][eid];
  }

  const needs = {} as CharacterNeeds;

  for (const need of BASIC_NEEDS) {
    needs[need] = Needs[need][eid];
  }

  return {
    name: Identity.name[eid],
    attributes,
    personality,
    needs,
    lifecycle: LIFECYCLE_STATES[Lifecycle.state[eid]],
  };
}
