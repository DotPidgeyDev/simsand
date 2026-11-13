# Implementation Roadmap

**Status:** Active — Milestone 02 in progress  
**Version:** 1.3  
**Last updated:** 2026-11-13

## Guiding approach

Build a working vertical slice before implementing the full world. Each milestone should leave the project in a runnable, testable state.

Do not create every future package or directory in advance. Add structure when a real implementation boundary appears.

Prioritize a functioning implementation over speculative infrastructure. Establish clear architectural boundaries early, but only introduce complexity when there is a concrete requirement.

The roadmap is a sequence of development goals, not a commitment to implement every future system exactly as currently described.

---

## Milestone 01 — Simulation foundation

**Goal:** Start the server, open a browser and watch 20 independently simulated entities move around a top-down grid.

**Status: Complete**

### Scope

1. Create the pnpm workspace and shared TypeScript configuration. **Implemented**
2. Add the four initial packages: server, client, simulation and shared. **Implemented**
3. Initialize an ECS world using bitECS. **Implemented**
4. Add identity, position, velocity and appearance components. **Implemented**
5. Generate 20 seeded test entities. **Implemented**
6. Implement a fixed 100 ms simulation timestep. **Implemented**
7. Implement a basic simulation loop with fixed-timestep accumulation and catch-up limits. **Implemented**
8. Establish world dimensions and movement boundaries. **Implemented**
9. Run the simulation in a dedicated Node worker thread. **Implemented**
10. Define typed worker lifecycle, snapshot, delta and error messages. **Implemented**
11. Expose a WebSocket endpoint that sends an initial snapshot and subsequent deltas. **Implemented**
12. Render the world and moving placeholder entities using PixiJS. **Implemented**
13. Verify multiple browser clients observe the same authoritative world. **Verified**
14. Implement basic snapshot save/restore with SQLite. **Implemented**
15. Add headless simulation tests and a 1,000-entity performance test. **Implemented**

### Current implementation

The project currently has:

- A pnpm TypeScript monorepo.
- A Node.js application server.
- A dedicated simulation worker thread.
- A bitECS-based simulation world.
- Identity, position, velocity and appearance components.
- Seeded generation of 20 entities.
- A fixed 100 ms simulation timestep.
- A basic movement system in which entities bounce off the world boundaries.
- A simulation loop with bounded catch-up ticks.
- Full world snapshots and incremental entity deltas.
- Shared TypeScript message contracts.
- A WebSocket server on port 8766.
- Cached snapshots for newly connected browser clients.
- A PixiJS browser renderer displaying the moving entities.
- A seeded 64 × 64 tile map of grass, dirt and water, sent in snapshots and saved with the world.
- SQLite snapshot persistence with periodic and shutdown saves.
- A validated command contract (character create and remove) that produces domain events.
- Timestamped server logging with a status line every minute and a warning when ticks are dropped.
- A read-only inspection API on `127.0.0.1:8767` for status, the entity list and individual entities.
- An end-to-end test that runs the real server with no browser, connects and disconnects a client, and confirms the simulation keeps advancing.

### Carried forward

These were deliberately left out of Milestone 01:

- A public entry point for commands, rate limits and deduplication (Milestone 07).
- Durable storage and delivery of domain events (Milestone 06).
- Terrain affecting movement, navigation and LDtk map loading.
- Inspection beyond the read-only API, such as an admin UI (Milestones 02 and 10).

### Definition of done

- [x] Workspace installs successfully.
- [x] Server and client run independently.
- [x] 20 entities are created from a known seed.
- [x] Entities move using a fixed timestep.
- [x] Simulation runs in a dedicated worker thread.
- [x] Simulation runs without a browser connected.
- [x] Browser receives an initial snapshot and subsequent deltas.
- [x] Browser renders the moving entities.
- [x] Two browser tabs observe the same authoritative world.
- [x] Reconnection receives current state and resumes updates.
- [x] Entity creation and removal are represented correctly in client updates.
- [x] A basic snapshot can be restored after restart.
- [x] Headless tests cover the foundational simulation behaviour.
- [x] A 1,000-entity test completes within an acceptable performance budget.
- [x] Standard external command contracts are defined and tested.
- [x] Initial domain-event contracts are defined.
- [x] A basic tile map represents the world.
- [x] An automated test confirms the simulation continues independently of browser connections.
- [x] Minimal simulation logging and inspection are available.

The milestone is complete when the foundational simulation can run independently, recover its state, and serve multiple browser clients without compromising authoritative state ownership.

---

## Milestone 02 — Character foundation

**Status: In progress**

Add character identity, appearance references, attributes, personality, needs and basic lifecycle.

Establish data ownership and validation before building complex AI.

### Current implementation

A character now has a profile stored on its entity and saved with the world (persisted format version 6):

- A seeded name, from the world seed and the character's stable ID.
- Seven attributes, integers from 1 to 10.
- Ten personality traits, each from 0 to 1.
- Three basic needs (hunger, thirst and fatigue), from 0 (satisfied) to 1 (critical). New characters start comfortable.
- A lifecycle state, `alive` or `dead`. Dead characters stay in the world but do not move.

The profile is generated inside the simulation, validated when a character is created or a save is loaded, and returned by the inspection API. Version 2 saves gain profiles on load, generated from the seed, and the next save stores them.

Fatigue rises while a character moves and falls while they rest. Constitution is the first derived statistic: it sets the fatigue rate, which inspection reports. A character rests at fatigue 0.8 and starts moving again at 0.3, shown as a circle. Hunger and thirst rise the same way, and the world feeds and waters a character once a need reaches 0.8, until it falls to 0.3. They stop while eating or drinking, drawn with a ring. The resting, eating and drinking flags are saved, because the same need value occurs on the way up and the way down. Seeking a source, and choosing between needs, comes later. Nothing in the simulation sets a character to dead.

Appearance stores a named sprite from a small catalog (`wanderer`, `scout`, `elder`), chosen from the world seed and the character's ID on a stream that does not change the profile. The renderer draws them as a square, a diamond and a triangle. A resting character is still a circle, so the state stays readable. Older saves stored a numeric sprite that was always 1; loading one assigns the seeded name.

### Remaining work

- Lifecycle transitions caused by the simulation.

Initial scope:

- Character identity and persistent identifiers.
- Character appearance and sprite references.
- Core attributes and derived statistics.
- Personality traits.
- Basic needs.
- Character lifecycle states.
- Character creation and initialization.
- Character data validation.
- Initial character-focused inspection tools.

Avoid implementing complex decision-making at this stage. The goal is to establish a reliable character model that future systems can build upon.

### Definition of done

- [x] Characters have stable IDs and seeded names.
- [x] Appearance uses named sprite references.
- [x] Core attributes are stored, validated and persisted.
- [x] Derived statistics are defined by a system that uses them.
- [x] Personality traits are stored, validated and persisted.
- [x] Basic needs are stored, validated and persisted.
- [x] Needs change over time and can recover.
- [x] Lifecycle state is stored, and dead characters do not move.
- [ ] The simulation itself changes lifecycle state.
- [x] Character creation fills in a valid profile.
- [x] Character data is validated at creation and when a save is loaded.
- [x] Inspection shows a character's full profile.

---

## Milestone 03 — Autonomous behaviour

**Status: Planned**

Implement a small utility-based action system with a few actions such as idle, move, eat, rest and work.

Initial scope:

- Utility-based action selection.
- Action definitions and execution.
- Action prerequisites.
- Action commitment and interruption.
- Cooldowns.
- Failure handling.
- Seeded variation.
- Basic need-driven behaviour.
- Behaviour inspection and debugging.

Characters should make autonomous decisions without relying on an LLM for the critical simulation loop.

The goal is to establish a small but convincing autonomous behaviour cycle before introducing more complex systems.

---

## Milestone 04 — Interaction and social behaviour

**Status: Planned**

Add interactions, sparse relationships, meaningful memories and basic social actions.

Initial scope:

- Character-to-character interactions.
- Relationship data and relationship changes.
- Social action selection.
- Memory creation and retrieval.
- Interaction outcomes.
- Social needs and motivations.
- Event generation from actual simulation outcomes.

Ensure events and relationships are generated from authoritative simulation outcomes rather than presentation-layer assumptions.

---

## Milestone 05 — Inventory and basic economy

**Status: Planned**

Add items, inventories, resource nodes, production, consumption and simple trade.

Initial scope:

- Item definitions.
- Character inventories.
- Item ownership.
- Resource nodes.
- Gathering and resource extraction.
- Production and consumption.
- Basic trade and exchange.
- Economy invariants.
- Item and resource lifecycle.

Establish reliable ownership and transfer rules before introducing more complex economic behaviour.

---

## Milestone 06 — Durable world

**Status: Planned**

Expand snapshots and durable events to cover implemented gameplay state.

Initial scope:

- Complete world snapshot model.
- Persistence of implemented character and world state.
- Durable event storage where appropriate.
- Recovery and restart behaviour.
- Database migrations.
- Backup and restore procedures.
- Persistence validation.
- Offline progression policy.
- Recovery testing.

Persistence foundations should be introduced during Milestone 01. This milestone completes the robust persistence model rather than postponing all saving until later.

The persistence strategy should reflect the actual simulation requirements. Avoid storing every transient state change as a permanent event.

---

## Milestone 07 — Viewer participation

**Status: Planned**

Add viewer identity, platform identity, character creation and Twitch integration.

Initial scope:

- Viewer identity model.
- Platform identity mapping.
- Twitch adapter.
- Normalized platform messages.
- Viewer character creation.
- Command processing.
- Permissions and authorization.
- Command deduplication.
- Rate limits and abuse prevention.
- Moderation.
- Viewer feedback.

The simulation must remain independent of the streaming platform. Platform adapters translate external activity into normalized requests, while the server handles authentication and authorization.

---

## Milestone 08 — World director and storytelling

**Status: Planned**

Add significant-event detection, streamer interventions, notifications, chronicle entries and camera focus.

Initial scope:

- Significant simulation-event detection.
- World director.
- Streamer interventions.
- Blessings, curses and world events.
- Quests and special encounters.
- Notifications.
- Chronicle entries.
- Presentation priorities.
- Camera focus and event-driven presentation.

Ensure presentation is grounded in recorded simulation events. The director should react to the world rather than dictate ordinary character behaviour.

---

## Milestone 09 — Society and world depth

**Status: Planned**

Expand settlements, professions, factions, families, combat, wildlife, weather and long-term economy as separate systems.

Potential areas:

- Settlement development.
- Professions and specializations.
- Factions and organizations.
- Families and generations.
- Combat and conflict.
- Wildlife and ecosystems.
- Weather and environmental systems.
- Advanced production and trade.
- Territorial development.
- Long-term social and economic simulation.

Introduce these systems incrementally. Each should have clear ownership, inputs, outputs and interactions with existing simulation systems.

---

## Milestone 10 — Production readiness and expanded presentation

**Status: Planned**

Improve operational reliability, administration, stream presentation and platform support.

Initial scope:

- Admin and inspection tools.
- Operational monitoring.
- Simulation performance profiling.
- Error reporting and recovery.
- Backup automation.
- Moderation tools.
- Stream presentation improvements.
- Viewer-facing UI improvements.
- YouTube and Kick adapters.
- Deployment and operational documentation.
- Production security and configuration.

The goal is to make the simulation reliable to operate over extended periods, including periods with no active viewers.

---

## Milestone sequencing notes

The sequence is a planning guide, not a rigid dependency graph.

Some persistence, observability, testing and communication work must begin early. Avoid implementing advanced systems simply because they appear later in the roadmap; validate the preceding gameplay loop first.

A milestone should establish a working foundation for the next one without prematurely implementing its full scope.

The project should remain runnable throughout development. Prefer small, verifiable increments and update architecture documentation when implementation decisions materially change.