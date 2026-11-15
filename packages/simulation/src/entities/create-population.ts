import { spriteIdFor } from '../characters/profile.js';
import { getTile } from '../core/map.js';
import type { WorldMap } from '../core/map.js';
import { createRandom } from '../core/random.js';
import type { SimulationWorld } from '../core/world.js';
import { createCharacter } from './create-character.js';

export function createPopulation(
  world: SimulationWorld,
  count = 20,
  seed = 12345,
): number[] {
  world.seed = seed;
  const random = createRandom(seed);
  const entities: number[] = [];

  for (let i = 0; i < count; i++) {
    const eid = createCharacter(world, {
      id: `character-${String(i + 1).padStart(4, '0')}`,

      ...placeOffRock(world.map, random() * world.map.width, random() * world.map.height),

      velocityX: (random() - 0.5) * 2,
      velocityY: (random() - 0.5) * 2,

      color: Math.floor(random() * 0xFFFFFF),
      sprite: spriteIdFor(seed, `character-${String(i + 1).padStart(4, '0')}`),
    });

    entities.push(eid);
  }

  return entities;
}

// A spawn that landed on rock moves to the nearest open tile. The random
// stream is left alone, so the rest of the population does not shift.
function placeOffRock(map: WorldMap, x: number, y: number): { x: number; y: number } {
  const tileX = Math.min(map.width - 1, Math.max(0, Math.floor(x)));
  const tileY = Math.min(map.height - 1, Math.max(0, Math.floor(y)));

  if (getTile(map, tileX, tileY) !== 'rock') return { x, y };

  const limit = Math.max(map.width, map.height);

  for (let radius = 1; radius < limit; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;

        const nextX = tileX + dx;
        const nextY = tileY + dy;
        const terrain = getTile(map, nextX, nextY);

        if (terrain && terrain !== 'rock') return { x: nextX + 0.5, y: nextY + 0.5 };
      }
    }
  }

  return { x, y };
}