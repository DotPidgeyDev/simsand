import { Application, Container, Graphics } from 'pixi.js';

import { TERRAIN_TYPES } from '@simsand/shared';
import type { EntitySnapshot, TerrainType, WorldMapData } from '@simsand/shared';

const TILE_SIZE = 16;
const INITIAL_MAP_SIZE = 64;

const TERRAIN_COLORS: Record<TerrainType, number> = {
  grass: 0x526b45,
  dirt: 0x8a7148,
  water: 0x3d6e8f,
};

export async function createRenderer(container: HTMLElement) {
  const app = new Application();

  await app.init({
    width: INITIAL_MAP_SIZE * TILE_SIZE,
    height: INITIAL_MAP_SIZE * TILE_SIZE,
    backgroundColor: 0x26382b,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  // Resizing the renderer sets a fixed pixel size on the canvas element.
  function fitCanvasToContainer(): void {
    app.canvas.style.width = '100%';
    app.canvas.style.height = 'auto';
  }

  fitCanvasToContainer();
  container.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);

  const terrain = new Graphics();
  world.addChild(terrain);

  // Store graphics objects so we can update existing entities.
  const entities = new Map<string, Graphics>();

  let currentMap: WorldMapData | undefined;

  // Terrain is static, so it is only redrawn when a snapshot brings a
  // different map.
  function setMap(map: WorldMapData): void {
    if (currentMap && sameMap(currentMap, map)) {
      return;
    }

    currentMap = map;

    const pixelWidth = map.width * TILE_SIZE;
    const pixelHeight = map.height * TILE_SIZE;

    if (app.screen.width !== pixelWidth || app.screen.height !== pixelHeight) {
      app.renderer.resize(pixelWidth, pixelHeight);
      fitCanvasToContainer();
    }

    terrain.clear();

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const type = TERRAIN_TYPES[map.tiles[y * map.width + x]] ?? 'grass';

        terrain
          .rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
          .fill(TERRAIN_COLORS[type]);
      }
    }

    for (let x = 0; x <= map.width; x++) {
      terrain.moveTo(x * TILE_SIZE, 0).lineTo(x * TILE_SIZE, pixelHeight);
    }

    for (let y = 0; y <= map.height; y++) {
      terrain.moveTo(0, y * TILE_SIZE).lineTo(pixelWidth, y * TILE_SIZE);
    }

    terrain.stroke({
      color: 0x354b32,
      alpha: 0.35,
      width: 1,
    });
  }

  function updateEntities(snapshots: EntitySnapshot[]): void {
    for (const entity of snapshots) {
      let graphic = entities.get(entity.id);

      if (!graphic) {
        graphic = new Graphics()
          .rect(-4, -4, 8, 8)
          .fill(entity.color);

        entities.set(entity.id, graphic);
        world.addChild(graphic);
      }

      graphic.position.set(
        entity.x * TILE_SIZE,
        entity.y * TILE_SIZE,
      );
    }
  }

  function removeEntities(ids: string[]): void {
    for (const id of ids) {
      entities.get(id)?.destroy();
      entities.delete(id);
    }
  }

  function replaceEntities(snapshots: EntitySnapshot[]): void {
    const ids = new Set(snapshots.map((entity) => entity.id));

    removeEntities([...entities.keys()].filter((id) => !ids.has(id)));
    updateEntities(snapshots);
  }

  return {
    setMap,
    updateEntities,
    removeEntities,
    replaceEntities,
    destroy: () => app.destroy(true),
  };
}

function sameMap(a: WorldMapData, b: WorldMapData): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.tiles.every((tile, i) => tile === b.tiles[i])
  );
}
