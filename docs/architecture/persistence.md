# Persistence Architecture

**Status:** Active implementation — snapshot save/restore, retained log\
**Version:** 1.3

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
Rebuild history indexes from that snapshot
       |
Start simulation worker
       |
Publish ready state
```

The retained log is history. It is not replayed into world state. The
snapshot is the world. Events the live log has dropped are already in
`simulation_events` from the save that confirmed them, and inspection
reads that table beside the restored log.

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

## 9. Offline progression

**Decision (Milestone 06):** the world resumes at the saved tick. Time
the process was stopped is not simulated.

Needs, hunger, fatigue, pile returns, and camp visits do not advance
during downtime. A restart therefore cannot starve a character or mint
a stack of goods from visits that never ran. The simulation loop still
catches up a few ticks when a frame runs long. That bound covers a
running process, not hours the process was absent.

Fast-forward, a slower offline time scale, and a streamer's review of
events that happened while they were away are later time-scaling and
presentation work. They are not applied on startup.

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
-   **Schema:** `world_snapshots` holds the format version, tick,
    creation time and a JSON payload. `simulation_events` holds one JSON
    log event per id, and the participant and pair tables index that id.
    The schema version is stored in `PRAGMA user_version` and is 6. A
    database from a newer schema is refused. A version 1 database gains
    the event tables on open. A version 2 database gains `viewers`,
    version 3 gains `command_receipts`, version 5 gains
    `platform_identities`, and version 6 gains `moderation_actions`.
-   **Snapshot format:** `PersistedWorld` in `packages/shared`, version
    24: seed, tick, elapsed time, fixed timestep, the tile map, sparse
    inventories, resource piles, piles waiting to return, and every
    entity's stable ID, position, velocity, appearance (colour and a
    named sprite), character profile (name, attributes, personality,
    needs and lifecycle), age, the action they are committed to and how
    long they have held it, how long each action is cooling down, how
    the previous action ended (`completed`, `interrupted` or `failed`),
    and whether the character is resting,
    eating or drinking, and the viewer id when a viewer owns them. It is separate from the render-oriented
    `WorldSnapshot`, which carries position, appearance, inventory stacks,
    live resource piles, the resting / eating / drinking / working flags,
    and the lifecycle state, but not the action, age, velocity or the
    rest of the profile. Older snapshots are still accepted and
    upgraded on load. Version 1 gains the map generated from its seed.
    Version 2 gains each character's profile, also generated from the
    seed and the character's ID. Version 3 gains the resting flag, set
    when fatigue is already at the rest threshold. Version 4 replaces
    the numeric sprite, which was always 1, with a name from the sprite
    catalog, chosen from the seed and the character's ID. Version 5
    gains the eating and drinking flags, set when hunger or thirst is
    already at the threshold. Version 6 gains a seeded age, always
    short of the lifespan for that constitution. Version 7 gains the
    current action, taken from those flags, and an action time of zero.
    Version 8 gains a cooldown of zero for every action. Version 9 gains
    an empty outcome for the previous action.     Version 10 gains rock
    on grass tiles that nobody is standing on, taken from the world
    seed. Water and dirt stay where they are. Version 11 gains camps
    on the remaining grass that nobody is standing on, a work cooldown
    of zero, and a working flag that starts clear. Version 12 is that
    camp-and-work save. Version 13 gains a greet cooldown of zero, an
    empty action target, empty relationships and an empty character log.
    Version 14 gains an empty memory list. Version 15 gains a comfort
    cooldown of zero. Version 16 gains keep, confide and bluff
    cooldowns of zero. Version 17 gains an empty inventory list. Version
    18 gains a give cooldown of zero. Version 19 gains resource nodes
    from the map seed and a gather cooldown of zero. Version 20 gains
    a craft cooldown of zero. Version 21 gains a dine cooldown of zero.
    Version 22 gains a buy cooldown of zero. Version 23 gains an empty
    list of piles waiting to return. Version 24 gains `viewerId` on
    each character, null for an NPC. Version 25 gains `director`: when
    the world director last acted, when it last acted on each
    character, who has been urgently hungry with no food since when, and
    how much each character held when last cursed for hoarding. An older
    save starts with an empty director. Version 26 gains `profession` on
    each character, seeded from the world seed and the character's ID.
    The next save writes version 26.
    The map and the profile are stored rather than regenerated, so a
    later change to either generator cannot reshuffle an existing world.
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

The character log, memories, and relationships are part of that
snapshot. Live queries do not scan those lists. The simulation keeps a
participant index and a pair index, built when a record is written and
rebuilt when a snapshot is restored. Those indexes are not stored. The
log inside the snapshot is the newest 10,000 events.

The same events are retained in `simulation_events`. One row is the
event. `simulation_event_participants` and `simulation_event_pairs`
store ids that point at it, not a second copy of the payload. A save
inserts the snapshot log and any events the live log has dropped since
the previous save was confirmed. Inserts are ignored when the event id
is already stored. The table then keeps the newest 100,000 events
(`SIMSAND_LOG_RETENTION`). Character history reads that table and the
live log together, preferring the live copy of an id that is in both.
The database schema is version 6. Opening a version 1 database creates
the event tables and copies the log out of the snapshots already saved.
Version 2 creates `viewers`. Version 3 creates `command_receipts`, one
`CommandResult` per issuer and idempotency key for one day
(`SIMSAND_COMMAND_RECEIPT_MS`), not a character-log event. Version 5
creates `platform_identities`, mapping a platform user id to a viewer
row. Version 6 creates `moderation_actions`, an append-only audit of
ban and unban actions. The character's `viewerId` in the snapshot is the
world-side ownership link.
`WorldStore.backupTo` writes a consistent copy through SQLite's backup
API. To restore it, stop the server, replace the database file with the
copy, delete any `-wal` and `-shm` files beside that path, and start
the server again.

Not yet implemented: world IDs for more than one world, and scheduled
backups. A process that is killed without a signal loses up to one save
interval of progress, including log events that had not been confirmed.
Restart does not simulate the time the process was stopped.
