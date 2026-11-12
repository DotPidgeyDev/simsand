export type TileType = 'grass' | 'dirt' | 'water';

export interface WorldMap {
  width: number;
  height: number;
  tiles: TileType[];
}

export function createWorldMap(width = 64, height = 64): WorldMap {
  return {
    width,
    height,
    tiles: Array(width * height).fill('grass'),
  };
}

export function getTile(
  map: WorldMap,
  x: number,
  y: number,
): TileType | undefined {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return undefined;
  }

  return map.tiles[y * map.width + x];
}