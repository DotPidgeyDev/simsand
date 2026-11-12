# World Director and Storytelling Design

**Status:** Conceptual design; implementation follows core simulation

## 1. Purpose

The project needs to produce an engaging livestream, not merely a
technically correct simulation. The world director creates pressures and
opportunities; the storytelling layer identifies consequential outcomes
and presents them to the audience.

Neither layer should falsify simulation outcomes.

## 2. Three distinct responsibilities

### Simulation engine

Determines what actually happens:

-   Character decisions and actions.
-   Movement and interactions.
-   Economy and resource changes.
-   Relationships and conflict.
-   Injuries, death and settlement changes.

### World director

Introduces opportunities and pressures:

-   Disasters.
-   Monsters and wildlife threats.
-   Quests and discoveries.
-   Festivals and seasonal events.
-   Blessings and curses.
-   Artefacts and unusual resources.
-   Streamer interventions.

A director intervention is a command or world event with explicit
simulation consequences. It must not bypass the simulation's rules
without an intentionally designed mechanic.

### Storytelling and presentation

Detects and communicates actual events:

-   Chronicle entries.
-   Notifications.
-   Camera focus.
-   Character biographies.
-   Settlement and faction histories.
-   Recaps of events that happened while the streamer was away.

## 3. Event-driven storytelling

The storytelling layer consumes domain events and relevant state
changes. It may group related events into a larger story, but must
retain references to the underlying evidence.

For example, a settlement conflict could be summarized from recorded
thefts, accusations, injuries, faction changes and combat events. The
summary must not invent a motive or outcome unsupported by the world
state.

## 4. Event significance

Potential scoring dimensions:

-   Consequence severity.
-   Novelty.
-   Rarity.
-   Number of entities affected.
-   Long-term impact.
-   Viewer-character relevance.
-   Streamer intervention relevance.
-   Relationship or goal significance.

Scoring should determine presentation priority, not alter the underlying
simulation.

## 5. Presentation tiers

  Tier          Treatment
  ------------- -------------------------------------------------
  Minor         Stored in chronicle or searchable history
  Notable       Appears in recent-event feed
  Significant   Notification or event panel
  Dramatic      Camera focus and expanded presentation
  Major         Featured story, recap or streamer-facing prompt

Avoid notifying the audience about every mundane action. Too many alerts
reduce the impact of genuinely important events.

## 6. Camera director

A future camera director can prioritize:

-   Combat and immediate danger.
-   Deaths and major injuries.
-   Important viewer-character events.
-   Settlement milestones.
-   Discoveries and rare events.
-   Streamer interventions.

The camera director controls presentation only. It must not pause,
accelerate or otherwise alter simulation state unless an explicit
separate command requests that behaviour.

## 7. Character attachment

Features that can encourage audience investment:

-   Follow a character.
-   Inspect their current activity and relationships.
-   View their history and biography.
-   See meaningful achievements and failures.
-   Receive recaps after being offline.
-   Observe descendants, inheritance and legacy where those mechanics
    exist.

Character summaries should be grounded in actual attributes,
relationships and recorded events.

## 8. Streamer interventions

The streamer acts as a god-like participant, but interventions should
have defined rules:

-   Permission and validation.
-   Explicit target and parameters.
-   Cost, cooldown or limitation where appropriate.
-   Simulation consequences.
-   Audit record.
-   Feedback about the result.

Possible intervention categories include blessings, curses, weather
changes, disasters, quests, creatures, artefacts and festivals.

## 9. LLM-assisted narration

LLMs may later produce natural-language descriptions, dialogue,
biographies and recaps. They should receive grounded context and must
not write directly to authoritative simulation state.

Store the source event IDs or state references used to generate
important summaries. Generated narration is presentation, not evidence.

## 10. Initial implementation boundary

Do not build the world director or narrative engine in Milestone 01.
Establish typed domain events and basic logs early so future
storytelling has reliable inputs.
