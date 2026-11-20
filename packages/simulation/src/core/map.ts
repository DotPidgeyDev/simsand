import { TERRAIN_TYPES } from '@simsand/shared';
import type { ResourceNode, TerrainType, WorldMapData } from '@simsand/shared';

import { createRandom } from './random.js';

export const DEFAULT_MAP_WIDTH = 64;
export const DEFAULT_MAP_HEIGHT = 64;

const GRASS = TERRAIN_TYPES.indexOf('grass');
const DIRT = TERRAIN_TYPES.indexOf('dirt');
const WATER = TERRAIN_TYPES.indexOf('water');
const ROCK = TERRAIN_TYPES.indexOf('rock');
const CAMP = TERRAIN_TYPES.indexOf('camp');

// Proportions of the map, chosen by quantile so every seed gets a similar
// amount of each terrain.
const WATER_FRACTION = 0.12;
const SHORE_FRACTION = 0.08;
const DIRT_PATCH_FRACTION = 0.06;
const ROCK_FRACTION = 0.04;
const CAMP_FRACTION = 0.015;

// Keeps the terrain stream independent of other uses of the world seed.
const MAP_SEED_SALT = 0x9e3779b9;
const ROCK_SEED_SALT = 0x6a09e667;
const CAMP_SEED_SALT = 0xbb67ae85;
const NODE_SEED_SALT = 0x3c6ef372;

// A grass tile's pile. Small enough that most grass is empty, large enough
// that a generated map has some. Gathering does not walk toward these.
const NODE_FRACTION = 0.02;
export const RESOURCE_NODE_STOCK = 3;

// Static terrain. Rock cannot be entered. Grass, dirt and water can, at the
// same cost.
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

  stampRocks(map, seed);
  stampCamps(map, seed);

  return map;
}

// Rock is a later layer on grass, from its own salt, so water and dirt stay
// put when an older save gains it. A tile someone is already standing on stays
// grass. Running it again does not move the rocks that are already there.
export function stampRocks(map: WorldMap, seed: number, occupied: ReadonlySet<number> = new Set()): void {
  const random = createRandom((seed ^ ROCK_SEED_SALT) >>> 0);
  const noise = fractalNoise(random, map.width, map.height);
  const level = quantile(noise, ROCK_FRACTION);

  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] !== GRASS || occupied.has(i) || noise[i] >= level) continue;

    map.tiles[i] = ROCK;
  }
}

// Camps are a later layer on grass, from their own salt, so water, dirt and
// rock stay put. A tile someone is already standing on stays grass.
export function stampCamps(map: WorldMap, seed: number, occupied: ReadonlySet<number> = new Set()): void {
  const random = createRandom((seed ^ CAMP_SEED_SALT) >>> 0);
  const noise = fractalNoise(random, map.width, map.height);
  const level = quantile(noise, CAMP_FRACTION);

  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] !== GRASS || occupied.has(i) || noise[i] >= level) continue;

    map.tiles[i] = CAMP;
  }
}

// Nodes are not terrain. They sit on grass, from their own salt, so camps,
// rock, water and dirt stay put. An empty pile is not stored.
export function generateResourceNodes(map: WorldMap, seed: number): ResourceNode[] {
  const random = createRandom((seed ^ NODE_SEED_SALT) >>> 0);
  const noise = fractalNoise(random, map.width, map.height);
  const level = quantile(noise, NODE_FRACTION);
  const nodes: ResourceNode[] = [];

  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] !== GRASS || noise[i] >= level) continue;

    nodes.push({
      x: i % map.width,
      y: Math.floor(i / map.width),
      item: 'material',
      quantity: RESOURCE_NODE_STOCK,
    });
  }

  return nodes;
}

// The next tile toward the nearest tile of that kind, and how many steps that
// walk takes. Distance 0 means this cell already is that kind of terrain.
// Missing means rock, or no way through.
export interface TerrainRoute {
  x: number;
  y: number;
  distance: number;
}

interface RouteField {
  water: Array<TerrainRoute | undefined>;
  land: Array<TerrainRoute | undefined>;
  camp: Array<TerrainRoute | undefined>;
}

const routeFields = new WeakMap<WorldMap, RouteField>();

const NEIGHBORS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

// One route for every passable tile, shared by every villager. Spread from
// the goal tiles through grass, dirt and water. Rock is left out. The stored
// tile is the next step, not the goal. Equal-length walks keep the earliest
// goal in row-major order. Built once; the map does not change during a world.
function walkField(map: WorldMap, isGoal: (index: number) => boolean): Array<TerrainRoute | undefined> {
  const count = map.width * map.height;
  const routes: Array<TerrainRoute | undefined> = new Array(count);
  const distance = new Int32Array(count).fill(-1);
  const queue: number[] = [];

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const index = y * map.width + x;

      if (!isGoal(index)) continue;

      distance[index] = 0;
      routes[index] = { x, y, distance: 0 };
      queue.push(index);
    }
  }

  let head = 0;

  while (head < queue.length) {
    const index = queue[head++];
    const x = index % map.width;
    const y = Math.floor(index / map.width);

    for (const [dx, dy] of NEIGHBORS) {
      const nextX = x + dx;
      const nextY = y + dy;

      if (nextX < 0 || nextY < 0 || nextX >= map.width || nextY >= map.height) continue;

      const next = nextY * map.width + nextX;

      if (distance[next] !== -1 || map.tiles[next] === ROCK) continue;

      distance[next] = distance[index] + 1;
      routes[next] = { x, y, distance: distance[next] };
      queue.push(next);
    }
  }

  return routes;
}

function routeField(map: WorldMap): RouteField {
  const cached = routeFields.get(map);

  if (cached) return cached;

  const field: RouteField = {
    water: walkField(map, (index) => map.tiles[index] === WATER),
    land: walkField(map, (index) => map.tiles[index] !== WATER && map.tiles[index] !== ROCK),
    camp: walkField(map, (index) => map.tiles[index] === CAMP),
  };

  routeFields.set(map, field);

  return field;
}

// The next step for the tile containing this point. An all-grass map has no
// water route. Rock has neither.
export function nearestTerrainTile(
  map: WorldMap,
  x: number,
  y: number,
  kind: 'water' | 'land' | 'camp',
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
