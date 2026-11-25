import { Application, Container, Graphics } from 'pixi.js';

import { TERRAIN_TYPES } from '@simsand/shared';
import type { EntitySnapshot, ItemId, ResourceNode, SpriteId, TerrainType, WorldMapData } from '@simsand/shared';

const TILE_SIZE = 16;
const INITIAL_MAP_SIZE = 64;
const FOCUS_ZOOM = 2.5;
// Share of the remaining distance the camera covers each frame at 60 fps.
const CAMERA_EASE = 0.08;

const TERRAIN_COLORS: Record<TerrainType, number> = {
  grass: 0x526b45,
  dirt: 0x8a7148,
  water: 0x3d6e8f,
  rock: 0x6e6a62,
  camp: 0xc6a15a,
};

const PILE_COLORS: Record<ItemId, number> = {
  material: 0xb08968,
  goods: 0xd4b483,
  food: 0xc45c48,
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

  const piles = new Graphics();
  world.addChild(piles);

  // Store graphics objects so we can update existing entities.
  const entities = new Map<string, Graphics>();

  // Re-added on each frame with a ring, so it stays above characters
  // created after it.
  const pulses = new Graphics();
  const pulseUntil = new Map<string, number>();

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

  const appearanceDrawn = new Map<string, string>();

  // Placeholder shapes until there is real sprite art. Resting overrides the
  // shape, a ring shows a character who has stopped to eat or drink, and a
  // dead character is an X.
  function drawCharacter(
    graphic: Graphics,
    color: number,
    sprite: SpriteId,
    resting: boolean,
    sustaining: boolean,
    working: boolean,
    dead: boolean,
  ): void {
    graphic.clear();

    if (dead) {
      graphic.moveTo(-5, -5).lineTo(5, 5).stroke({ color, width: 2 });
      graphic.moveTo(-5, 5).lineTo(5, -5).stroke({ color, width: 2 });
      return;
    }

    if (resting) {
      graphic.circle(0, 0, 3).fill(color);
    } else if (sprite === 'scout') {
      graphic.poly([-5, 0, 0, -5, 5, 0, 0, 5]).fill(color);
    } else if (sprite === 'elder') {
      graphic.poly([0, -6, 5, 4, -5, 4]).fill(color);
    } else {
      graphic.rect(-4, -4, 8, 8).fill(color);
    }

    if (sustaining) {
      graphic.circle(0, 0, 8).stroke({ color: 0xfff4d6, alpha: 0.9, width: 1 });
    }

    if (working) {
      graphic.rect(-6, -6, 12, 12).stroke({ color: 0xf0d78c, alpha: 0.95, width: 1 });
    }
  }

  function updateEntities(snapshots: EntitySnapshot[]): void {
    for (const entity of snapshots) {
      let graphic = entities.get(entity.id);

      if (!graphic) {
        graphic = new Graphics();
        entities.set(entity.id, graphic);
        world.addChild(graphic);
      }

      const dead = entity.lifecycle === 'dead';
      const sustaining = !dead && (entity.eating || entity.drinking);
      const working = !dead && entity.working;
      const appearance = `${entity.sprite}:${entity.resting}:${sustaining}:${working}:${entity.lifecycle}`;

      if (appearanceDrawn.get(entity.id) !== appearance) {
        drawCharacter(graphic, entity.color, entity.sprite, entity.resting, sustaining, working, dead);
        appearanceDrawn.set(entity.id, appearance);
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
      appearanceDrawn.delete(id);
    }
  }

  function replaceEntities(snapshots: EntitySnapshot[]): void {
    const ids = new Set(snapshots.map((entity) => entity.id));

    removeEntities([...entities.keys()].filter((id) => !ids.has(id)));
    updateEntities(snapshots);
  }

  // A fading ring around each character named in a notification.
  function pulse(ids: readonly string[], durationMs = 3000): void {
    const until = performance.now() + durationMs;

    for (const id of ids) pulseUntil.set(id, until);
  }

  app.ticker.add(() => {
    pulses.clear();

    if (pulseUntil.size === 0) return;

    world.addChild(pulses);

    const now = performance.now();

    for (const [id, until] of pulseUntil) {
      const graphic = entities.get(id);

      if (!graphic || now >= until) {
        pulseUntil.delete(id);
        continue;
      }

      const remaining = (until - now) / 3000;

      pulses
        .circle(graphic.position.x, graphic.position.y, 10 + (1 - remaining) * 6)
        .stroke({ color: 0xffe08a, alpha: Math.max(0.2, remaining), width: 2 });
    }
  });

  // The whole map fits the canvas at zoom 1. A focus zooms toward one
  // place for a while, then the camera eases back out. The latest focus
  // wins.
  let focusAt: { x: number; y: number } | undefined;
  let focusUntil = 0;
  let zoom = 1;
  let focalX = app.screen.width / 2;
  let focalY = app.screen.height / 2;

  function focus(location: { x: number; y: number }, durationMs = 4000): void {
    focusAt = { x: location.x * TILE_SIZE, y: location.y * TILE_SIZE };
    focusUntil = performance.now() + durationMs;
  }

  app.ticker.add((ticker) => {
    if (focusAt && performance.now() >= focusUntil) focusAt = undefined;

    const width = app.screen.width;
    const height = app.screen.height;
    const targetZoom = focusAt ? FOCUS_ZOOM : 1;
    const targetX = focusAt?.x ?? width / 2;
    const targetY = focusAt?.y ?? height / 2;

    if (zoom === targetZoom && focalX === targetX && focalY === targetY) return;

    const step = 1 - (1 - CAMERA_EASE) ** ticker.deltaTime;
    zoom += (targetZoom - zoom) * step;
    focalX += (targetX - focalX) * step;
    focalY += (targetY - focalY) * step;

    if (Math.abs(targetZoom - zoom) < 0.001) zoom = targetZoom;
    if (Math.abs(targetX - focalX) < 0.5) focalX = targetX;
    if (Math.abs(targetY - focalY) < 0.5) focalY = targetY;

    // Keep the map edge-to-edge: never show background past it.
    const x = Math.min(0, Math.max(width - width * zoom, width / 2 - focalX * zoom));
    const y = Math.min(0, Math.max(height - height * zoom, height / 2 - focalY * zoom));

    world.scale.set(zoom);
    world.position.set(x, y);
  });

  // A square around the character the streamer has selected, redrawn each
  // frame so it follows them.
  const selection = new Graphics();
  let selectedId: string | undefined;

  function select(id: string | undefined): void {
    selectedId = id;
  }

  app.ticker.add(() => {
    selection.clear();

    const graphic = selectedId ? entities.get(selectedId) : undefined;

    if (!graphic) return;

    world.addChild(selection);
    selection
      .rect(graphic.position.x - 9, graphic.position.y - 9, 18, 18)
      .stroke({ color: 0xffffff, alpha: 0.9, width: 1 });
  });

  // Reports clicks in tile coordinates, accounting for the CSS size of the
  // canvas and the camera's zoom.
  function onMapClick(handler: (point: { x: number; y: number }) => void): void {
    app.canvas.addEventListener('pointerdown', (event) => {
      const bounds = app.canvas.getBoundingClientRect();
      const screenX = (event.clientX - bounds.left) * (app.screen.width / bounds.width);
      const screenY = (event.clientY - bounds.top) * (app.screen.height / bounds.height);

      handler({
        x: (screenX - world.position.x) / world.scale.x / TILE_SIZE,
        y: (screenY - world.position.y) / world.scale.y / TILE_SIZE,
      });
    });
  }

  // Piles sit on tile centres. The full list replaces the previous one.
  function replaceNodes(nodes: readonly ResourceNode[]): void {
    piles.clear();

    for (const node of nodes) {
      piles
        .circle((node.x + 0.5) * TILE_SIZE, (node.y + 0.5) * TILE_SIZE, 3)
        .fill(PILE_COLORS[node.item] ?? 0xb08968);
    }
  }

  return {
    setMap,
    updateEntities,
    removeEntities,
    replaceEntities,
    replaceNodes,
    pulse,
    focus,
    select,
    onMapClick,
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
