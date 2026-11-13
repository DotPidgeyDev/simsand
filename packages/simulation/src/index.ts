export { createSimulationWorld } from './core/world.js';
export type { SimulationWorld } from './core/world.js';

export { Identity } from './components/identity.js';
export { Position } from './components/position.js';
export { Velocity } from './components/velocity.js';
export { Appearance } from './components/appearance.js';

export type { CharacterDefinition } from './entities/create-character.js';

export { createCharacter } from './entities/create-character.js';
export { removeCharacter } from './entities/remove-character.js';

export { executeCommand } from './commands/execute-command.js';
export { createPopulation } from './entities/create-population.js';

export { updateMovement } from './systems/movement.js';
export { updateActions, actionUtilities, chooseAction, assertActionId, emptyCooldowns } from './systems/actions.js';
export { updateLifecycle, lifespanSeconds } from './systems/lifecycle.js';
export { updateNeeds, derivedStats, fatigueGainPerSecond } from './systems/needs.js';

export { createSimulationClock, advanceClock } from './core/clock.js';
export type { SimulationClock } from './core/clock.js';

export {
  createSimulationRunner,
  tickSimulation,
} from './core/runner.js';

export type { SimulationRunner } from './core/runner.js';

export {
  createSimulationLoop,
  startSimulationLoop,
  stopSimulationLoop,
  getSimulationLoopTiming,
} from './core/loop.js';

export type {
  SimulationLoop,
  SimulationLoopOptions,
  SimulationLoopTiming,
} from './core/loop.js';

export { inspectCharacter } from './inspection/inspect-character.js';

export {
  assertCharacterProfile,
  assertSpriteId,
  generateCharacterProfile,
  readCharacterProfile,
  spriteIdFor,
  startingAgeSeconds,
} from './characters/profile.js';

export {
  capturePersistedWorld,
  restorePersistedWorld,
  upgradePersistedWorld,
} from './core/persistence.js';

export type { PersistedWorldV1, PersistedWorldV2, UpgradeableWorld } from './core/persistence.js';

export { createWorldSnapshot } from './systems/snapshot.js';
export { createWorldDelta } from './systems/delta.js';

export {
  DEFAULT_MAP_WIDTH,
  DEFAULT_MAP_HEIGHT,
  createWorldMap,
  generateWorldMap,
  getTile,
  toWorldMapData,
  fromWorldMapData,
} from './core/map.js';
export type { WorldMap } from './core/map.js';