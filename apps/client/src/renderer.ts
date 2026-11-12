import { Application, Container, Graphics } from 'pixi.js';

import type { EntitySnapshot } from '@simsand/shared';

const WORLD_WIDTH = 64;
const WORLD_HEIGHT = 64;
const TILE_SIZE = 16;
const WORLD_PIXEL_WIDTH = WORLD_WIDTH * TILE_SIZE;
const WORLD_PIXEL_HEIGHT = WORLD_HEIGHT * TILE_SIZE;

export async function createRenderer(container: HTMLElement) {
  const app = new Application();

  await app.init({
    width: WORLD_PIXEL_WIDTH,
    height: WORLD_PIXEL_HEIGHT,
    backgroundColor: 0x26382b,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  app.canvas.style.width = '100%';
  app.canvas.style.height = 'auto';
  container.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);

  // Draw the background and grid.
  const grid = new Graphics();

  grid.rect(
    0,
    0,
    WORLD_PIXEL_WIDTH,
    WORLD_PIXEL_HEIGHT,
  ).fill(0x526b45);

  for (let x = 0; x <= WORLD_WIDTH; x++) {
    const position = x * TILE_SIZE;

    grid.moveTo(position, 0);
    grid.lineTo(position, WORLD_PIXEL_HEIGHT);
  }

  for (let y = 0; y <= WORLD_HEIGHT; y++) {
    const position = y * TILE_SIZE;

    grid.moveTo(0, position);
    grid.lineTo(WORLD_PIXEL_WIDTH, position);
  }

  grid.stroke({
    color: 0x354b32,
    alpha: 0.5,
    width: 1,
  });

  world.addChild(grid);

  // Store graphics objects so we can update existing entities.
  const entities = new Map<string, Graphics>();

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
    updateEntities,
    removeEntities,
    replaceEntities,
    destroy: () => app.destroy(true),
  };
}