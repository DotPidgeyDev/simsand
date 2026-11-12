import type { SimulationWorld } from '../core/world.js';
import { createCharacter } from './create-character.js';

function createRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state + 0x6D2B79F5) | 0;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPopulation(
  world: SimulationWorld,
  count = 20,
  seed = 12345,
): number[] {
  const random = createRandom(seed);
  const entities: number[] = [];

  for (let i = 0; i < count; i++) {
    const eid = createCharacter(world, {
      id: `character-${String(i + 1).padStart(4, '0')}`,

      x: random() * 64,
      y: random() * 64,

      velocityX: (random() - 0.5) * 2,
      velocityY: (random() - 0.5) * 2,

      color: Math.floor(random() * 0xFFFFFF),
      sprite: 1,
    });

    entities.push(eid);
  }

  return entities;
}