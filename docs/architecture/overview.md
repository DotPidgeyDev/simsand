# Architecture Overview

**Status:** Active implementation — foundational architecture  
**Version:** 1.1  
**Last updated:** 2026-11-12

This document describes the technical architecture and design direction of Simsand, a persistent, autonomous fantasy world designed for livestream participation.

It distinguishes implemented functionality from planned architecture and unresolved decisions.

---

## 1. Project vision

Build a persistent, autonomous fantasy world that continues to evolve whether or not a streamer or viewer is present.

Viewers can become characters and influence the world through constrained commands, preferences, votes and collective decisions. A streamer can intervene as a god-like presence, introducing blessings, curses, disasters, creatures, quests, artefacts and festivals.

The central experience is not a chat room with avatars. It is a living simulation in which viewers become invested in characters and wonder what will happen to them.

> The world exists independently of the audience. Viewers participate in a living world; the world does not exist solely to respond to viewers.

The project is simulation-first, game second and livestream presentation third.

---

## 2. Product goals

1. Create an autonomous world with persistent state.
2. Give characters enough individuality and agency to produce emergent outcomes.
3. Allow viewers to participate without requiring direct control of every action.
4. Give the streamer meaningful interventions whose consequences are simulated.
5. Surface interesting events without fabricating events or outcomes.
6. Support an attractive top-down pixel-art presentation.
7. Build incrementally, validating the simulation before adding complexity.

---

## 3. Non-goals for the initial release

- A conventional real-time multiplayer game.
- Direct chat control of every character action.
- LLM-driven decision-making on every simulation tick.
- Microservices or distributed simulation.
- Multiple authoritative simulation workers.
- A general-purpose modding platform.
- A complete political, economic or combat simulation before the foundational simulation is established.

---

## 4. Core design principles

| Principle | Consequence |
|---|---|
| Persistent world | Important state survives application restarts. |
| Autonomous simulation | Characters continue acting without chat input. |
| Emergent storytelling | Stories arise from simulated events and their consequences. |
| Single authority | Only the simulation applies authoritative gameplay changes. |
| Presentation independence | Rendering cannot affect simulation outcomes. |
| Validated participation | External requests are checked before becoming simulation commands. |
| Incremental complexity | Implement a working vertical slice before expanding systems. |
| Extensible content | New content should usually be definitional data, not new engine code. |
| Observable behaviour | Developers can inspect why the simulation made a decision. |

---

## 5. High-level architecture

### Current implementation

The foundational architecture is now operational.

```text
                   Simsand
                      |
          +-----------+-----------+
          |                       |
      Node.js Server          Browser Client
          |                       |
    Simulation Manager        PixiJS Renderer
          |                       |
     Worker Thread             Canvas
          |
    Simulation Package
          |
       bitECS
          |
    World State / Systems
          |
     Snapshots / Deltas
          |
     Typed Messages
          |
      Node.js Server
          |
       WebSocket
          |
      Browser Client
```

The server owns networking and manages the simulation worker. A dedicated Node.js worker thread owns the authoritative simulation state.

The browser is an observer, not the owner of gameplay state.

### Planned architecture

The longer-term architecture extends this foundation:

```text
Twitch / YouTube / Kick
          |
    Platform Adapters
          |
    Application Server
          |
    Command Validation
          |
    Typed Worker Messages
          |
    Simulation Worker
          |
    Simulation / ECS / Systems
          |
    Domain Events
          |
    Persistence Boundary
          |
    SQLite Snapshots + Durable Events


Browser Client
    |
    PixiJS World Renderer
    Vue Administration UI
    |
    WebSocket
    |
    Application Server
```

Additional responsibilities such as HTTP APIs, livestream integrations, command processing, persistence and administration will be introduced as their requirements become concrete.

---

## 6. Component responsibilities

### Application server

**Status: Partially implemented**

The Node.js server currently:

- Starts and manages the simulation worker.
- Receives typed messages from the worker.
- Hosts a WebSocket server for browser clients.
- Broadcasts world snapshots and incremental updates.
- Caches the latest world snapshot.
- Sends the cached snapshot to newly connected clients.
- Continues running independently of browser connections.
- Saves and restores world snapshots in SQLite.
- Validates external commands (schema, protocol version, source permissions, rate limit and idempotency key) and routes accepted commands to the simulation through `CommandGateway`.
- Logs a status line every minute and warns when the simulation drops ticks.
- Serves a read-only Fastify inspection API on `127.0.0.1` (status, entity list, single entity).

Planned responsibilities:

- Public Fastify HTTP endpoints. The local command API already accepts a registered viewer's create.
- Livestream platform integrations, including authentication in front of that command API.

### Simulation worker

**Status: Implemented — foundational functionality**

The dedicated Node.js worker thread:

- Owns the ECS world and simulation clock.
- Initializes the simulation population.
- Runs the simulation loop.
- Executes simulation systems.
- Supports pause and resume commands.
- Produces world snapshots and incremental deltas.
- Continues running when no browser is connected.

The worker is the only authoritative owner of live simulation state.

It also applies or rejects validated commands against current state, emits domain events for applied commands, and captures complete state for persistence.

### Simulation package

**Status: Implemented — foundational functionality**

Contains engine-independent simulation code:

- ECS world initialization.
- ECS components.
- Entity creation.
- Seeded population generation.
- Character profiles: name, attributes, personality, needs and lifecycle.
- Movement system.
- Simulation clock.
- Simulation runner and loop.
- Snapshot generation.
- Delta generation.
- Command execution (`character.create`, `character.remove`) and domain-event generation.
- Persisted-world capture and restore.

The package uses bitECS 0.4 and must remain independent of PixiJS, Vue, browser APIs and server-specific modules.

Future functionality will include character behaviour, skills, inventory, relationships, navigation, world systems and other gameplay logic. Fatigue, hunger and thirst each rise and recover. A character rests, and the world feeds or waters them, once that need is pressing.

### Shared package

**Status: Implemented — foundational contracts**

Contains public contracts shared across application and worker boundaries:

- Entity snapshots.
- World snapshots.
- World deltas.
- Server-to-worker message types.
- Worker-to-server message types.
- Persisted-world format.
- Command requests, command results and domain events.

It must not expose internal ECS storage details.

The Zod schemas for command input live in the server, since only the server accepts untrusted commands.

### Browser client

**Status: Implemented — basic renderer**

The browser client currently:

- Connects to the server using WebSockets.
- Receives an initial world snapshot.
- Receives subsequent incremental updates.
- Renders the world using PixiJS.
- Displays the terrain from the snapshot's tile map, resource piles, and coloured entity placeholders.
- Updates entity positions as simulation data changes.

The browser never directly mutates authoritative simulation state.

Future functionality includes:

- Actual terrain and character sprites.
- Camera controls and visual effects.
- Character inspection.
- Administration and debugging interfaces using Vue.
- Permitted user commands.

### Persistence

**Status: Partially implemented — snapshots**

Persistence will eventually store:

- World metadata.
- Simulation seed and tick information.
- Consistent world snapshots.
- Selected durable domain events.
- Important character and world state.

Persistence must not require writing every movement update to disk.

SQLite with WAL is the initial storage solution. Basic snapshot save and restore is implemented; durable domain events are not.

---

## 7. Technology choices

| Area | Choice | Status |
|---|---|---|
| Language | TypeScript | Implemented |
| Runtime | Node.js | Implemented |
| Package manager | pnpm | Implemented |
| Monorepo | pnpm workspaces | Implemented |
| Server | Node.js | Implemented |
| HTTP framework | Fastify | Implemented — read-only inspection API |
| Simulation architecture | ECS | Implemented |
| ECS library | bitECS 0.4 | Implemented |
| Worker | `worker_threads` | Implemented |
| Renderer | PixiJS | Implemented |
| Admin UI | Vue 3 | Planned |
| Transport | WebSockets (`ws`) | Implemented |
| Database | SQLite with WAL (`node:sqlite`) | Implemented — snapshots only |
| Validation | Zod | Implemented — command input |
| Tests | Vitest | Implemented |
| Map editor | LDtk | Selected |
| Pixel-art tooling | Aseprite | Selected |

TypeScript is sufficient for the initial target. Reconsider another runtime, including Rust, only if profiling demonstrates a material bottleneck.

Fastify was introduced for the first HTTP need, the local read-only inspection API. Browser updates still use the separate `ws` WebSocket server.

---

## 8. Package structure

### Current repository structure

```text
simsand/
├── apps/
│   ├── server/
│   │   └── src/
│   │       ├── index.ts
│   │       ├── worker.ts
│   │       ├── simulation-worker.ts
│   │       └── websocket-server.ts
│   │
│   └── client/
│       └── src/
│           ├── index.ts
│           ├── websocket.ts
│           └── renderer.ts
│
├── packages/
│   ├── simulation/
│   │   └── src/
│   │       ├── components/
│   │       ├── core/
│   │       ├── entities/
│   │       ├── systems/
│   │       └── index.ts
│   │
│   └── shared/
│       └── src/
│           └── index.ts
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── tsconfig.node.json
└── tsconfig.browser.json
```

### Package responsibilities

- `apps/server`: Server lifecycle, worker management and browser communication.
- `apps/client`: Browser application and PixiJS renderer.
- `packages/simulation`: ECS, simulation state, entities and systems.
- `packages/shared`: Shared contracts and communication types.

Start with these four packages only. Add a persistence package or other packages when a real boundary or reuse requirement appears.

### Dependency rules

- `simulation` must not depend on `apps/server` or `apps/client`.
- `client` may depend on `shared`, but not on simulation internals.
- `server` may depend on `shared` and manage the simulation worker.
- `shared` must remain independent of application-specific implementation.
- Content definitions should be consumable by the simulation without importing presentation code.

---

## 9. Initial operating targets

These are initial engineering targets, not guaranteed capacity limits.

| Metric | Initial target |
|---|---:|
| Individually simulated characters/entities | 1,000 |
| Average authoritative tick headroom at that population | under 10 ms (10% of the 100 ms timestep) |
| Initial demo entities | 20 |
| Simulation tick rate | 5–10 ticks/sec |
| Fixed timestep | 100 ms |
| Browser rendering | 60 FPS target |
| Simultaneous browser clients | 5 |
| Initial map | 64 × 64 tiles |
| Authoritative workers | 1 |

### Current implementation

| Metric | Current state |
|---|---|
| Initial population | 20 entities |
| Simulation timestep | 100 ms |
| Simulation loop | Implemented |
| Movement | Implemented |
| World dimensions | 64 × 64 tile map |
| Browser renderer | PixiJS |
| Entity representation | Named sprite shapes (square, diamond, triangle; circle while resting; ring while eating or drinking; gold square while working; X when dead); piles as small tile markers; inventory stacks on the entity snapshot |
| Snapshot and delta communication | Implemented |
| Multiple browser clients | Supported by WebSocket server |
| 1,000-entity tick (after Milestone 07) | About 4–5 ms average, still under the 10 ms guardrail; `updateActions` dominates |

The simulation owns a 64 × 64 tile map of grass, dirt, water, rock and camp, generated from the world seed. The map's dimensions define the movement bounds. Rock blocks movement. A route shared by the map walks around it toward water, land or a camp.

Standing performance goals (commitment-aware action updates, cheap cache invalidation, static map in snapshots, fidelity LOD before more workers) live in `docs/architecture/simulation.md` §14. Concrete wins are Milestone 10. Use profiling and representative workloads before increasing complexity.

---

## 10. Simulation timing

The simulation uses a fixed timestep of 100ms, equivalent to 10 simulation ticks per second.

The simulation clock tracks:

- Current tick.
- Elapsed simulation seconds.
- Fixed timestep duration.

The simulation loop accumulates real elapsed time and advances the simulation through fixed-size ticks.

This separates simulation time from browser rendering frequency.

The current implementation does not support configurable time scaling. A restart resumes at the saved tick. Time the process was stopped is not simulated.

Future time controls should preserve the fixed simulation timestep while changing how many simulation ticks are executed relative to real time.

---

## 11. Separation of simulation, direction and storytelling

Three responsibilities must remain distinct:

1. **Simulation engine:** Determines actual state changes and consequences.
2. **World director:** Introduces pressures and opportunities, such as disasters, quests and streamer interventions.
3. **Storytelling/presentation:** Detects significant events and presents them through camera focus, notifications, chronicle entries and recaps.

The storytelling layer may summarize and interpret recorded events. It must not invent events or alter simulation outcomes.

The world director is still planned. Storytelling scores completed
greetings, comfort, keep, confide, bluff, gifts, and trades into
chronicle entries over the existing log (`inspectCharacterChronicle`,
`GET /entities/:id/chronicle`). Scoring does not change how characters
choose actions.

---

## 12. Reliability and authority

The following principles govern the architecture:

- The worker is the only authoritative owner of live simulation state.
- Commands are requests, not guaranteed state changes.
- The simulation validates prerequisites before applying a command.
- Important state changes should produce typed domain events.
- Persistence failures must be visible and handled explicitly.
- A reconnecting client receives a current snapshot before subsequent deltas.
- Stable persistent IDs are separate from transient ECS entity handles.

### Current implementation

The worker owns the ECS state and clock.

The server receives updates from the worker and broadcasts them to connected browser clients.

The server caches the most recently received full snapshot and folds each delta into that cache, so a newly connected client initializes from the current world before receiving incremental updates.

Stable character IDs are stored with the world. The character log is retained in the database, up to the newest 100,000 events.

---

## 13. Decisions still open

- Final character death, descendants and inheritance rules.
- Whether one viewer can own more than the single character Milestone 07 allows. A second create is refused while that character exists, including after death.
- Population caps and background simulation detail.
- Exact snapshot cadence. Durable history keeps the newest 100,000 log events.
- When, if ever, to introduce multiple simulation workers.
- How large the stream-facing chronicle window should be, and whether new log types (death, director interventions) need higher tiers. Existing social and economy facts are scored today; debugging history still returns the full retained log.
- Time scaling and fast-forward behaviour.
- How far is too far to start a walk. The route is a shared field; a cutoff is not chosen.
- Long-term ECS abstraction and data migration strategy.

---

## 14. First vertical slice

The first milestone is complete when:

1. The pnpm workspace installs, builds and typechecks.
2. The server starts a dedicated simulation worker.
3. The worker creates a 64 × 64 world and 20 seeded entities.
4. Entities move on a fixed timestep.
5. The server receives typed updates from the worker.
6. A browser receives a snapshot and deltas and renders the world.
7. A second browser tab sees the same authoritative world.
8. Closing browser tabs does not stop the simulation.
9. Reconnecting shows current state.
10. A basic snapshot can be saved and restored.

### Progress

The foundational simulation, worker, WebSocket communication and PixiJS rendering are implemented.

The browser can display 20 independently moving entities. Two browser clients receive the same authoritative world: a later connection is given the current cached snapshot, and both clients then receive the same deltas. A client that loses its connection reconnects with backoff and resynchronizes from a fresh snapshot. The world is saved to SQLite and resumes from the latest valid snapshot after a restart.

The first vertical slice is complete. A headless test confirms the simulation keeps advancing with no browser connected, and the workspace tests cover the simulation and the server.

Milestone 04 is complete. Characters greet a living neighbour while needs are quiet; sociability scores that choice. An empathetic character instead comforts a neighbour whose hunger, thirst or fatigue is above 0.3, and stays until that need recovers. Once two characters have met, loyalty keeps the actor beside that neighbour, and honesty either states the actor's own needs or understates the highest of them. A completed social action writes one relationship and one log event with both participants, and the first of each kind is one shared memory. Inspection lists a character's events. Milestone 05 is complete. A completed camp visit adds one goods to that character's inventory, a generous character gives one to someone they have already met, an industrious character walks to a pile of material and gathers it, holding that material at a camp crafts one food, one food brings hunger down to the quiet line, and a greedy character pays two goods for one food from someone they have met. A pile that runs out returns to stock 3 on the same tile after 90 seconds. The visit with empty hands and the meal with no food both stay. Pathing refinements and the later milestones are listed in the roadmap.

Do not delay the visible vertical slice to build every future system.

---

## 15. Documentation maintenance

This document describes both the current implementation and the intended architecture.

Use the following statuses consistently:

- **Implemented:** Exists in the codebase and has been verified.
- **Planned:** Agreed direction, not yet implemented.
- **Provisional:** Current approach, subject to revision.
- **Open:** Requires a design decision.

When implementation changes an architectural assumption, update the relevant documentation.

Significant architectural changes should be recorded as Architecture Decision Records (ADRs) under `architecture/decisions/`.