# Implementation Roadmap

**Status:** Active — Milestone 09  
**Version:** 1.17  
**Last updated:** 2026-11-27

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
- A seeded 64 × 64 tile map of grass, dirt, water, rock and camp, sent in snapshots and saved with the world.
- SQLite snapshot persistence with periodic and shutdown saves.
- A validated command contract (character create and remove) that produces domain events.
- Timestamped server logging with a status line every minute and a warning when ticks are dropped.
- A read-only inspection API on `127.0.0.1:8767` for status, the entity list and individual entities.
- An end-to-end test that runs the real server with no browser, connects and disconnects a client, and confirms the simulation keeps advancing.

### Carried forward

These were deliberately left out of Milestone 01:

- A public entry point for commands, rate limits and deduplication (Milestone 07).
- Durable storage of the simulation log (Milestone 06). Command receipts (`character.created`, `character.removed`) are still only returned on the command result.
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

**Status: Complete**

Add character identity, appearance references, attributes, personality, needs and basic lifecycle.

Establish data ownership and validation before building complex AI.

### Current implementation

A character now has a profile stored on its entity and saved with the world:

- A seeded name, from the world seed and the character's stable ID.
- Seven attributes, integers from 1 to 10.
- Ten personality traits, each from 0 to 1.
- Three basic needs (hunger, thirst and fatigue), from 0 (satisfied) to 1 (critical). New characters start comfortable.
- A lifecycle state, `alive` or `dead`. Dead characters stay in the world but do not move, eat, drink or age.

The profile is generated inside the simulation, validated when a character is created or a save is loaded, and returned by the inspection API. Version 2 saves gain profiles on load, generated from the seed, and the next save stores them.

Fatigue rises while a character moves and falls while they rest. Constitution is the first derived statistic: it sets the fatigue rate, which inspection reports. A character rests at fatigue 0.8 and starts moving again at 0.3, shown as a circle. Hunger and thirst rise the same way, and the world feeds and waters a character once a need reaches 0.8, until it falls to 0.3. They stop while eating or drinking, drawn with a ring. The resting, eating and drinking flags are saved, because the same need value occurs on the way up and the way down. Seeking water, land and a camp, and choosing among the needs, is Milestone 03.

A character's age increases while they are alive. Constitution sets the lifespan: 6 hours for each point, so constitution 1 lives 6 hours and constitution 10 lives 60 hours. `SIMSAND_LIFESPAN_PER_CONSTITUTION_SECONDS` changes that length, and the hunger, thirst and fatigue speeds have matching variables in the same place. A new character's starting age is seeded, on its own stream, and is always short of the lifespan. Reaching the lifespan sets them to dead and clears rest, eating, drinking and working. The client draws a dead character as an X. Older saves gain a seeded age on load. Nothing replaces a character who has died. The current save format is version 12, described under Milestone 03.

Appearance stores a named sprite from a small catalog (`wanderer`, `scout`, `elder`), chosen from the world seed and the character's ID on a stream that does not change the profile. The renderer draws them as a square, a diamond and a triangle. A resting character is still a circle, so the state stays readable. Older saves stored a numeric sprite that was always 1; loading one assigns the seeded name.

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
- [x] The simulation itself changes lifecycle state. A character dies on reaching the lifespan their constitution sets.
- [x] Character creation fills in a valid profile.
- [x] Character data is validated at creation and when a save is loaded.
- [x] Inspection shows a character's full profile.

---

## Milestone 03 — Autonomous behaviour

**Status: Complete**

Implement a small utility-based action system with a few actions such as idle, move, eat, rest and work.

### Current implementation

A living character chooses one action: `idle`, `move`, `eat`, `rest`, `drink` or `work`. Each is a definition giving its score, when it can be chosen, how long it continues, and the flag it sets. Eat, drink and rest also say when that need is urgent. The score for eat, rest and drink is that need. Work scores industriousness times the comfort that is left once every need is quiet, and it can be chosen only while standing on a camp. Idle and move share that same comfort, split by curiosity, so an incurious character stands and a curious one walks. Ties go to eat, then drink, then rest, then work, then move. The choice is kept for at least 5 seconds, and a meal, drink or rest continues until that need falls to 0.3. A visit at a camp ends as soon as any need rises past 0.3, and that ending is a completion, so the visit can start again once the need is quiet. A need at 0.8 interrupts immediately, and the action it cuts off cannot be chosen again for 20 seconds. Finishing a meal, drink, rest or visit does not start that cooldown. Only one of those recoveries happens at a time. The needs system applies the rates and no longer starts or stops the choice. Work does not change those rates. Each character also carries a stable bias of at most 0.05 on every score, taken from the world seed and their id, so two characters with the same needs can choose differently. A pressing need still outranks that bias. A meal, drink or rest can only be chosen while that need is still above 0.3, so the bias cannot start a recovery the character would not keep. Drink also requires standing on water. A meal or a rest happens on land, so neither can start in the water, and one already underway there ends immediately as a failure. While thirst is above 0.3 a living character will not idle when a water route exists: on dry ground they walk toward the nearest water, and in the water they can drink. Once thirst is back to 0.3 they walk toward the nearest land instead of standing in it. While every need is at or below 0.3, a camp route exists, and work outranks idle and move, they walk to the nearest camp and work there. A lazy incurious character stands instead, and a lazy curious one keeps walking. All three targets come from one route built for the map. The route walks around rock, and a step onto rock turns back. A map with no way through does not start that walk, and records the drink as failed. Thirst at 0.8 interrupts only when that drink is possible, and hunger or fatigue at 0.8 interrupts only on land. Idle stays available on land when they are not thirsty and have no camp to reach, and after death. Finishing an action records that it completed. An interruption records that it was interrupted, which is what starts the cooldown. A meal or rest that cannot continue where they stand, and a drink, meal or rest they would take but have no route to start, are recorded as failed and do not start that cooldown. Inspection shows the action, the biased scores, which actions are available, any cooldowns, and how the previous action ended. The bias is derived, not saved. The choice, the working flag and the outcome are saved (format version 12). A version 11 save gains camps on grass that nobody is standing on, a work cooldown of zero, and a clear working flag, and keeps its water, dirt and rock. A version 10 save gains rock on grass that nobody is standing on. A version 9 save has no outcome yet. A version 7 save takes the action that matches its flags, preferring whichever need is higher when more than one flag is set. What that visit yields is Milestone 05.

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

Closing this milestone defers the eight unread personality traits.
Sociability, empathy, loyalty and honesty wait for Milestone 04.
Aggression and courage wait for conflict, greed for Milestone 05,
ambition for goals. They stay stored stubs.

Regression for this cycle is in
`packages/simulation/src/regression.test.ts`. Notes for Milestone 04
are in `docs/roadmap/notes/04-from-03.md`. How to close a milestone is
in `docs/roadmap/closeout.md`.

### Definition of done

- [x] Characters choose among idle, move, eat, rest, drink and work.
- [x] Action definitions own score, prerequisites, duration and flags.
- [x] A choice is kept, and an urgent need can interrupt it.
- [x] Interrupted actions cool down; finished recoveries do not.
- [x] An action that cannot continue or cannot start is recorded as failed.
- [x] Seeded bias breaks ties between similar characters.
- [x] Needs and curiosity and industriousness drive the choice.
- [x] Inspection shows scores, availability, cooldowns and the last ending.

### Later, outside this milestone

The route is one shared field, and grass, dirt, water and camp cost the same number of steps. A later pathing pass can give a tile a higher cost, drink from the shore instead of standing in the water, refuse a walk that is too long, step around other people, aim at a private place, give a different body its own route, and hide a place a character has not seen. Seeking a person or a stack, and following a target that moves, is Milestone 09. The field today seeks water, land, camps, and piles.

What a visit produces, and anything a character can carry or trade, is Milestone 05. Relationships and memories arrived in Milestone 04.

---

## Milestone 04 — Interaction and social behaviour

**Status: Complete**

Add interactions, sparse relationships, meaningful memories and basic social actions.

This is also the first log/monitor pass: a queryable, character-indexed
history for debugging. Viewer-facing history comes later and is only a
window over the same records.

Start from `docs/roadmap/notes/04-from-03.md`. Social actions should
join the existing action list. Do not add a fourth need until a
preference among idle, move and a social action is not enough.

Initial scope:

- Character-to-character interactions.
- Relationship data and relationship changes.
- Social action selection.
- Memory creation and retrieval.
- Interaction outcomes.
- Social needs and motivations.
- Event generation from actual simulation outcomes.
- Read sociability, empathy, loyalty and honesty when those actions exist.
- Centralised simulation event log, indexed by participant, not duplicated per participant.
- Character-level history inspection (what happened, which actions and events involved this character).

Ensure events and relationships are generated from authoritative simulation outcomes rather than presentation-layer assumptions.

### Character history and log shape

Inspection today shows current state and the last action ending. That is
not enough once two characters can interact. Milestone 04 should emit a
single append-only log of simulation facts that can be filtered to one
character.

Keep three consumers on one record, not three parallel logs:

- **Debug history** (this milestone): every consequential action ending
  and interaction, enough to answer why a character did what they did.
- **Durable events** (Milestone 06): the same records persisted with
  retention, not a rewritten schema.
- **Viewer chronicle** (Milestone 08): a scored, filtered window for
  stream presentation and a character's public story. It must not be
  the only place history exists.

Avoid log bloat:

- One world fact is one event. An interaction between A and B has both
  as participants. Character history is a query over participants, not
  a copy written onto A and another onto B.
- Do not log both "A greeted B" and "B was greeted by A".
- Do not log every tick of proximity, utility scoring, or movement.
  Record action lifecycle endings (`completed`, `interrupted`,
  `failed`) and consequential interactions, matching the memory rule
  already in the Milestone 04 notes.
- Prefer stable event IDs, tick/time, type, participant IDs, location,
  and a small payload. Inspection lists events for one character in
  time order.

Memories stay a character's in-world recollection of selected events.
They are not a substitute for the log, and they should reference the
event rather than restating it.

### Current implementation

The first increment is in the world:

- `greet` is appended to `ACTION_IDS`. It scores `sociability * comfort`,
  is only ready while needs are quiet and another living character is on
  the same or neighbouring tile, and uses the same commitment and
  endings as the other actions. Alone they idle or move; a failed greet
  is only recorded when an in-progress greeting loses its target.
- Completing a greet writes one sparse relationship keyed by the two
  stable IDs and one `character.greeted` log event with both as
  participants. If both greet each other in the same tick, that is still
  one event and one meeting.
- The log also records failed and interrupted actions, and completed
  eat, drink, rest, work, greet, comfort, keep, confide and bluff. Idle and move completions are not
  stored. The in-memory log keeps the newest 10,000 events.
- Inspection shows relationships on the character and lists that
  character's events at `GET /entities/:id/history`.
- The first completed greet also writes one `greeting` memory that
  points at that log event. Both participants see the same memory.
  Later meetings update the relationship and log; they do not add
  another greeting memory.
- `comfort` is the second social action. It scores `empathy * comfort`
  and can start only while the actor's own needs are quiet and a living
  neighbour's hunger, thirst or fatigue is above 0.3. The target is the
  neighbour with the highest of those needs. Ties keep the lowest stable
  ID. The visit continues until that need falls to 0.3 or the actor's
  own needs rise past 0.3, and it fails if the neighbour leaves. An
  equal score with greet comforts the person in need. A less empathetic
  character still greets them.
- Completing a comfort writes one `character.comforted` log event with
  both participants, and counts as a meeting on the same relationship.
  The first comfort between a pair also writes one `comforting` memory
  that points at that event. A later comfort does not add another.
- `keep` reads loyalty. It can start only while the actor's own needs
  are quiet and a living neighbour has already met them. The target is
  the known neighbour with the lowest stable ID. The visit continues
  while that neighbour stays adjacent and the actor's needs stay quiet,
  and it fails if the neighbour leaves. A stranger is still greeted.
  An equal score with greet keeps the known person. Comfort still wins
  when that person is in need and empathy scores at least as high.
- Completing a keep writes one `character.kept` log event with both
  participants, and counts as a meeting on the same relationship. The
  first keep between a pair also writes one `keeping` memory. A later
  keep does not add another.
- `confide` scores `honesty * comfort` and `bluff` scores
  `(1 - honesty) * comfort`. Either can start only beside someone
  already met, while the actor's own needs are quiet, and each ends
  after the usual commitment unless the neighbour leaves. Confide
  reports the speaker's hunger, thirst and fatigue. Bluff reports every
  need tied for the highest as 0 and leaves the others unchanged. The
  listener's needs do not change. The first of each kind is one shared
  memory, `confiding` or `bluffing`.
- Saves are format version 16: keep, confide and bluff cooldowns,
  `actionTarget`, `relationships`, `log` and `memories`. A version 15
  save gains those three cooldowns at zero. A version 14 save gains a
  comfort cooldown of zero. Older saves gain empty collections.

Closing this milestone defers a belonging need. It waits until idle,
move, greet, comfort, keep, confide, and bluff are not enough, and it
belongs with later social depth (Milestone 09), not with inventory.
Memories and the character log stay a world-level list plus a linear
query until Milestone 06 indexes them.

Regression for this cycle is in
`packages/simulation/src/regression.test.ts`. Notes for Milestone 05
are in `docs/roadmap/notes/05-from-04.md`. How to close a milestone is
in `docs/roadmap/closeout.md`.

### Definition of done

- [x] Characters greet, comfort, keep, confide, and bluff from the same action list.
- [x] Sociability, empathy, loyalty, and honesty are read by those actions.
- [x] A completed social action updates one relationship and writes one log event for the pair.
- [x] The first of each kind is one shared memory pointing at that event.
- [x] A bluff understates the speaker's needs in the event and leaves the world unchanged.
- [x] Inspection lists one character's events from the shared log.

### Later, outside this milestone

A belonging need is not part of this cycle. Indexing the log, memories,
and relationships arrived in Milestone 06. A viewer-facing
chronicle over the same log is Milestone 08.

---

## Milestone 05 — Inventory and basic economy

**Status: Complete**

Add items, inventories, resource nodes, production, consumption and simple trade.

Start from `docs/roadmap/notes/05-from-04.md`. The first item is what a
completed camp visit yields.

### Current implementation

A completed camp visit adds one `goods` to a sparse inventory keyed by
the worker's stable ID. A second visit stacks on that same record.
An interrupted visit adds nothing. Inspection lists the stacks.
Removing a character drops their record.

`give` hands one goods to a neighbour they have already met. Greed
scores against that gift, so a greedy character keeps the stack. The
transfer is one `item.transferred` log event with both participants,
the item and the quantity, and the first gift between a pair is one
`giving` memory. It does not count as another meeting.

Grass tiles can hold a finite pile of `material`. `gather` takes one
when a visit on that tile ends, the same way a camp visit yields goods.
An empty pile fails the visit and adds nothing. The same tile returns
to stock 3 after 90 seconds, which is longer than the 75 seconds hunger
takes to rise from satisfied to the quiet line. Until then it is not a
pile and not a place to walk. An industrious character
walks to the nearer of a camp and a pile; a tie keeps the camp. Holding
material at a camp crafts one food and spends one material. The visit
with no input still yields goods. One food brings hunger down to the
quiet line. The meal with no food is unchanged. A greedy character
beside someone they have met pays two goods for one food. The purchase
is one `item.traded` event, and the first between a pair is one
`trading` memory. It does not count as another meeting. A stack or a
pile quantity is a positive integer, and an empty holder or pile is
absent. Work creates one goods. Gather moves one material from the pile
into the hand. Craft turns one material into one food. Dine spends one
food. Give moves goods. Buy moves food and goods and creates neither.
Saves are format version 23. A version 22 save gains an empty list of
piles waiting to return. A version 21 save gains a buy cooldown of
zero.

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

Greed is read by `give` and by `buy`. The price of food is two goods.
A depleted pile returns to stock 3 on the same tile after 90 seconds.
The camp visit with empty hands and the meal with no food both stay.
Basic trade stays beside someone already met. A route to a person or a
stack, and a declared preference when two jobs share a score, are
Milestone 09. Death already leaves a holder's stacks on the corpse.
Removing the character deletes them. What those stacks do on the day
someone dies is Milestone 09.

Regression for this cycle is in
`packages/simulation/src/regression.test.ts`. Notes for Milestone 06
are in `docs/roadmap/notes/06-from-05.md`. How to close a milestone is
in `docs/roadmap/closeout.md`.

### Definition of done

- [x] Goods, material, and food are the item catalog, held in a sparse inventory.
- [x] A camp visit with empty hands yields one goods. Holding material there crafts one food.
- [x] Gathering takes one material from the pile underfoot, and an industrious character walks to the nearer of a camp and a pile.
- [x] One food brings hunger down to the quiet line. A meal with no food is unchanged.
- [x] A generous character gives one goods. A greedy character pays two goods for one food from someone already met.
- [x] A depleted pile is absent until 90 seconds have passed, then the same tile holds stock 3.
- [x] Completed actions create one goods, spend one food, or move what they name, and the checker reports an empty holder, a non-positive quantity, or a pile on the wrong tile.

### Later, outside this milestone

Showing stacks and piles on the map snapshot is Milestone 08. A route
to a person or a stack, a dead holder's stacks, and a declared job
preference are Milestone 09. Indexing the log, memories, and
relationships arrived in Milestone 06.

---

## Milestone 06 — Durable world

**Status: Complete**

Start from `docs/roadmap/notes/06-from-05.md`.

### Current implementation

The log, memories, and relationships stay one record per fact. Reading
them no longer walks the whole list. Each event is filed under its
participants and, when it has two, under the pair, at the moment it is
written. The oldest events leave those indexes when the log drops them
at 10,000. A memory is filed under its participants and under its kind
and pair, which is how a second meeting finds the first memory. A
relationship is filed under both characters when it is created. The
indexes are derived. A save is still format version 23, and loading one
rebuilds them. Inspection and the same-tick pair check read the indexes.

The same log is stored in SQLite, one row per event. Participant and
pair rows point at that row. A save writes the live log and any events
the live log has dropped since the previous confirmed save. The store
keeps the newest 100,000 events (`SIMSAND_LOG_RETENTION`). Character
history is those rows plus anything still only in the live log. The
database schema is version 2. A version 1 database gains the event
tables on open and copies the log out of the snapshots it already holds.
`backupTo` writes a consistent copy. Restoring it means replacing the
database file while the server is stopped, and removing any `-wal` and
`-shm` files beside that path.

Restart resumes at the saved tick. Time the process was stopped is not
simulated, so a restart does not age needs or complete camp visits.
The running loop still catches up a few ticks when a frame runs long.

Regression for this cycle is in
`packages/simulation/src/regression.test.ts`. The retained log, the
schema migration, and backup are covered in
`apps/server/src/world-store.test.ts`. Notes for Milestone 07 are in
`docs/roadmap/notes/07-from-06.md`. How to close a milestone is in
`docs/roadmap/closeout.md`.

Initial scope:

- Complete world snapshot model.
- Persistence of implemented character and world state.
- Durable event storage where appropriate (the Milestone 04 log, retained and recovered, not a second event model).
- Indexed query of that log, memories and relationships by participant and by pair. Keep one record per fact; do not persist a copy on each character. Replace the Milestone 04 linear scans before the tick or inspection has to walk the whole list.
- Recovery and restart behaviour.
- Database migrations.
- Backup and restore procedures.
- Persistence validation.
- Offline progression policy.
- Recovery testing.

Persistence foundations should be introduced during Milestone 01. This milestone completes the robust persistence model rather than postponing all saving until later.

The persistence strategy should reflect the actual simulation requirements. Avoid storing every transient state change as a permanent event. Character history and memory queries should read this store through participant and pair indexes, the way relationships are already keyed, not by scanning an array or duplicating rows per character.

### Definition of done

- [x] The log, memories, and relationships are read by participant, and the log and memories by pair, from indexes built when the record is written.
- [x] One fact stays one record. A save does not copy it onto each character.
- [x] Restoring a save rebuilds those indexes.
- [x] The same log is retained in SQLite past the live cap, up to the newest 100,000 events.
- [x] An event the live log drops is stored on the next confirmed save.
- [x] A version 1 database gains the event tables on open.
- [x] A backup opens as its own database and returns the saved world and log.
- [x] A restart resumes at the saved tick. Time the process was stopped is not simulated.

### Later, outside this milestone

Scheduled backups are Milestone 10. A viewer-facing chronicle over this
log is Milestone 08. Command receipts for idempotency arrived in
Milestone 07. More than one world id is not part of this cycle.

---

## Milestone 07 — Viewer participation

**Status: Complete**

Start from `docs/roadmap/notes/07-from-06.md`.

Add viewer identity, platform identity, character creation and Twitch integration.

### Current implementation

A viewer is a row in the same SQLite database: a server-issued id, a
display name, and `active` or `banned`. The database schema is version
6. A version 2 database gains `viewers`, version 3 gains
`command_receipts`, version 5 gains `platform_identities`, and version
6 gains `moderation_actions`. The id is not a platform user id, and a
request cannot choose it or its role.

`POST /viewers` and `POST /viewers/:id/commands` listen on
`127.0.0.1:8768` (`SIMSAND_COMMAND_PORT`). The command body is the
existing gateway request. The server sets the issuer. Viewers may send
`character.create` and nothing else. An optional `idempotencyKey`
remembers the result for one day. Each issuer may submit 10 new
commands per minute. A remembered retry does not count.

The character is an ordinary world character. Its stable id is the
world's id, not the viewer id. Saves are format version 24 and store
`viewerId`. A second create is `viewer_has_character`, including after
death. `character.created` stays on the command result.

Twitch chat enters through IRC when the three `SIMSAND_TWITCH_*`
variables are set, or through `POST /platform/chat`. A platform user id
maps to one viewer. `!join <characterId> <x> <y>` becomes
`character.create`. Outcomes get a short `@user` reply in chat and as
`feedback` on the local route.

Local moderation bans a viewer or platform account without removing the
character or erasing history. An unknown platform ban creates a stub
banned viewer so later chat cannot mint a new one.

Regression for this cycle is in
`packages/simulation/src/regression.test.ts`. Command routes, receipts,
bans, Twitch parse, and feedback are covered under `apps/server/src/`.
Notes for Milestone 08 are in `docs/roadmap/notes/08-from-07.md`. How
to close a milestone is in `docs/roadmap/closeout.md`.

### Definition of done

- [x] Viewers have server-issued ids separate from platform user ids and character ids.
- [x] One viewer owns at most one character; death does not free the slot.
- [x] Viewer create goes through the existing command gateway; the request cannot name its issuer.
- [x] Twitch accounts map to viewers; normalized chat can submit `!join`.
- [x] Commands can be deduplicated and rate-limited without writing into the character log.
- [x] Ban and unban refuse later commands and leave the character in the world.
- [x] Chat outcomes produce safe viewer-facing feedback.
- [x] Ownership survives save and restore (format version 24).

### Later, outside this milestone

Deeper moderation tools, appeals, trusted-viewer roles, a public
authenticated command API, and YouTube or Kick adapters are Milestone
10. A viewer-facing chronicle over the character log is Milestone 08.

---

## Milestone 08 — World director and storytelling

**Status: Complete**

Start from `docs/roadmap/notes/08-from-07.md`.

Add significant-event detection, streamer interventions, notifications, chronicle entries and camera focus.

### Current implementation

Completed greetings, comfort, keep, confide, bluff, gifts, and trades
score into chronicle entries over the existing log.
`inspectCharacterChronicle` and `GET /entities/:id/chronicle` expose
that window. Ordinary action endings stay out.

The render snapshot carries each character's inventory stacks and the
live resource piles. Deltas include inventory changes and replace the
pile list when it changes. The browser draws piles on the map. Save
format is unchanged.

The worker scores new log events every 200 ms and sends them as
`world.chronicle`. The server keeps the newest 50 feed-tier entries,
sends them to a browser that connects, and lists them at
`GET /chronicle`. The browser shows a recent-events feed and pulses a
ring around the characters in a significant entry. Presentation tiers
are shared: notable feeds, significant notifies, dramatic focuses the
camera.

Log events are a union keyed by type: action events keep their payload,
and intervention events carry their own. Streamers bless, curse, place a
bounty, or gift through `POST /streamer/commands`, each with a 30-second
cooldown per issuer in the gateway. Each intervention is one log fact
naming the command and issuer. Blessings and curses are dramatic, so the
browser zooms toward them for a few seconds; bounties and gifts are
significant. Save format is unchanged.

The browser has a first streamer panel beside the feed: pick a character
from the list or by clicking near them, then bless, curse, or gift; arm
a bounty and click a pile or a grass tile. The Vite dev server proxies
`/streamer/commands` to the command server, which stays on localhost
with no CORS.

The world director runs inside the simulation every 5 simulated
seconds and issues the same intervention commands as `system`
(`world-director`), each with a reason that the log and the chronicle
summary carry. It reacts to recorded state, in priority order:

- Mercy: food for a character urgently hungry with no food for a
  minute, with nobody within 8 tiles holding any.
- Scarcity: when fewer than half the pile sites hold a pile, the site
  that would wait longest comes back early.
- Kindness: a blessing after 3 comforts, keeps, or gifts within 5
  minutes.
- Hubris: a fatigue curse for whoever holds at least 12 items and 3×
  everyone else's average, and again only once their hoard grows.

It acts at most once a minute, and on one character at most once in 5
minutes. Its memory is saved (format version 25). `SIMSAND_DIRECTOR=off`
disables it, `SIMSAND_DIRECTOR_RULES` keeps only the rules it lists,
and every number above has a `SIMSAND_DIRECTOR_*` override read at
startup (see the README). The settings are server config, not part of
the save. A two-hour soak of 20 characters gave one blessing and one
curse, with no economy violations.

Death is the first world event the simulation records on its own. When
a character reaches their lifespan, the lifecycle system writes one
`character.died` fact naming them, the cause (`old_age`), and their
age. It is a third kind of log event, beside action endings and
interventions. The chronicle scores it dramatic, so the feed says
"…died of old age" and the camera turns to where they fell.

A bounty on bare grass now starts a new pile site. When that pile runs
out it returns on its tile like a generated one. The site is saved as
that pile or its return entry, so the save format stays at version 25.
Other terrain is still refused.

Quests and special encounters moved to Milestone 09.

Regression for this cycle is in
`packages/simulation/src/regression.test.ts`. Notes for Milestone 09
are in `docs/roadmap/notes/09-from-08.md`. How to close a milestone is
in `docs/roadmap/closeout.md`.

Ensure presentation is grounded in recorded simulation events. The director should react to the world rather than dictate ordinary character behaviour.

Chronicle entries, recaps and a viewer's character history are a small
window over the Milestone 04 log: scored, abbreviated, and safe to show
on stream. Debugging still uses the full participant-indexed history.

### Definition of done

- [x] Completed social and economy log events score into chronicle entries that point at the source event. Ordinary action endings stay out.
- [x] Presentation tiers are one shared rule: notable feeds, significant notifies, dramatic takes camera focus.
- [x] New chronicle entries reach the browser live, and a browser that connects receives the newest 50.
- [x] Inventories and piles are on the render snapshot without a save format change.
- [x] Streamers bless, curse, place a bounty, or gift through the command gateway, with a cooldown per issuer. Each applied intervention is one log fact naming the command and issuer.
- [x] The world director reacts to recorded state, issues the same interventions as `system` with a reason, and its memory survives save and restore.
- [x] At least one world event beyond the four interventions comes from the simulation itself and reaches the chronicle.
- [x] Quests and special encounters exist, or that scope has moved to the milestone that will use it.
- [x] A bounty can create a pile site.

### Later, outside this milestone

Quests and special encounters, and what happens to a dead holder's
stacks on `character.died`, are Milestone 09. Streamer panel
refinements and director controls while the server runs are
Milestone 10. Piles that never deplete are not part of this cycle.

---

## Milestone 09 — Society and world depth

**Status: Active**

Start from `docs/roadmap/notes/09-from-08.md`.

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
- A belonging need, deferred from Milestone 04 until the existing social actions are not enough.
- Quests and special encounters, deferred from Milestone 08. Like interventions, each should be a recorded fact the chronicle can score.

Introduce these systems incrementally. Each should have clear ownership, inputs, outputs and interactions with existing simulation systems.

Three rules the earlier milestones leave open have to exist before combat, trade across the map, or a family can use what someone is holding.

A route that seeks a person or a stack. Milestone 03's shared field seeks water, land, camps, and piles. Give, comfort, and the other social actions start only when someone is already beside the actor. Following a target that moves was left under that closed milestone. Bringing food to someone, taking it, and meeting them across the map all use this route.

A dead holder's stacks. **Decided: they stay on the body.** `character.died` does not move or delete them, and they survive a save. The living cannot buy from or give to the body, and the director does not count it. A buy already underway fails when the seller dies. Removing the character still deletes the stacks. Taking from the body waits for a route to a stack. Inheritance, when families arrive, is a rule that moves them from the body.

A declared preference when two jobs share a score. The earlier definition wins a tie, and a bias of 0.05 can flip it. Craft wins by suppressing work while material is in hand. Dine wins by a bonus wider than that bias. A profession says which job wins without another one-off bonus.

A depleted pile returns to stock 3 on the same tile after 90 seconds. Wildlife, weather, and farming here renew or replace that input. They start from that return, not from a pile that is gone for good.

---

## Milestone 10 — Production readiness and expanded presentation

**Status: Planned**

Improve operational reliability, administration, stream presentation and platform support.

Initial scope:

- Admin and inspection tools (including browsing the character-indexed event log).
- Operational monitoring.
- Simulation performance profiling and the cheap tick-path wins recorded after Milestone 07 (commitment-aware `updateActions`, pile-route generation counters instead of per-call key stamps, avoid copying the static map on every snapshot). Broader capacity levers (LOD / background tick rates, spatial partitioning, deep-AI caps) belong here only after those are measured.
- Error reporting and recovery.
- Backup automation.
- Moderation tools (appeals, trusted roles, name and appearance abuse tooling, moderator UI — deeper than Milestone 07's ban/unban basics).
- Stream presentation improvements.
- Streamer panel refinements, following the first panel from Milestone 08:
  - Keep the controls off the captured stream view, behind a query flag such as `?streamer` or on a separate page.
  - Mark the tiles where a bounty will work: piles that are there or waiting to return. This needs the waiting piles on the snapshot or a read-only route.
  - Show the cooldown remaining on each intervention.
  - Reach the command server outside the Vite dev proxy, with authentication, so the panel works in a production build.
  - Director controls: switch rules and adjust the `DirectorSettings` thresholds while the server runs. A change should go through the command path so it is audited, and the startup environment stays the default.
- Viewer-facing UI improvements.
- YouTube and Kick adapters.
- Deployment and operational documentation.
- Production security and configuration.

The goal is to make the simulation reliable to operate over extended periods, including periods with no active viewers.

---

## Milestone 11 — Review Milestone

**Status: Planned**

Review everything built in Milestones 01 to 10 before planning more work. This milestone adds no features. The project owner uses it to confirm they understand how the whole simulation works. It also records what this version of the simulation leaves unresolved and plans the milestones that follow.

Work through the review in this order. Each step builds on the one before it.

### 1. Basic summary

A short plain-language account of what the project is today: what a running world contains, what characters do on their own, what a viewer can do, and what the streamer sees. Note what each milestone added and what each one deliberately deferred.

### 2. Architectural overview

How the pieces fit together, before going into any one of them:

- The workspace: `apps/server`, `apps/client`, `packages/simulation` and `packages/shared`, and what each owns.
- The simulation worker thread and the main server process, and the typed messages between them.
- The flow of a tick, from the fixed timestep through the systems to snapshots, deltas and chronicle entries.
- The flow of a command, from Twitch chat or a local route through the gateway into the world and back as feedback.
- Where state lives: the ECS world, the in-memory log and its indexes, the SQLite database, and what a save contains.
- Check this against `docs/architecture/` and note where the documents and the code disagree.

### 3. Deep dive, one part at a time

Walk through each part of the code in turn. For each one, cover what it owns, its inputs and outputs, the data it keeps, how it is tested, and the decisions that shaped it. Confirm the owner's understanding before moving to the next part.

1. Shared contracts (`packages/shared`): messages, commands and events.
2. Simulation core: the ECS world, components, entities, the fixed-timestep loop and seeding.
3. Characters: profile, attributes, personality, needs and lifecycle.
4. Behaviour: utility scoring, action definitions, commitment, interruption, cooldowns, failure and routing.
5. Social behaviour: greet, comfort, keep, confide and bluff, relationships and memories.
6. Economy: items, inventories, piles, gathering, crafting, giving, trade and the economy checker.
7. The log and history: events, participant and pair indexes, and retention.
8. Storytelling: chronicle scoring, presentation tiers, and the director and interventions added in Milestone 08.
9. Inspection: the read-only API and what it exposes.
10. Persistence: the world store, save format versions, database migrations, backup and restart.
11. Server: the worker host, WebSocket server, snapshot cache, chronicle feed and logging.
12. Viewer participation: viewers, platform identities, the command server, receipts, rate limits, moderation and Twitch.
13. Client: the WebSocket connection, the PixiJS renderer and the recent-events feed.
14. Tests: unit, regression, performance, tuning and end-to-end coverage, and where coverage is thin.
15. Production work from Milestone 10: monitoring, backups, performance and deployment.

### 4. Outstanding outliers

List anything in this version that does not fit: behaviour that contradicts the docs, stubs nothing reads yet, special cases and one-off bonuses, untested paths, performance risks, and scope that was deferred and never picked up. Decide for each one whether to fix it now, move it to a later milestone, or accept it.

### 5. Plan the next milestones

Using the review and the outliers, draft the milestones that follow this set. Start from the scope already deferred to later work, such as a belonging need, routes to a person or a stack, more than one world, and anything Milestones 09 and 10 left open. Write notes for the first of them under `docs/roadmap/notes/`.

### Definition of done

- [ ] The basic summary is written and agreed.
- [ ] The architectural overview is walked through and matches the code, or the differences are recorded.
- [ ] Every part in the deep dive has been reviewed and the owner confirms they understand it.
- [ ] Outstanding outliers are listed, each with a decision.
- [ ] The architecture and design docs are corrected where the review found them out of date.
- [ ] The next milestones are drafted in this file, with notes for the first one.

---

## Milestone sequencing notes

The sequence is a planning guide, not a rigid dependency graph.

Some persistence, observability, testing and communication work must begin early. Avoid implementing advanced systems simply because they appear later in the roadmap; validate the preceding gameplay loop first.

A milestone should establish a working foundation for the next one without prematurely implementing its full scope.

The project should remain runnable throughout development. Prefer small, verifiable increments and update architecture documentation when implementation decisions materially change.

Closing a milestone follows `docs/roadmap/closeout.md`: lock behaviour
in `packages/simulation/src/regression.test.ts`, run the suite, and
write notes for the next milestone under `docs/roadmap/notes/`.