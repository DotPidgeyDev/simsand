# Persistence Architecture

**Status:** Active implementation — basic snapshot save/restore\
**Version:** 1.1

## 1. Purpose

Preserve the world across application restarts while keeping persistence
out of the simulation's per-tick hot path.

## 2. Initial technology

Use SQLite with WAL mode for the initial single-world implementation.

This is a pragmatic starting point for a single authoritative process
and modest initial population. Reconsider the database only when
measured requirements justify it.

## 3. Persistence principles

-   The simulation worker owns authoritative live state.
-   Persistence is coordinated through a clear boundary outside
    system-level tick processing.
-   Save consistent snapshots.
-   Record important durable domain events where they are needed for
    recovery or history.
-   Do not persist every movement update indefinitely.
-   Use stable persistent entity IDs.
-   Treat persistence failures as operational errors, not ignorable
    warnings.
-   Version snapshot and content formats.

## 4. Snapshot model

A snapshot is a consistent representation of the world at a particular
simulation tick.

Initial snapshot content:

-   World ID and schema/version metadata.
-   World seed and generation configuration.
-   Current simulation tick and simulation time.
-   Clock settings needed to resume.
-   Map and terrain state.
-   Entity stable IDs and relevant ECS component state.
-   Character identity, position and appearance.
-   Any domain stores required to reconstruct the captured state.

As systems are introduced, snapshots must expand to include their
authoritative state: inventories, needs, action state, structures,
resources, relationships and other data.

Do not serialize transient runtime handles as persistent identifiers.
Rebuild the mapping between stable IDs and ECS handles during
restoration.

## 5. Durable domain events

Persist selected events that matter for recovery, history or auditing.
Examples include:

-   Character created or permanently removed.
-   Item or currency transferred.
-   Structure founded or destroyed.
-   Faction created or dissolved.
-   Important streamer intervention.
-   Significant world-state change.

Do not persist high-frequency presentation deltas or every ordinary
movement tick.

An event record should include a stable event ID, event type, schema
version, simulation tick/time and payload.

## 6. Recovery model

``` text
Application starts
       |
Open database and validate schema
       |
Find latest valid snapshot
       |
Restore snapshot into simulation state
       |
Load durable events after snapshot
       |
Apply supported post-snapshot events
       |
Validate world invariants
       |
Start simulation worker
       |
Publish ready state
```

The exact replay strategy must remain limited to event types with
well-defined replay semantics. This is not a commitment to full event
sourcing.

If no valid snapshot exists, initialize a new world only when explicitly
configured to do so. Never silently replace a failed existing world with
an empty world.

## 7. Snapshot consistency

A snapshot must correspond to one coherent simulation point. The worker
should coordinate snapshot capture at a safe point between ticks or
through another explicit consistency mechanism.

The persistence layer should not independently read partially changing
ECS state.

For the initial implementation, a simple worker snapshot request can
produce a serialized immutable payload. The server then writes that
payload to SQLite.

## 8. Write strategy

Initial approach:

-   Save a baseline snapshot after world initialization.
-   Save periodically based on elapsed simulation ticks or wall-clock
    interval.
-   Save on controlled shutdown.
-   Persist selected durable events as they occur or in small batches.
-   Keep at least one previous valid snapshot until a newer snapshot is
    committed successfully.

Exact cadence should be configurable and tuned after measuring
serialization and write cost.

## 9. Offline progression: unresolved decision

The world may be continuous, paused or run at reduced speed while the
stream/application is offline. This is not yet settled.

The current tentative preference is continuous progression with
adjustable time scale and potentially reduced simulation detail while
offline.

Until this is decided, the implementation resumes at the saved tick
with no catch-up: time the process was stopped is not simulated.

Before implementing offline progression, decide:

-   Whether simulation advances while the process is stopped.
-   Whether elapsed wall time is converted into catch-up simulation
    time.
-   Whether needs, hunger and production advance during downtime.
-   How catch-up is bounded to prevent sudden starvation or runaway
    production.
-   Whether offline simulation uses simplified aggregate updates.
-   How the streamer can inspect events that occurred while away.

Do not implement naive wall-clock catch-up that causes characters to
starve instantly after a long restart.

## 10. Schema and content versioning

Store explicit versions for:

-   Database schema.
-   Snapshot format.
-   Durable event payloads.
-   Content definitions where existing world instances depend on them.

Migrations should be tested against representative saved worlds. Content
definition changes must not silently reinterpret existing item or entity
instances.

## 11. Failure handling and operations

-   Surface database open, read and write errors.
-   Do not acknowledge a durable operation before its required
    persistence policy is satisfied.
-   Define what happens if a snapshot write fails.
-   Use transactions for logically related writes.
-   Keep backups and test restoration.
-   Handle graceful shutdown with a bounded save attempt.
-   Monitor snapshot duration, database size and recovery duration.

## 12. Initial scope

For the first vertical slice, persist world metadata, seed, tick and
basic entity positions. Add the complete snapshot and durable-event
model incrementally as simulation systems become real.

## 13. Current implementation

**Status: Implemented — basic snapshot save/restore**

-   **Storage:** Node's built-in `node:sqlite` module, so there is no
    native dependency to build. It logs an `ExperimentalWarning` at
    startup. The database is `apps/server/data/simsand.sqlite` (git
    ignored), overridable with `SIMSAND_DB_PATH`. It runs in WAL mode.
-   **Schema:** a single `world_snapshots` table holding the format
    version, tick, creation time and a JSON payload. The schema version
    is stored in `PRAGMA user_version`. A database from a newer schema
    is refused.
-   **Snapshot format:** `PersistedWorld` in `packages/shared`, version
    5: seed, tick, elapsed time, fixed timestep, the tile map and every
    entity's stable ID, position, velocity, appearance (colour and a
    named sprite), character profile (name, attributes, personality,
    needs and lifecycle) and whether the character is resting. It is
    separate from the render-oriented `WorldSnapshot`, which carries
    position, appearance and the resting flag, but not the rest of the
    profile or velocity. Older snapshots are still accepted and
    upgraded on load. Version 1 gains the map generated from its seed.
    Version 2 gains each character's profile, also generated from the
    seed and the character's ID. Version 3 gains the resting flag, set
    when fatigue is already at the rest threshold. Version 4 replaces
    the numeric sprite, which was always 1, with a name from the sprite
    catalog, chosen from the seed and the character's ID. The next save
    writes version 5.
    The map and the profile are stored rather than regenerated, so a
    later change to either generator cannot alter an existing world.
-   **Capture:** the server sends `world.persist.request`; the worker
    answers between ticks with a consistent `PersistedWorld`. The server
    then writes it. The request times out after 2 seconds.
-   **Write strategy:** a baseline save once the world is ready, a save
    every 30 seconds (`SIMSAND_SAVE_INTERVAL_MS`), and a save on SIGINT
    or SIGTERM before the process exits. Each save is one transaction
    that also prunes all but the two newest snapshots. Save failures
    are logged as errors.
-   **Recovery:** on startup the server loads the newest snapshot that
    parses and validates, skipping and logging invalid ones. The worker
    rebuilds the ECS world and the stable-ID map from it. A new world is
    created only when no snapshot has ever been saved. If snapshots
    exist but none are valid, startup fails rather than replacing the
    world.

Not yet implemented: durable domain events, world IDs for more than one
world, backups, and migrations beyond the initial schema. A process that
is killed without a signal loses up to one save interval of progress.
