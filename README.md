# Simsand — Persistent Fantasy World

**Status:** Early development — Milestone 01  
**Version:** 0.2.0  
**Last updated:** 2026-11-12

Simsand is a persistent, autonomous fantasy-world simulation designed to eventually support livestream participation.

The goal is to create a world that continues to exist and evolve independently of its viewers. Characters have their own identities, personalities, needs, ambitions, relationships and activities. They can work, explore, trade, fight, build communities and develop societies over time.

Viewers will eventually be able to participate by influencing the world through livestream chat, decisions and events, while the streamer acts as a world director capable of introducing blessings, disasters, quests and other interventions.

The project is being developed simulation-first, with gameplay systems and livestream integration added incrementally.

---

## Current overview

The project is currently at the simulation foundation stage.

The initial implementation consists of:

- **TypeScript monorepo:** Shared contracts and separate application packages.
- **Node.js server:** Hosts and manages the simulation.
- **Dedicated worker thread:** Owns and runs the authoritative simulation.
- **ECS architecture:** Uses bitECS to manage entities and their components.
- **Fixed simulation timestep:** Runs at 10 ticks per second (100ms per tick).
- **Seeded population:** Creates an initial population of 20 entities.
- **Movement system:** Entities move independently within the world boundaries.
- **WebSocket communication:** Sends initial world snapshots and incremental updates to connected clients.
- **PixiJS renderer:** Displays the world as a top-down tile map with moving coloured entity sprites.

The browser is currently a visual representation of the simulation. It does not own or modify authoritative simulation state.

### Current architecture

```text
                  Simsand
                     |
          +----------+----------+
          |                     |
      Node Server           Browser Client
          |                     |
    Worker Thread           PixiJS Renderer
          |                     |
    Simulation / ECS       World Visualization
          |
    World State
          |
    Snapshots / Deltas
          |
       WebSocket
          |
     Browser Client
```

### Technology stack

| Area | Technology |
|---|---|
| Language | TypeScript |
| Runtime | Node.js |
| Package manager | pnpm |
| Monorepo | pnpm workspaces |
| Entity Component System | bitECS |
| Simulation execution | Node.js worker_threads |
| Browser rendering | PixiJS |
| Development server | Vite |
| Communication | WebSockets (`ws`) |
| Testing | Vitest |
| Runtime validation | Zod (command input) |
| Persistence | SQLite with WAL (`node:sqlite`) |
| Admin interface | Vue 3 (planned) |

---

## Project structure

```text
simsand/
├── apps/
│   ├── client/                 # Browser application and renderer
│   │   └── src/
│   │       ├── index.ts
│   │       ├── websocket.ts
│   │       └── renderer.ts
│   │
│   └── server/                 # Node.js simulation host
│       └── src/
│           ├── index.ts
│           ├── worker.ts
│           ├── simulation-worker.ts
│           └── websocket-server.ts
│
├── packages/
│   ├── shared/                 # Shared types and message contracts
│   │   └── src/
│   │       └── index.ts
│   │
│   └── simulation/             # Simulation engine and ECS
│       └── src/
│           ├── components/
│           ├── core/
│           ├── entities/
│           ├── systems/
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

- `apps/server`: Starts the simulation worker and provides WebSocket communication to browser clients.
- `apps/client`: Connects to the server and renders the world using PixiJS.
- `packages/simulation`: Contains the authoritative simulation logic, ECS components, entities, systems and simulation clock.
- `packages/shared`: Contains types and communication contracts shared between applications and packages.

---

## Installation

### Prerequisites

Install the following before setting up the project:

| Requirement | Version |
|---|---|
| Node.js | 24.x recommended |
| pnpm | 12.18.0 |
| Git | Latest stable |

The project is currently developed using Ubuntu 22.04 under WSL2.

Check your installed versions:

```bash
node --version
npm --version
pnpm --version
```

### 1. Clone the repository

Clone the repository and enter the project directory:

```bash
git clone <repository-url>
cd simsand
```

Replace `<repository-url>` with the actual Git repository URL.

### 2. Install dependencies

From the project root:

```bash
pnpm install
```

This installs dependencies for the root project and all workspace packages.

### 3. Start the applications

The server and browser client run as separate applications.

**Terminal 1 — Start the simulation server:**

```bash
pnpm --filter @simsand/server dev
```

The server should start the simulation worker and report that the simulation is ready.

It also starts the WebSocket server on port `8766`.

**Terminal 2 — Start the browser client:**

```bash
pnpm --filter @simsand/client dev
```

Vite will display the local development URL, normally:

```text
http://localhost:5173
```

Open that URL in your browser.

You should see a tile map of grass, dirt and ponds with 20 coloured characters moving around independently. Each character is a square, a diamond or a triangle, depending on its sprite. A resting character is a circle. A character who has stopped to eat or drink has a ring around them. A dead character is an X.

The server saves the world to `apps/server/data/simsand.sqlite` every 30 seconds and when stopped with Ctrl-C, then resumes from that save on the next start. Delete the `apps/server/data` directory to start a new world.

### 4. Inspect the running simulation

The server logs a status line every minute with the tick, population, connected browsers, tick timing and last save. It warns if the simulation falls behind and drops ticks.

A read-only inspection API listens on `http://127.0.0.1:8767` (local connections only):

```bash
curl 127.0.0.1:8767/status                       # server and simulation status, tick timing
curl 127.0.0.1:8767/entities                     # every entity's ID and position
curl 127.0.0.1:8767/entities/character-0001      # one entity, including velocity, the tile under it and its profile
```

### Server configuration

| Variable | Default | Purpose |
|---|---|---|
| `SIMSAND_DB_PATH` | `apps/server/data/simsand.sqlite` | SQLite database file |
| `SIMSAND_SAVE_INTERVAL_MS` | `30000` | Time between periodic saves |
| `SIMSAND_STATUS_INTERVAL_MS` | `60000` | Time between status log lines |
| `SIMSAND_LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |
| `SIMSAND_WS_PORT` | `8766` | Browser WebSocket port |
| `SIMSAND_INSPECT_PORT` | `8767` | Inspection API port |

---

## Development commands

Run these commands from the project root.

| Command | Purpose |
|---|---|
| `pnpm install` | Install workspace dependencies |
| `pnpm dev` | Start the application development servers in parallel |
| `pnpm build` | Build workspace packages |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm test` | Run workspace tests |

Individual package commands are also available:

```bash
pnpm --filter @simsand/server dev
pnpm --filter @simsand/client dev

pnpm --filter @simsand/simulation typecheck
pnpm --filter @simsand/client typecheck
```

Note: Build and test scripts are still being established across the workspace. Individual package commands may be more useful while development is underway.

---

## Current implementation details

### Simulation

The simulation runs independently of the browser.

- The server creates a dedicated worker thread.
- The worker initializes the ECS world.
- A seeded population of 20 entities is created.
- The simulation advances using a fixed 100ms timestep.
- Movement systems update entity positions.
- The worker periodically generates incremental world updates.

### Communication

The server and worker communicate through typed messages.

The browser communicates with the server using WebSockets.

The current communication flow supports:

- Initial world snapshots.
- Incremental entity updates.
- Multiple simultaneous browser clients.
- Sending the latest cached snapshot to newly connected clients.

This allows the simulation to continue running even when no browser clients are connected. An end-to-end test (`apps/server/src/headless.e2e.test.ts`) starts the real server with no browser, connects and disconnects a WebSocket client, and checks that the tick keeps advancing throughout.

### Rendering

PixiJS currently renders:

- A 64×64 tile map of grass, dirt and water, generated from the world seed and received from the server.
- Grid lines.
- Coloured placeholder shapes for entities: a square (`wanderer`), a diamond (`scout`) or a triangle (`elder`). A resting entity is drawn as a circle. An entity who is eating or drinking has a ring around them. A dead entity is an X.
- Entity positions updated through incoming snapshots and deltas.

Terrain is drawn as flat colours. Characters can currently cross water; collision comes with navigation. The current renderer is deliberately simple. Terrain tile art, character sprites, animations, camera controls and visual effects will be introduced later.

---

## Development roadmap

The first milestone is focused on establishing a reliable simulation foundation.

| Milestone | Description | Status |
|---|---|---|
| 01 | Simulation foundation and browser rendering | Complete |
| 02 | World maps, terrain and navigation | Planned |
| 03 | Character attributes, needs and behaviours | Planned |
| 04 | Actions, skills, inventory and items | Planned |
| 05 | Relationships, social systems and settlements | Planned |
| 06 | Economy, resources and trading | Planned |
| 07 | Persistence and world recovery | Planned |
| 08 | Viewer identities and livestream integration | Planned |
| 09 | World director and storytelling systems | Planned |

These milestones are an evolving implementation plan, not a fixed feature commitment.

---

## Architecture documentation

The architecture documentation remains the reference for the project's longer-term technical direction.

### Start here

- [Architecture overview](architecture/overview.md)
- [Simulation architecture](architecture/simulation.md)
- [Communication architecture](architecture/communication.md)
- [Persistence architecture](architecture/persistence.md)
- [Viewer identity and character ownership](architecture/viewer-identity.md)
- [Architecture decisions](architecture/decisions/README.md)
- [Implementation roadmap](roadmap/milestones.md)

### Design documents

- [Character simulation](design/character-simulation.md)
- [World simulation](design/world-simulation.md)
- [World director and storytelling](design/storytelling.md)

---

## Development principles

A few principles guide implementation:

1. **Simulation first:** The world must function independently of its renderer and livestream integrations.
2. **One authoritative world:** The server owns the simulation state. Clients are observers and eventual sources of permitted commands.
3. **Incremental development:** Build small, working systems and verify them before expanding.
4. **Modular architecture:** Keep package boundaries clear without prematurely introducing microservices.
5. **Deterministic foundations:** Prefer predictable, testable simulation logic and seeded randomness where practical.
6. **Persistence matters:** The eventual world should survive server restarts and continue evolving over time.
7. **Characters are autonomous:** Viewers influence the world, but characters should have their own agency.

The immediate priority is to develop a reliable world simulation before introducing the more complex gameplay, social and livestream systems.