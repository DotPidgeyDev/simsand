# Simulation Architecture

**Status:** Foundational draft\
**Version:** 1.0

## 1. Purpose

The simulation is the authoritative model of the world. It owns gameplay
state, decides what characters and other entities do, and applies all
consequential changes. Rendering, chat integrations and administration
are clients of this model.

## 2. Execution model

Use one dedicated Node.js `worker_thread` as the authoritative
simulation process initially.

The worker owns:

-   ECS world and entity/component state.
-   Simulation clock and tick counter.
-   System registry and execution order.
-   Deterministic random-number generator state.
-   World map and simulation-domain stores.
-   Command processing and validation.
-   Domain-event production.

The main application process owns HTTP, WebSockets, platform
integrations and worker lifecycle. It must not maintain a second
authoritative copy of gameplay state.

## 3. ECS model

### Entities

Entities are runtime identities to which components are attached. ECS
entity handles may be recycled or differ after a restart. They must not
be used as persistent public identifiers.

Every persistent entity receives a stable domain ID, such as a UUID or
another collision-resistant identifier. Maintain an explicit mapping
between stable IDs and runtime ECS handles.

### Components

Components are small data structures describing state. Initial
components:

-   `Identity`: stable ID and entity kind.
-   `Position`: world coordinates.
-   `Velocity`: movement vector.
-   `Appearance`: sprite or appearance definition reference.

Later components may include needs, attributes, skills, inventory
references, action state, health, relationships and faction affiliation.

### Systems

Systems process entities with relevant component combinations. Examples:

-   Movement system.
-   Needs system.
-   Utility evaluation system.
-   Action execution system.
-   Combat system.
-   Economy system.

Systems should have explicit responsibilities and predictable execution
order.

### Domain stores alongside ECS

Not every concept needs to be represented as a frequently iterated ECS
component. Sparse or graph-shaped data such as family trees, memories,
detailed relationship records and historical records can live in domain
stores keyed by stable entity ID.

Keep the boundary explicit and ensure snapshots include both ECS state
and associated domain stores.

## 4. ECS library abstraction

bitECS is the initial candidate. Hide it behind small internal
interfaces for operations the project actually needs:

-   Create and destroy runtime entities.
-   Add, remove and access components.
-   Query entities.
-   Resolve stable IDs.
-   Iterate entities for system processing.

Do not build a generic ECS framework. The abstraction exists to avoid
coupling domain code to a library's API and to make replacement possible
if profiling or implementation experience justifies it.

## 5. Fixed-timestep clock

Initial target: one simulation tick every 100 ms (10 ticks per second).

The clock tracks at least:

-   `currentTick`
-   `simulationTime`
-   `fixedDeltaMs`
-   `timeScale`
-   `paused`

Use a fixed simulation delta for system updates. Wall-clock scheduling
may drift or be delayed under load; the simulation tick count is the
authoritative measure of simulated progression.

The initial implementation needs only start, pause and resume. Avoid
building a complex general-purpose scheduler before there are real use
cases.

### Time concepts

Keep these concepts distinct:

-   **Wall-clock time:** actual elapsed real-world time.
-   **Simulation time:** time experienced by the world.
-   **Tick:** one discrete simulation update.
-   **Stream time:** time at which an event is shown to the audience.

Offline progression and catch-up behaviour remain open decisions and
must be settled before implementing substantial offline simulation.

## 6. System scheduling and ordering

Systems run in an explicit, documented order. The initial schedule can
be small:

1.  Apply queued commands.
2.  Update movement.
3.  Enforce world bounds.
4.  Produce required state deltas.
5.  Publish transient updates and accumulated domain events.

Later systems should be placed deliberately according to dependencies.
For example, an action may consume an item, while an economy system
later updates stockpiles. Do not rely on incidental module import order.

A system should not perform network I/O or block on database operations
in the tick loop.

## 7. Determinism and randomness

Use a seeded pseudo-random number generator rather than untracked calls
to global randomness in simulation logic.

-   Store the world seed.
-   Keep random state or a reproducible random-stream strategy.
-   Make character and world generation reproducible from known inputs.
-   Avoid hidden sources of nondeterminism in simulation decisions.
-   Record externally submitted commands and their processing order if
    replay is later required.

The initial goal is reproducible generation and easier debugging, not a
guarantee of bit-for-bit deterministic replay across all future runtime
versions.

## 8. Commands and state authority

External callers submit typed commands. The worker validates the request
against current authoritative state and either rejects it with a reason
or applies it.

A request to move a character, for example, does not mean the character
moved. The simulation may reject it because the character is dead, busy,
unable to reach the destination or not permitted to perform the action.

Only the worker changes authoritative state.

## 9. Updates and snapshots

The worker should publish:

-   An initial full snapshot when requested.
-   Incremental deltas for changed state.
-   Important domain events.
-   Errors and lifecycle messages.

Do not broadcast a full world snapshot on every tick. Track changes and
send compact deltas at an appropriate cadence.

The server may distribute these updates to clients, but it must not
reinterpret them as authority to modify world state.

## 10. Failure handling

-   Worker startup failure must be reported to the application.
-   Worker runtime errors must be surfaced and logged with context.
-   The server must stop accepting commands when the worker is
    unavailable.
-   Do not silently restart a worker with an empty world.
-   Recovery must load a valid snapshot and required durable events
    before simulation resumes.
-   Persistence errors must not be swallowed.

## 11. Initial testing

Test the simulation without starting a browser or server:

-   Seeded entity generation.
-   Fixed clock progression.
-   Pause and resume.
-   Movement and world bounds.
-   Stable-ID mapping.
-   System ordering.
-   Command validation.
-   Snapshot serialization and restoration.
-   Invariants such as valid positions and unique persistent IDs.

Add a headless test with 1,000 entities before optimizing.
