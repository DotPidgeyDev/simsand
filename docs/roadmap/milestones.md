# Implementation Roadmap

**Status:** Active — Milestone 06  
**Version:** 1.10  
**Last updated:** 2026-11-21

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
and relationships by participant is Milestone 06. A viewer-facing
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
relationships is Milestone 06.

---

## Milestone 06 — Durable world

**Status: In progress**

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

Expand snapshots and durable events to cover implemented gameplay state.

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
- Inventories and resource piles on the map snapshot. It currently carries position, terrain, and the resting, eating, drinking, and working flags. Stacks and piles are already on the saved world and on inspection.

Ensure presentation is grounded in recorded simulation events. The director should react to the world rather than dictate ordinary character behaviour.

Chronicle entries, recaps and a viewer's character history are a small
window over the Milestone 04 log: scored, abbreviated, and safe to show
on stream. Debugging still uses the full participant-indexed history.

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
- A belonging need, deferred from Milestone 04 until the existing social actions are not enough.

Introduce these systems incrementally. Each should have clear ownership, inputs, outputs and interactions with existing simulation systems.

Three rules the earlier milestones leave open have to exist before combat, trade across the map, or a family can use what someone is holding.

A route that seeks a person or a stack. Milestone 03's shared field seeks water, land, camps, and piles. Give, comfort, and the other social actions start only when someone is already beside the actor. Following a target that moves was left under that closed milestone. Bringing food to someone, taking it, and meeting them across the map all use this route.

A dead holder's stacks. Death already leaves them on the corpse. Removing the character deletes them. Families need a rule for the day someone dies: the stacks move, they stay on the body, or they are gone.

A declared preference when two jobs share a score. The earlier definition wins a tie, and a bias of 0.05 can flip it. Craft wins by suppressing work while material is in hand. Dine wins by a bonus wider than that bias. A profession says which job wins without another one-off bonus.

A depleted pile returns to stock 3 on the same tile after 90 seconds. Wildlife, weather, and farming here renew or replace that input. They start from that return, not from a pile that is gone for good.

---

## Milestone 10 — Production readiness and expanded presentation

**Status: Planned**

Improve operational reliability, administration, stream presentation and platform support.

Initial scope:

- Admin and inspection tools (including browsing the character-indexed event log).
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

Closing a milestone follows `docs/roadmap/closeout.md`: lock behaviour
in `packages/simulation/src/regression.test.ts`, run the suite, and
write notes for the next milestone under `docs/roadmap/notes/`.