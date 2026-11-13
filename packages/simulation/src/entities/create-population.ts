import { spriteIdFor } from '../characters/profile.js';
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

      x: random() * world.map.width,
      y: random() * world.map.height,

      velocityX: (random() - 0.5) * 2,
      velocityY: (random() - 0.5) * 2,

      color: Math.floor(random() * 0xFFFFFF),
      sprite: spriteIdFor(seed, `character-${String(i + 1).padStart(4, '0')}`),
    });

    entities.push(eid);
  }

  return entities;
}