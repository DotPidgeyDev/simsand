import { ACTION_IDS, LIFECYCLE_STATES } from '@simsand/shared';
import type { EntityInspection, SimulationLogEvent } from '@simsand/shared';

import { readCharacterProfile } from '../characters/profile.js';
import { Action } from '../components/action.js';
import { Condition } from '../components/condition.js';
import { Personality } from '../components/personality.js';
import { Lifecycle } from '../components/lifecycle.js';
import { Needs } from '../components/needs.js';
import { Attributes } from '../components/attributes.js';
import { actionAvailability, actionBias, actionUtilities, biasedUtilities, emptyCooldowns, readActionOutcome, standingOnCamp, standingOnWater } from '../systems/actions.js';
import { derivedStats } from '../systems/needs.js';
import { getTile, nearestTerrainTile } from '../core/map.js';
import { CAMP_YIELD, CRAFT_INPUT, FOOD_PRICE, MEAL_ITEM, heldQuantity, inventoryFor } from '../economy/inventory.js';
import { nearestNodeTile, nodeAt } from '../economy/nodes.js';
import { historyFor } from '../log/events.js';
import { adjacentLivingId, buildOccupancy, livingNeighbors, mostDistressedNeighbor } from '../social/presence.js';
import { memoriesFor } from '../social/memories.js';
import { knownNeighborId, relationshipsFor } from '../social/relationships.js';
import type { SimulationWorld } from '../core/world.js';

import { Appearance } from '../components/appearance.js';
import { Position } from '../components/position.js';
import { Velocity } from '../components/velocity.js';

export function inspectCharacter(
  world: SimulationWorld,
  id: string,
): EntityInspection | undefined {
  const eid = world.entityIds.get(id);

  if (eid === undefined) {
    return undefined;
  }

  const x = Position.x[eid];
  const y = Position.y[eid];
  const tileX = Math.min(world.map.width - 1, Math.max(0, Math.floor(x)));
  const tileY = Math.min(world.map.height - 1, Math.max(0, Math.floor(y)));
  const waterRoute = nearestTerrainTile(world.map, x, y, 'water');
  const landRoute = nearestTerrainTile(world.map, x, y, 'land');
  const campRoute = nearestTerrainTile(world.map, x, y, 'camp');
  const nodeRoute = nearestNodeTile(world, x, y);
  const pile = nodeAt(world, x, y);
  const nearby = livingNeighbors(world, eid, buildOccupancy(world));
  const neighborId = adjacentLivingId(nearby);
  const knownId = knownNeighborId(world, id, nearby);
  const distressed = mostDistressedNeighbor(nearby);
  const cooldowns = {
    ...emptyCooldowns(),
    idle: Action.cooldown.idle[eid],
    move: Action.cooldown.move[eid],
    eat: Action.cooldown.eat[eid],
    rest: Action.cooldown.rest[eid],
    drink: Action.cooldown.drink[eid],
    work: Action.cooldown.work[eid],
    greet: Action.cooldown.greet[eid],
    comfort: Action.cooldown.comfort[eid],
    keep: Action.cooldown.keep[eid],
    confide: Action.cooldown.confide[eid],
    bluff: Action.cooldown.bluff[eid],
    give: Action.cooldown.give[eid],
    gather: Action.cooldown.gather[eid],
    craft: Action.cooldown.craft[eid],
    dine: Action.cooldown.dine[eid],
    buy: Action.cooldown.buy[eid],
  };

  return {
    id,
    x,
    y,
    velocityX: Velocity.x[eid],
    velocityY: Velocity.y[eid],
    color: Appearance.color[eid],
    sprite: Appearance.sprite[eid],
    ...readCharacterProfile(eid),
    resting: Condition.resting[eid] === 1,
    eating: Condition.eating[eid] === 1,
    drinking: Condition.drinking[eid] === 1,
    working: Condition.working[eid] === 1,
    ageSeconds: Lifecycle.ageSeconds[eid],
    action: ACTION_IDS[Action.kind[eid]] ?? 'move',
    utilities: biasedUtilities(
      actionUtilities({
        hunger: Needs.hunger[eid],
        thirst: Needs.thirst[eid],
        fatigue: Needs.fatigue[eid],
        curiosity: Personality.curiosity[eid],
        industriousness: Personality.industriousness[eid],
        sociability: Personality.sociability[eid],
        empathy: Personality.empathy[eid],
        loyalty: Personality.loyalty[eid],
        honesty: Personality.honesty[eid],
        greed: Personality.greed[eid],
      }),
      actionBias(world.seed, id),
    ),
    cooldowns,
    available: actionAvailability({
      alive: Lifecycle.state[eid] !== LIFECYCLE_STATES.indexOf('dead'),
      hunger: Needs.hunger[eid],
      thirst: Needs.thirst[eid],
      fatigue: Needs.fatigue[eid],
      curiosity: Personality.curiosity[eid],
      industriousness: Personality.industriousness[eid],
      sociability: Personality.sociability[eid],
      empathy: Personality.empathy[eid],
      loyalty: Personality.loyalty[eid],
      honesty: Personality.honesty[eid],
      greed: Personality.greed[eid],
      onWater: standingOnWater(world, x, y),
      canReachWater: waterRoute !== undefined,
      canReachLand: landRoute !== undefined && landRoute.distance > 0,
      onCamp: standingOnCamp(world, x, y),
      canReachCamp: campRoute !== undefined && campRoute.distance > 0,
      campDistance: campRoute?.distance ?? Number.POSITIVE_INFINITY,
      canReachNode: nodeRoute !== undefined && nodeRoute.distance > 0,
      nodeDistance: nodeRoute?.distance ?? Number.POSITIVE_INFINITY,
      hasNeighbor: neighborId !== undefined,
      hasKnownNeighbor: knownId !== undefined,
      canGive: heldQuantity(world, id, CAMP_YIELD) >= 1,
      canPay: heldQuantity(world, id, CAMP_YIELD) >= FOOD_PRICE,
      neighborFood: knownId === undefined ? 0 : heldQuantity(world, knownId, MEAL_ITEM),
      heldMaterial: heldQuantity(world, id, CRAFT_INPUT),
      heldFood: heldQuantity(world, id, MEAL_ITEM),
      nodeStock: pile?.quantity ?? 0,
      neighborDistress: distressed?.distress ?? 0,
      cooldowns,
    }),
    outcome: readActionOutcome(eid),
    actionTarget: Action.target[eid] || null,
    relationships: relationshipsFor(world, id),
    memories: memoriesFor(world, id),
    inventory: inventoryFor(world, id),
    node: pile ? { item: pile.item, quantity: pile.quantity } : null,
    derived: derivedStats(Attributes.constitution[eid]),
    viewerId: world.viewerByCharacter.get(id) ?? null,
    tile: { x: tileX, y: tileY, terrain: getTile(world.map, tileX, tileY)! },
  };
}

export function inspectCharacterHistory(
  world: SimulationWorld,
  id: string,
): SimulationLogEvent[] | undefined {
  if (!world.entityIds.has(id)) return undefined;

  return historyFor(world, id);
}
