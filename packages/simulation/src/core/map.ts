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

interface TilePoint {
  x: number;
  y: number;
}

// The tile a villager on this cell walks toward, and the straight-line
// distance in tiles between the two centers. Distance 0 means this cell
// already is that kind of terrain. Missing means the map has no such tile.
export interface TerrainRoute {
  x: number;
  y: number;
  distance: number;
}

interface RouteField {
  water: Array<TerrainRoute | undefined>;
  land: Array<TerrainRoute | undefined>;
}

const routeFields = new WeakMap<WorldMap, RouteField>();

function nearestOf(points: readonly TilePoint[], x: number, y: number): TerrainRoute | undefined {
  let best: TilePoint | undefined;
  let bestDistance = Infinity;

  for (const point of points) {
    const dx = point.x + 0.5 - x;
    const dy = point.y + 0.5 - y;
    const distance = dx * dx + dy * dy;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }

  if (!best) return undefined;

  return { x: best.x, y: best.y, distance: Math.sqrt(bestDistance) };
}

// One route for every tile, shared by every villager. Every tile is passable
// and costs the same, so the route is the straight line to the nearest tile
// of that kind. Ties keep the earliest tile in row-major order. Built once;
// the map does not change during a world.
function routeField(map: WorldMap): RouteField {
  const cached = routeFields.get(map);

  if (cached) return cached;

  const waterTiles: TilePoint[] = [];
  const landTiles: TilePoint[] = [];

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const point = { x, y };

      if (map.tiles[y * map.width + x] === WATER) waterTiles.push(point);
      else landTiles.push(point);
    }
  }

  const field: RouteField = {
    water: new Array(map.width * map.height),
    land: new Array(map.width * map.height),
  };

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const index = y * map.width + x;
      const centerX = x + 0.5;
      const centerY = y + 0.5;

      if (map.tiles[index] === WATER) {
        field.water[index] = { x, y, distance: 0 };
        field.land[index] = nearestOf(landTiles, centerX, centerY);
      } else {
        field.land[index] = { x, y, distance: 0 };
        field.water[index] = nearestOf(waterTiles, centerX, centerY);
      }
    }
  }

  routeFields.set(map, field);

  return field;
}

// The route for the tile containing this point. Nothing blocks the straight
// line yet. An all-grass map has no water route.
export function nearestTerrainTile(
  map: WorldMap,
  x: number,
  y: number,
  kind: 'water' | 'land',
): TerrainRoute | undefined {
  const tileX = Math.min(map.width - 1, Math.max(0, Math.floor(x)));
  const tileY = Math.min(map.height - 1, Math.max(0, Math.floor(y)));
  const field = routeField(map);

  return field[kind][tileY * map.width + tileX];
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
