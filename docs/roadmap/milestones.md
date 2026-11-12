# Implementation Roadmap

**Status:** Initial plan\
**Version:** 1.0

## Guiding approach

Build a working vertical slice before implementing the full world. Each
milestone should leave the project in a runnable, testable state.

Do not create every future package or directory in advance. Add
structure when a real implementation boundary appears.

## Milestone 01 --- Simulation foundation

**Goal:** Start the server, open a browser and watch 20 independently
simulated entities move around a top-down grid.

Scope:

1.  Create pnpm workspace and shared TypeScript configuration.
2.  Add the four initial packages: server, client, simulation and
    shared.
3.  Initialize an ECS world behind a small internal API.
4.  Add identity, position, velocity and appearance components.
5.  Generate 20 seeded test entities with stable persistent IDs.
6.  Implement a fixed 100 ms simulation timestep and basic scheduler.
7.  Create a simple 64 × 64 grid with boundaries.
8.  Run the simulation in a dedicated Node worker thread.
9.  Define typed worker lifecycle, snapshot, delta and error messages.
10. Expose a WebSocket endpoint that sends an initial snapshot and
    subsequent deltas.
11. Render the map and moving placeholder sprites using PixiJS.
12. Add basic snapshot save/restore with SQLite when the vertical slice
    is working.
13. Add headless tests and a 1,000-entity performance test.

Definition of done:

-   Install, build and typecheck succeed.
-   20 entities are created from a known seed.
-   Entities move on a fixed timestep.
-   Worker runs without a browser connected.
-   Browser receives a snapshot and deltas.
-   Two tabs observe the same world.
-   Reconnection receives current state.
-   A basic snapshot can be restored after restart.
-   Headless 1,000-entity test completes acceptably.

### Foundational additions

Include these without expanding the milestone into a large framework:

-   Stable persistent entity IDs separate from ECS handles.
-   Typed domain-event contracts, initially for a small number of
    events.
-   Minimal simulation logging/inspection.
-   A standard external command contract, tested without Twitch
    integration.

## Milestone 02 --- Character foundation

Add character identity, appearance references, attributes, personality,
needs and basic lifecycle. Establish data ownership and validation
before building complex AI.

## Milestone 03 --- Autonomous behaviour

Implement a small utility-based action system with a few actions such as
idle, move, eat, rest and work. Add action commitment, prerequisites,
cooldowns, failure handling and seeded variation.

## Milestone 04 --- Interaction and social behaviour

Add interactions, sparse relationships, meaningful memories and basic
social actions. Ensure events and relationships are generated from
actual simulation outcomes.

## Milestone 05 --- Inventory and basic economy

Add items, inventories, resource nodes, production, consumption and
simple trade. Establish ownership and economy invariants.

## Milestone 06 --- Durable world

Expand snapshots and durable events to cover implemented gameplay state.
Test recovery, migrations, backups and the selected offline progression
policy.

Persistence foundations should be introduced during Milestone 01; this
milestone completes the robust model rather than postponing all saving
until then.

## Milestone 07 --- Viewer participation

Add viewer identity, platform identity, character creation and Twitch
adapter. Add permissions, deduplication, rate limits, moderation and
viewer feedback.

## Milestone 08 --- World director and storytelling

Add significant-event detection, streamer interventions, notifications,
chronicle entries and camera focus. Ensure presentation is grounded in
recorded simulation events.

## Milestone 09 --- Society and world depth

Expand settlements, professions, factions, families, combat, wildlife,
weather and long-term economy as separate systems.

## Milestone 10 --- Production readiness and expanded presentation

Improve admin tools, stream presentation, operational monitoring,
moderation, backups, recovery and platform adapters for YouTube and
Kick.

## Milestone sequencing notes

The sequence is a planning guide, not a rigid dependency graph. Some
persistence, observability and testing work must begin early. Avoid
implementing advanced systems simply because they appear later in the
roadmap; validate the preceding gameplay loop first.
