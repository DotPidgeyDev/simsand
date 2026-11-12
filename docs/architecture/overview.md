# Architecture Overview

**Status:** Foundational draft\
**Version:** 1.0

## 1. Project vision

Build a persistent, autonomous fantasy world that continues to evolve
whether or not a streamer or viewer is present. Viewers can become
characters and influence the world through constrained commands,
preferences, votes and collective decisions. A streamer can intervene as
a god-like presence, introducing blessings, curses, disasters,
creatures, quests, artefacts and festivals.

The central experience is not a chat room with avatars. It is a living
simulation in which viewers become invested in characters and wonder
what will happen to them.

> The world exists independently of the audience. Viewers participate in
> a living world; the world does not exist solely to respond to viewers.

The project is simulation-first, game second and livestream presentation
third.

## 2. Product goals

1.  Create an autonomous world with persistent state.
2.  Give characters enough individuality and agency to produce emergent
    outcomes.
3.  Allow viewers to participate without requiring direct control of
    every action.
4.  Give the streamer meaningful interventions whose consequences are
    simulated.
5.  Surface interesting events without fabricating events or outcomes.
6.  Support an attractive top-down pixel-art presentation.
7.  Build incrementally, validating the simulation before adding
    complexity.

## 3. Non-goals for the initial release

-   A conventional real-time multiplayer game.
-   Direct chat control of every character action.
-   LLM-driven decision-making on every simulation tick.
-   Microservices or distributed simulation.
-   Multiple authoritative simulation workers.
-   A general-purpose modding platform.
-   A complete political, economic or combat simulation before the first
    vertical slice.

## 4. Core design principles

  -----------------------------------------------------------------------
  Principle                           Consequence
  ----------------------------------- -----------------------------------
  Persistent world                    Important state survives
                                      application restarts.

  Autonomous simulation               Characters continue acting without
                                      chat input.

  Emergent storytelling               Stories arise from simulated events
                                      and their consequences.

  Single authority                    Only the simulation applies
                                      authoritative gameplay changes.

  Presentation independence           Rendering cannot affect simulation
                                      outcomes.

  Validated participation             External requests are checked
                                      before becoming simulation
                                      commands.

  Incremental complexity              Implement a working vertical slice
                                      before expanding systems.

  Extensible content                  New content should usually be
                                      definitional data, not new engine
                                      code.

  Observable behaviour                Developers can inspect why the
                                      simulation made a decision.
  -----------------------------------------------------------------------

## 5. High-level architecture

``` text
Twitch / YouTube / Kick
          |
     Platform adapters
          |
  Application server (Node.js)
  Fastify / commands / WebSockets
          |
     Typed worker messages
          |
  Simulation worker (authoritative)
  ECS / clock / scheduler / systems
          |
  Persistence boundary
  SQLite snapshots + durable events


Browser client
  PixiJS world renderer + Vue admin UI
          |
       WebSocket
          |
  Application server
```

The application server owns networking and integrations. A dedicated
Node.js worker thread owns the authoritative simulation state. The
browser is an observer and command client, not the owner of gameplay
state.

## 6. Component responsibilities

### Application server

-   Starts and supervises the simulation worker.
-   Exposes HTTP endpoints where needed.
-   Manages WebSocket clients and sends snapshots/deltas.
-   Receives platform messages and normalizes them.
-   Validates external requests, permissions and rate limits.
-   Routes accepted commands to the simulation.
-   Coordinates persistence outside the per-tick hot path.

### Simulation worker

-   Owns the ECS world and simulation clock.
-   Executes systems in a defined order.
-   Validates and applies simulation commands.
-   Produces domain events and state updates.
-   Creates consistent snapshots when requested.
-   Continues running when no browser is connected.

### Simulation package

Contains engine-independent simulation code: components, systems,
behaviours, world state, deterministic utilities and domain logic. It
must not import PixiJS, Vue, browser APIs or server-specific modules.

### Shared package

Contains public contracts shared across process boundaries: message
types, command types, event envelopes, identifiers and Zod schemas. It
must not expose internal ECS storage details.

### Browser client

-   Receives an initial world snapshot and subsequent deltas.
-   Renders the world using PixiJS.
-   Provides inspection and administration views using Vue.
-   Sends commands through the server.
-   Never directly mutates authoritative simulation state.

### Persistence

Stores world metadata, snapshots and selected durable domain events.
Persistence must not require writing every movement update to disk.

## 7. Initial technology choices

  -----------------------------------------------------------------------
  Area                    Choice                  Status
  ----------------------- ----------------------- -----------------------
  Language                TypeScript              Decided

  Runtime                 Node.js                 Decided

  Package manager         pnpm                    Decided

  Server                  Fastify                 Decided for initial
                                                  implementation

  Simulation architecture ECS                     Decided

  ECS library             bitECS candidate behind Provisional
                          an internal abstraction 

  Worker                  `worker_threads`        Decided

  Renderer                PixiJS                  Decided

  Admin UI                Vue 3                   Decided

  Transport               WebSockets              Decided

  Database                SQLite with WAL         Decided for initial
                                                  implementation

  Validation              Zod                     Decided

  Tests                   Vitest                  Decided

  Map editor              LDtk                    Selected

  Pixel-art tooling       Aseprite                Selected
  -----------------------------------------------------------------------

TypeScript is sufficient for the initial target. Reconsider another
runtime, including Rust, only if profiling demonstrates a material
bottleneck.

## 8. Initial package structure

``` text
fantasy-world/
├── apps/
│   ├── server/
│   └── client/
├── packages/
│   ├── simulation/
│   └── shared/
├── content/
├── assets/
├── worlds/
├── tests/
├── docs/
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

Start with these four packages only. Add a persistence package or other
packages when a real boundary or reuse requirement appears.

### Dependency rules

-   `simulation` must not depend on `apps/server` or `apps/client`.
-   `client` may depend on `shared`, but not on simulation internals.
-   `server` may depend on `shared` and manage the simulation worker.
-   `shared` must remain independent of application-specific
    implementation.
-   Content definitions should be consumable by the simulation without
    importing presentation code.

## 9. Initial operating targets

These are initial engineering targets, not guaranteed capacity limits.

  Metric                                          Initial target
  -------------------------------------------- -----------------
  Individually simulated characters/entities               1,000
  Initial demo entities                                       20
  Simulation tick rate                           5--10 ticks/sec
  Initial fixed timestep                                  100 ms
  Browser rendering                                60 FPS target
  Simultaneous browser clients                                 5
  Initial map                                      64 × 64 tiles
  Authoritative workers                                        1

Use profiling and representative workloads before increasing complexity.

## 10. Separation of simulation, direction and storytelling

Three responsibilities must remain distinct:

1.  **Simulation engine:** determines actual state changes and
    consequences.
2.  **World director:** introduces pressures and opportunities, such as
    disasters, quests and streamer interventions.
3.  **Storytelling/presentation:** detects significant events and
    presents them through camera focus, notifications, chronicle entries
    and recaps.

The storytelling layer may summarize and interpret recorded events. It
must not invent events or alter simulation outcomes.

## 11. Reliability and authority

-   The worker is the only authoritative owner of live simulation state.
-   Commands are requests, not guaranteed state changes.
-   The simulation validates prerequisites before applying a command.
-   Important state changes produce typed domain events.
-   Persistence failures are visible and handled explicitly.
-   A reconnecting client receives a current snapshot before deltas.
-   Stable persistent IDs are separate from transient ECS entity
    handles.

## 12. Decisions still open

-   Offline progression policy and restart catch-up.
-   Final character death, descendants and inheritance rules.
-   Whether one viewer can own multiple active characters.
-   Population caps and background simulation detail.
-   Exact snapshot cadence and durable-event retention.
-   When, if ever, to introduce multiple simulation workers.
-   How much world history is retained and exposed.

## 13. First vertical slice

The first milestone is complete when:

1.  The pnpm workspace installs, builds and typechecks.
2.  The server starts a dedicated simulation worker.
3.  The worker creates a 64 × 64 grid and 20 seeded entities.
4.  Entities move on a fixed timestep.
5.  The server receives typed updates from the worker.
6.  A browser receives a snapshot and deltas and renders the world.
7.  A second browser tab sees the same authoritative world.
8.  Closing browser tabs does not stop the simulation.
9.  Reconnecting shows current state.
10. A basic snapshot can be saved and restored.

Do not delay the visible vertical slice to build every future system.
