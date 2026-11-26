import { query } from 'bitecs';

import { LIFECYCLE_STATES, isInterventionLogEvent } from '@simsand/shared';
import type { CommandIssuer, CommandRequest, DirectorReason, SimulationLogType } from '@simsand/shared';

import { executeCommand } from '../commands/execute-command.js';
import { Identity } from '../components/identity.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';
import { Position } from '../components/position.js';
import type { SimulationClock } from '../core/clock.js';
import type { SimulationWorld } from '../core/world.js';
import { heldQuantity } from '../economy/inventory.js';
import { FATIGUE_REST_AT, HUNGER_EAT_AT } from '../systems/needs.js';
import { directorDefaults } from './settings.js';
import type { DirectorSettings } from './settings.js';

export const DIRECTOR_ISSUER: CommandIssuer = { source: 'system', id: 'world-director' };

const DEAD = LIFECYCLE_STATES.indexOf('dead');
const KIND_ACTS: readonly SimulationLogType[] = ['character.comforted', 'character.kept', 'item.transferred'];

interface Living {
  eid: number;
  id: string;
}

type Proposal = CommandRequest & { reason: DirectorReason; target?: string; holding?: number };

// Reacts to hardship and conduct the world has already recorded. It
// never chooses what a character does; it only issues the same
// intervention commands a streamer can, as system, with a reason.
export function updateDirector(
  world: SimulationWorld,
  clock: SimulationClock,
  settings: Readonly<DirectorSettings> = directorDefaults,
): void {
  const ticksPerCheck = Math.max(1, Math.round(settings.checkSeconds / clock.fixedDeltaSeconds));

  if (clock.tick % ticksPerCheck !== 0) return;

  const now = world.elapsedSeconds;
  const living = livingCharacters(world);
  const director = world.director;

  trackHunger(world, living, now);

  for (const [id, at] of director.targeted) {
    if (now - at >= settings.targetSeconds || !world.entityIds.has(id)) director.targeted.delete(id);
  }

  for (const id of director.cursedHoldings.keys()) {
    if (!world.entityIds.has(id)) director.cursedHoldings.delete(id);
  }

  if (director.lastActAt !== null && now - director.lastActAt < settings.actSeconds) return;

  const { rules } = settings;
  const proposal = (rules.mercy ? mercy(world, settings, living, now) : undefined)
    ?? (rules.scarcity ? scarcity(world, settings) : undefined)
    ?? (rules.kindness ? kindness(world, settings, living, now) : undefined)
    ?? (rules.hubris ? hubris(world, settings, living) : undefined);

  if (!proposal) return;

  const { target, holding, ...request } = proposal;
  const result = executeCommand(world, clock, {
    ...request,
    commandId: `director-${clock.tick}`,
    issuer: DIRECTOR_ISSUER,
    submittedAt: Math.round(now * 1000),
  });

  if (result.status !== 'applied') return;

  director.lastActAt = now;

  if (target) {
    director.targeted.set(target, now);
    director.hungrySince.delete(target);
  }

  if (target && holding !== undefined) director.cursedHoldings.set(target, holding);
}

function livingCharacters(world: SimulationWorld): Living[] {
  const living: Living[] = [];

  for (const eid of query(world.ecs, [Identity, Lifecycle, Position])) {
    if (Lifecycle.state[eid] !== DEAD) living.push({ eid, id: Identity.id[eid] });
  }

  return living.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function recentlyTargeted(world: SimulationWorld, id: string): boolean {
  return world.director.targeted.has(id);
}

function trackHunger(world: SimulationWorld, living: readonly Living[], now: number): void {
  const hungry = new Set<string>();

  for (const { eid, id } of living) {
    if (Needs.hunger[eid] >= HUNGER_EAT_AT && heldQuantity(world, id, 'food') < 1) {
      hungry.add(id);
      if (!world.director.hungrySince.has(id)) world.director.hungrySince.set(id, now);
    }
  }

  for (const id of world.director.hungrySince.keys()) {
    if (!hungry.has(id)) world.director.hungrySince.delete(id);
  }
}

// Food for whoever has gone hungry longest with nobody near who holds any.
function mercy(
  world: SimulationWorld,
  settings: Readonly<DirectorSettings>,
  living: readonly Living[],
  now: number,
): Proposal | undefined {
  let chosen: { id: string; since: number } | undefined;

  for (const { eid, id } of living) {
    const since = world.director.hungrySince.get(id);

    if (since === undefined || now - since < settings.mercyAfterSeconds || recentlyTargeted(world, id)) continue;
    if (foodNearby(world, living, eid, id, settings.mercyRadius)) continue;
    if (!chosen || since < chosen.since) chosen = { id, since };
  }

  if (!chosen) return undefined;

  return {
    type: 'intervention.gift',
    params: { characterId: chosen.id, item: 'food', quantity: 1 },
    reason: 'mercy',
    target: chosen.id,
  };
}

function foodNearby(
  world: SimulationWorld,
  living: readonly Living[],
  eid: number,
  id: string,
  radius: number,
): boolean {
  return living.some((other) => (
    other.id !== id
    && Math.hypot(Position.x[other.eid] - Position.x[eid], Position.y[other.eid] - Position.y[eid]) <= radius
    && heldQuantity(world, other.id, 'food') >= 1
  ));
}

// When fewer than half the pile sites hold a pile, the site that would
// wait longest comes back early.
function scarcity(world: SimulationWorld, settings: Readonly<DirectorSettings>): Proposal | undefined {
  if (world.returning.size === 0 || world.nodes.size >= world.returning.size) return undefined;

  let chosen: { key: number; at: number } | undefined;

  for (const [key, at] of world.returning) {
    if (!chosen || at > chosen.at || (at === chosen.at && key < chosen.key)) chosen = { key, at };
  }

  if (!chosen) return undefined;

  return {
    type: 'intervention.bounty',
    params: {
      x: chosen.key % world.map.width,
      y: Math.floor(chosen.key / world.map.width),
      quantity: settings.scarcityBounty,
    },
    reason: 'scarcity',
  };
}

// A blessing for whoever comforted, stayed with, or gave to others most
// within the kindness window, once they have done it often enough.
function kindness(
  world: SimulationWorld,
  settings: Readonly<DirectorSettings>,
  living: readonly Living[],
  now: number,
): Proposal | undefined {
  const alive = new Set(living.map((character) => character.id));
  const counts = new Map<string, number>();

  for (let i = world.log.length - 1; i >= 0; i--) {
    const event = world.log[i];

    if (now - event.elapsedSeconds > settings.kindnessWindowSeconds) break;
    if (isInterventionLogEvent(event) || !KIND_ACTS.includes(event.type)) continue;
    if (event.payload.result !== 'completed') continue;

    const initiator = event.payload.initiator ?? event.participants[0];

    if (initiator && alive.has(initiator)) counts.set(initiator, (counts.get(initiator) ?? 0) + 1);
  }

  let chosen: { id: string; acts: number } | undefined;

  for (const [id, acts] of counts) {
    if (acts < settings.kindnessActs || recentlyTargeted(world, id)) continue;
    if (!chosen || acts > chosen.acts || (acts === chosen.acts && id < chosen.id)) chosen = { id, acts };
  }

  if (!chosen) return undefined;

  return {
    type: 'intervention.bless',
    params: { characterId: chosen.id },
    reason: 'kindness',
    target: chosen.id,
  };
}

// Weariness for whoever holds far more than everyone else, unless they
// are already worn out. Once cursed, only a bigger hoard than the one
// they were cursed for brings another.
function hubris(
  world: SimulationWorld,
  settings: Readonly<DirectorSettings>,
  living: readonly Living[],
): Proposal | undefined {
  if (living.length < 2) return undefined;

  const held = living.map((character) => ({ ...character, total: totalHeld(world, character.id) }));
  const everything = held.reduce((sum, character) => sum + character.total, 0);
  let chosen: { id: string; total: number } | undefined;

  for (const { eid, id, total } of held) {
    const othersMean = (everything - total) / (living.length - 1);

    if (total < settings.hoardMinItems || total < settings.hoardFactor * Math.max(othersMean, 1)) continue;
    if (Needs.fatigue[eid] >= FATIGUE_REST_AT || recentlyTargeted(world, id)) continue;
    if (total <= (world.director.cursedHoldings.get(id) ?? 0)) continue;
    if (!chosen || total > chosen.total) chosen = { id, total };
  }

  if (!chosen) return undefined;

  return {
    type: 'intervention.curse',
    params: { characterId: chosen.id, need: 'fatigue' },
    reason: 'hubris',
    target: chosen.id,
    holding: chosen.total,
  };
}

function totalHeld(world: SimulationWorld, id: string): number {
  return world.inventories.get(id)?.stacks.reduce((sum, stack) => sum + stack.quantity, 0) ?? 0;
}
