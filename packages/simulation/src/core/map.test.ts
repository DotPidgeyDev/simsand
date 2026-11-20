import { describe, expect, it } from 'vitest';

import { TERRAIN_TYPES } from '@simsand/shared';

import {
  createWorldMap,
  fromWorldMapData,
  generateResourceNodes,
  generateWorldMap,
  getTile,
  RESOURCE_NODE_STOCK,
  toWorldMapData,
} from './map.js';

function terrainCounts(seed: number) {
  const map = generateWorldMap(seed);
  const counts = { grass: 0, dirt: 0, water: 0, rock: 0, camp: 0 };

  for (const tile of map.tiles) {
    counts[TERRAIN_TYPES[tile]]++;
  }

  return counts;
}

describe('world map', () => {
  it('generates the same 64 × 64 terrain for the same seed', () => {
    const map = generateWorldMap(12345);

    expect(map.width).toBe(64);
    expect(map.height).toBe(64);
    expect(map.tiles).toEqual(generateWorldMap(12345).tiles);
    expect(map.tiles).not.toEqual(generateWorldMap(54321).tiles);
  });

  it.each([1, 12345, 987654])('gives seed %i a mostly-grass map with water and dirt', (seed) => {
    const { grass, dirt, water, rock, camp } = terrainCounts(seed);
    const total = 64 * 64;

    expect(water / total).toBeCloseTo(0.12, 1);
    expect(dirt / total).toBeGreaterThan(0.08);
    expect(dirt / total).toBeLessThan(0.2);
    expect(grass / total).toBeGreaterThan(0.65);
    expect(rock / total).toBeGreaterThan(0);
    expect(rock / total).toBeLessThan(0.05);
    expect(camp / total).toBeGreaterThan(0);
    expect(camp / total).toBeLessThan(0.02);
  });

  it('looks up tiles by integer coordinates and returns undefined outside the map', () => {
    const map = createWorldMap(4, 3, 'dirt');
    map.tiles[2 * 4 + 1] = TERRAIN_TYPES.indexOf('water');

    expect(getTile(map, 0, 0)).toBe('dirt');
    expect(getTile(map, 1, 2)).toBe('water');
    expect(getTile(map, 4, 0)).toBeUndefined();
    expect(getTile(map, 0, -1)).toBeUndefined();
    expect(getTile(map, 0.5, 0)).toBeUndefined();
  });

  it('places material only on grass, from the map seed', () => {
    const map = generateWorldMap(12345);
    const nodes = generateResourceNodes(map, 12345);

    expect(nodes.length).toBeGreaterThan(0);
    expect(generateResourceNodes(map, 12345)).toEqual(nodes);
    expect(generateResourceNodes(map, 99)).not.toEqual(nodes);

    for (const node of nodes) {
      expect(getTile(map, node.x, node.y)).toBe('grass');
      expect(node.item).toBe('material');
      expect(node.quantity).toBe(RESOURCE_NODE_STOCK);
    }
  });

  it('round-trips through the shared map data format', () => {
    const map = generateWorldMap(3);

    expect(fromWorldMapData(toWorldMapData(map))).toEqual(map);
  });

  it.each([
    [{ width: 0, height: 2, tiles: [] }, 'Invalid map dimensions'],
    [{ width: 2, height: 2, tiles: [0, 0, 0] }, 'Map has 3 tiles; expected 4'],
    [{ width: 1, height: 1, tiles: [TERRAIN_TYPES.length] }, 'unknown terrain type'],
    [{ width: 1, height: 1, tiles: [0.5] }, 'unknown terrain type'],
  ])('rejects invalid map data %#', (data, message) => {
    expect(() => fromWorldMapData(data)).toThrow(message);
  });
});
