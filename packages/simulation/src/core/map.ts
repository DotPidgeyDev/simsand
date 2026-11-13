import { TERRAIN_TYPES } from '@simsand/shared';
import type { TerrainType, WorldMapData } from '@simsand/shared';

import { createRandom } from './random.js';

export const DEFAULT_MAP_WIDTH = 64;
export const DEFAULT_MAP_HEIGHT = 64;

const GRASS = TERRAIN_TYPES.indexOf('grass');
const DIRT = TERRAIN_TYPES.indexOf('dirt');
const WATER = TERRAIN_TYPES.indexOf('water');

// Proportions of the map, chosen by quantile so every seed gets a similar
// amount of each terrain.
const WATER_FRACTION = 0.12;
const SHORE_FRACTION = 0.08;
const DIRT_PATCH_FRACTION = 0.06;

// Keeps the terrain stream independent of other uses of the world seed.
const MAP_SEED_SALT = 0x9e3779b9;

// Static terrain. Characters move freely over every terrain type for now;
// collision and pathfinding come later.
export interface WorldMap {
  width: number;
  height: number;
  // Row-major indices into TERRAIN_TYPES.
  tiles: Uint8Array;
}

export function createWorldMap(
  width = DEFAULT_MAP_WIDTH,
  height = DEFAULT_MAP_HEIGHT,
  terrain: TerrainType = 'grass',
): WorldMap {
  return {
    width,
    height,
    tiles: new Uint8Array(width * height).fill(TERRAIN_TYPES.indexOf(terrain)),
  };
}

export function generateWorldMap(
  seed: number,
  width = DEFAULT_MAP_WIDTH,
  height = DEFAULT_MAP_HEIGHT,
): WorldMap {
  const random = createRandom(seed ^ MAP_SEED_SALT);
  const elevation = fractalNoise(random, width, height);
  const patches = fractalNoise(random, width, height);

  const waterLevel = quantile(elevation, WATER_FRACTION);
  const shoreLevel = quantile(elevation, WATER_FRACTION + SHORE_FRACTION);
  const patchLevel = quantile(patches, 1 - DIRT_PATCH_FRACTION);

  const map = createWorldMap(width, height);

  for (let i = 0; i < map.tiles.length; i++) {
    if (elevation[i] < waterLevel) {
      map.tiles[i] = WATER;
    } else if (elevation[i] < shoreLevel || patches[i] >= patchLevel) {
      map.tiles[i] = DIRT;
    } else {
      map.tiles[i] = GRASS;
    }
  }

  return map;
}

export function getTile(
  map: WorldMap,
  x: number,
  y: number,
): TerrainType | undefined {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return undefined;
  }

  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return undefined;
  }

  return TERRAIN_TYPES[map.tiles[y * map.width + x]];
}

export function toWorldMapData(map: WorldMap): WorldMapData {
  return {
    width: map.width,
    height: map.height,
    tiles: Array.from(map.tiles),
  };
}

export function fromWorldMapData(data: WorldMapData): WorldMap {
  const { width, height, tiles } = data;

  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`Invalid map dimensions ${width} × ${height}`);
  }

  if (!Array.isArray(tiles) || tiles.length !== width * height) {
    throw new Error(`Map has ${tiles?.length} tiles; expected ${width * height}`);
  }

  if (!tiles.every((tile) => Number.isInteger(tile) && tile >= 0 && tile < TERRAIN_TYPES.length)) {
    throw new Error('Map contains an unknown terrain type');
  }

  return { width, height, tiles: Uint8Array.from(tiles) };
}

// Sum of smoothed value-noise layers at decreasing scales, roughly in [0, 1).
function fractalNoise(random: () => number, width: number, height: number): Float32Array {
  const result = new Float32Array(width * height);

  for (const [cellSize, weight] of [[16, 0.6], [8, 0.3], [4, 0.1]] as const) {
    const layer = valueNoise(random, width, height, cellSize);

    for (let i = 0; i < result.length; i++) {
      result[i] += layer[i] * weight;
    }
  }

  return result;
}

function valueNoise(
  random: () => number,
  width: number,
  height: number,
  cellSize: number,
): Float32Array {
  const latticeWidth = Math.ceil(width / cellSize) + 1;
  const latticeHeight = Math.ceil(height / cellSize) + 1;
  const lattice = Float32Array.from({ length: latticeWidth * latticeHeight }, random);
  const result = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    const cellY = Math.floor(y / cellSize);
    const ty = smoothstep((y % cellSize) / cellSize);

    for (let x = 0; x < width; x++) {
      const cellX = Math.floor(x / cellSize);
      const tx = smoothstep((x % cellSize) / cellSize);

      const corner = (dx: number, dy: number) => lattice[(cellY + dy) * latticeWidth + cellX + dx];
      const top = lerp(corner(0, 0), corner(1, 0), tx);
      const bottom = lerp(corner(0, 1), corner(1, 1), tx);

      result[y * width + x] = lerp(top, bottom, ty);
    }
  }

  return result;
}

function quantile(values: Float32Array, fraction: number): number {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
