# Simulation Architecture

**Status:** Active implementation — foundational simulation  
**Version:** 1.1  
**Last updated:** 2026-11-12

## 1. Purpose

The simulation is the authoritative model of the world. It owns gameplay state, decides what characters and other entities do, and applies all consequential changes.

Rendering, chat integrations and administration are clients of this model.

The simulation must remain independent of presentation and external application concerns. It should be possible to run and test the simulation without starting a browser or connecting to livestream platforms.

The current implementation establishes the foundational ECS world, simulation clock, execution loop, movement system and communication of world state.

Future systems will expand this foundation into a complete autonomous world simulation.

---

## 2. Execution model

Use one dedicated Node.js `worker_thread` as the authoritative simulation process initially.

**Status: Implemented — foundational functionality**

The worker currently owns:

- ECS world and entity/component state.
- Simulation clock and tick counter.
- Simulation runner and execution loop.
- Seeded initial population.
- Simulation systems.
- World snapshot and delta generation.

The worker is responsible for advancing the simulation independently of browser connections.

The main application process owns:

- Server lifecycle.
- Worker creation and termination.
- WebSocket server.
- Browser client connections.
- Distribution of simulation updates.

The main application must not maintain a second authoritative copy of gameplay state.

### Worker lifecycle

The server creates the simulation worker and sends an initial `world.start` message containing the optional seed and population size.

The worker initializes the ECS world, creates the initial population, initializes the clock and runner, and starts the simulation loop.

The worker then sends a `world.ready` message to the server.

The server requests an initial snapshot and subsequently distributes snapshots and incremental updates to connected browser clients.

The current worker lifecycle supports:

- Startup.
- Pause.
- Resume.
- Snapshot requests.
- Termination.

Automatic recovery, worker supervision and restoring persisted state are not yet implemented.

---

## 3. ECS model

The simulation uses bitECS 0.4 as its Entity Component System implementation.

The ECS library is currently accessed directly by the simulation package. A small internal abstraction may be introduced later if implementation experience or profiling justifies it.

### Entities

Entities are runtime identities to which components are attached.

The current implementation creates entities through a dedicated character creation function.

Each initial character receives a string identifier such as:

`character-0001`

These identifiers are stored in the `Identity` component and are used when producing snapshots and communicating with the browser.

The underlying bitECS entity handle is separate from this identifier. The simulation world keeps a map from stable ID to bitECS handle. `createCharacter` registers each character there and rejects IDs that already exist. `removeCharacter(world, id)` removes the bitECS entity and its map entry.

bitECS reuses handles after removal, so handles must never leave the simulation or be persisted. Snapshots, deltas and other external contracts use stable IDs only.

Rules for persisting stable IDs and rebuilding the map during restoration are part of the SQLite persistence work.

### Components

Components are small data structures describing entity state.

The current components are:

| Component | Current data | Purpose |
|---|---|---|
| `Identity` | `id` | Identifies an entity |
| `Position` | `x`, `y` | World coordinates |
| `Velocity` | `x`, `y` | Movement vector |
| `Appearance` | `color`, `sprite` | Basic visual representation |

Components are implemented using bitECS 0.4-compatible data structures.

Future components may include:

- Character attributes.
- Needs and conditions.
- Skills and experience.
- Inventory references.
- Action state.
- Health and combat attributes.
- Relationships.
- Faction affiliation.
- Personality and ambitions.

Components should remain focused on representing data rather than implementing gameplay behaviour.

### Systems

Systems process entities with relevant component combinations.

The current simulation includes:

**Movement system**

- Queries entities containing `Position` and `Velocity`.
- Calculates new positions using the fixed simulation timestep.
- Applies world boundary constraints.
- Updates entity positions.

Future systems may include:

- Needs system.
- Utility evaluation system.
- Action execution system.
- Navigation system.
- Combat system.
- Economy system.
- Social and relationship systems.

Systems should have explicit responsibilities and predictable execution order.

### Domain stores alongside ECS

Not every concept needs to be represented as a frequently iterated ECS component.

Sparse or graph-shaped data such as family trees, memories, detailed relationship records and historical records may live in domain stores keyed by stable entity ID.

No separate domain stores currently exist.

When introduced, these stores must have clearly defined ownership and must be included in consistent world snapshots where their state is required for recovery.

---

## 4. ECS library abstraction

**Status: Provisional — not implemented**

bitECS 0.4 is currently used directly inside the simulation package.

An internal abstraction may eventually be introduced for operations the project actually needs:

- Create and destroy runtime entities.
- Add, remove and access components.
- Query entities.
- Resolve stable IDs.
- Iterate entities for system processing.

Do not build a generic ECS framework.

The purpose of any abstraction should be to reduce unnecessary coupling to the library API and make replacement possible if profiling or implementation experience justifies it.

For now, direct bitECS usage is acceptable while the simulation foundation is being established.

---

## 5. Fixed-timestep clock

**Status: Implemented — foundational functionality**

The initial simulation target is one simulation tick every 100ms (10 ticks per second).

The current clock tracks:

- `tick`
- `elapsedSeconds`
- `fixedDeltaSeconds`

The default fixed timestep is 0.1 seconds.

The clock advances only when the simulation runner executes a tick.

The runner currently:

1. Checks whether the simulation is paused.
2. Updates movement using the fixed timestep.
3. Advances the simulation clock.

### Simulation loop

The simulation loop accumulates elapsed real time and executes fixed-size simulation ticks when sufficient time has accumulated.

The current implementation:

- Uses a 10ms polling interval by default.
- Uses a maximum of five catch-up ticks per loop iteration.
- Prevents unlimited catch-up work when the simulation falls behind.
- Can be started and stopped.
- Avoids starting duplicate loops.

The loop uses a fixed simulation delta regardless of how frequently the underlying timer executes.

### Time concepts

Keep these concepts distinct:

- **Wall-clock time:** Actual elapsed real-world time.
- **Simulation time:** Time experienced by the world.
- **Tick:** One discrete simulation update.
- **Stream time:** Time at which an event is shown to the audience.

### Future clock functionality

The current implementation supports a fixed timestep and pause/resume through the simulation runner.

The following remain planned:

- Configurable time scaling.
- Fast-forward and slow-motion simulation.
- Offline progression.
- Restart catch-up.
- Persistent simulation-time recovery.

Time scaling should preserve the fixed simulation timestep while changing how many simulation ticks are executed relative to real time.

Offline progression and catch-up behaviour must be settled before implementing substantial offline simulation.

---

## 6. System scheduling and ordering

**Status: Partially implemented**

The current simulation runner has a simple, explicit execution sequence.

At present:

1. Check whether the simulation is paused.
2. Update movement.
3. Advance the simulation clock.

World boundary enforcement is currently part of the movement system rather than a separate system.

The project does not yet have a general-purpose system registry or scheduler.

As additional gameplay systems are introduced, execution order must be documented and managed deliberately.

A future schedule may resemble:

1. Apply queued commands.
2. Update character needs.
3. Evaluate available actions.
4. Execute character actions.
5. Update movement and navigation.
6. Resolve interactions and combat.
7. Update world and economy systems.
8. Enforce world invariants.
9. Produce required state changes and domain events.
10. Publish accumulated updates.

The final ordering should be determined by actual dependencies between systems.

For example, an action may consume an item, while an economy system later updates stockpiles.

Do not rely on incidental module import order.

A system should not perform network I/O or block on database operations in the tick loop.

---

## 7. Determinism and randomness

**Status: Partially implemented**

The initial population generator uses seeded pseudo-random generation.

This allows the initial population to be reproduced from a known seed.

The worker currently accepts an optional seed through the `world.start` message and defaults to a fixed seed when one is not supplied.

The initial goal is reproducible entity generation and easier debugging.

Future requirements:

- Store the world seed.
- Maintain random generator state or a reproducible random-stream strategy.
- Make character and world generation reproducible from known inputs.
- Avoid hidden sources of nondeterminism in simulation decisions.
- Record externally submitted commands and their processing order if replay is later required.

The current implementation does not persist random generator state or guarantee deterministic replay of the entire simulation.

The initial goal is reproducible generation, not a guarantee of bit-for-bit deterministic replay across all future runtime versions.

---

## 8. Commands and state authority

**Status: Planned — not implemented**

External callers will eventually submit typed commands.

The worker will validate each request against current authoritative state and either reject it with a reason or apply it.

A request to move a character, for example, does not mean the character moved.

The simulation may reject it because the character is dead, busy, unable to reach the destination or not permitted to perform the action.

Only the worker changes authoritative state.

The current worker message protocol supports lifecycle and snapshot requests:

- `world.start`
- `world.pause`
- `world.resume`
- `world.snapshot.request`

Gameplay command processing and validation have not yet been introduced.

---

## 9. Updates and snapshots

**Status: Implemented — foundational functionality**

The worker publishes:

- Initial full world snapshots.
- Incremental world deltas.
- Lifecycle messages.
- Error messages.

### World snapshots

A snapshot contains:

- Simulation tick.
- Elapsed simulation seconds.
- Entity data.

The current entity snapshot includes:

- Stable entity identifier.
- Position.
- Colour.
- Sprite identifier.

Snapshots are generated from the current ECS state.

The server caches the latest full snapshot and sends it to newly connected browser clients.

### World deltas

The simulation periodically compares the current snapshot with the previous snapshot.

Only entities whose tracked data has changed are included in the resulting delta.

The current worker generates deltas every 200ms.

This avoids broadcasting the entire world on every simulation tick.

The delta includes newly created and changed entities, and lists the stable IDs of entities present in the previous snapshot but not the current one in `removed`. The worker sends a delta whenever either list is non-empty.

### Communication flow

```text
Simulation Worker
       |
       | World Snapshot / World Delta
       |
Application Server
       |
       | WebSocket
       |
Browser Client
       |
       | PixiJS Renderer
       |
World Visualization
```

The server distributes updates but does not reinterpret them as authority to modify world state.

Important domain events are not yet implemented.

---

## 10. Failure handling

**Status: Partially implemented**

The current implementation includes basic worker error and lifecycle handling.

The server:

- Logs worker runtime errors.
- Logs non-zero worker exit codes.
- Clears its worker reference when the worker exits.
- Supports explicit worker termination.

The worker reports simulation errors through the `world.error` message where its message handler can catch them.

The following remain important future requirements:

- Worker startup failure must be reported clearly to the application.
- Worker runtime errors must be surfaced and logged with context.
- The server must stop accepting commands when the worker is unavailable.
- Do not silently restart a worker with an empty world.
- Recovery must load a valid snapshot and required durable events before simulation resumes.
- Persistence errors must not be swallowed.
- Worker recovery must preserve the authoritative world state.

Automatic recovery and persistence-backed restoration are not currently implemented.

---

## 11. Initial testing

**Status: Partially implemented**

The simulation is designed to be tested independently of the browser and server.

Vitest is used for simulation tests.

Current test coverage includes foundational behaviour such as:

- Seeded population generation.
- Fixed clock progression.
- Pause and resume.
- Movement and world bounds.
- Simulation loop execution.
- Simulation loop stopping.
- Snapshot generation.
- Delta generation.

Future testing should include:

- Stable-ID mapping.
- Entity creation and destruction.
- System ordering.
- Command validation.
- Snapshot serialization and restoration.
- Domain store consistency.
- Invariants such as valid positions and unique persistent IDs.

Add a headless test with 1,000 entities before optimizing.

Performance should be measured against representative simulation workloads rather than assumed from the initial population size.

---

## 12. Current implementation status

| Capability | Status |
|---|---|
| ECS world initialization | Implemented |
| bitECS 0.4 integration | Implemented |
| Identity component | Implemented |
| Position component | Implemented |
| Velocity component | Implemented |
| Appearance component | Implemented |
| Character creation | Implemented |
| Seeded population generation | Implemented |
| Fixed simulation clock | Implemented |
| Simulation runner | Implemented |
| Fixed-timestep simulation loop | Implemented |
| Pause and resume | Implemented |
| Movement system | Implemented |
| World boundary constraints | Implemented |
| World snapshots | Implemented |
| Incremental world deltas | Implemented |
| Worker communication | Implemented |
| ECS abstraction | Not implemented |
| General-purpose system scheduler | Not implemented |
| Domain stores | Not implemented |
| Time scaling | Not implemented |
| Gameplay command processing | Not implemented |
| Domain events | Not implemented |
| Entity removal tracking | Implemented |
| Stable-ID-to-handle mapping | Implemented (in memory) |
| Persistent snapshots | Not implemented |
| Snapshot restoration | Not implemented |
| Deterministic replay | Not implemented |
| 1,000-entity performance test | Not yet verified |

---

## 13. Architectural principles

The following principles should guide future simulation development:

1. The simulation worker owns authoritative gameplay state.
2. Simulation logic must remain independent of rendering and external integrations.
3. Use ECS components for frequently accessed entity state.
4. Keep systems focused and predictable.
5. Preserve a fixed simulation timestep.
6. Use seeded randomness where reproducibility matters.
7. Treat external commands as requests requiring validation.
8. Publish snapshots and incremental deltas rather than entire world state every tick.
9. Keep network and database operations outside the simulation hot path.
10. Build complexity only when actual gameplay requirements justify it.

The simulation should remain understandable, testable and observable as its complexity grows.