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
} from './core/loop.js';

export type {
  SimulationLoop,
  SimulationLoopOptions,
} from './core/loop.js';

export {
  capturePersistedWorld,
  restorePersistedWorld,
} from './core/persistence.js';

export { createWorldSnapshot } from './systems/snapshot.js';
export { createWorldDelta } from './systems/delta.js';

export { createWorldMap, getTile } from './core/map.js';
export type { WorldMap, TileType } from './core/map.js';