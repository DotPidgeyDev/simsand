# World Simulation Design

**Status:** Conceptual design; systems to be introduced incrementally

## 1. Purpose

The world simulation provides the environment, resources, opportunities
and constraints within which characters live. Systems should interact to
create consequences rather than operate as isolated minigames.

## 2. System domains

  Domain       Responsibilities
  ------------ -------------------------------------------------------------
  World        Map, terrain, weather, seasons and environmental conditions
  Movement     Navigation, pathfinding, collision and reachability
  Character    Needs, skills, personality, action selection
  Economy      Production, consumption, trade, currency and scarcity
  Social       Relationships, memories, family and social groups
  Combat       Threats, weapons, damage, injury and death
  Settlement   Buildings, construction, storage and ownership
  Society      Professions, factions, laws, leadership and institutions
  Content      Definitions for items, creatures, buildings and events

Each domain should have clear ownership of its state and explicit
dependencies on other domains.

## 3. World map

Initial map: a simple 64 × 64 tile grid with basic terrain and world
boundaries. Begin with free movement and bounds checking. Add collision
and pathfinding only when the first movement model is proven.

Map data should distinguish static or slowly changing terrain from
dynamic world state such as resources, structures and entities occupying
tiles.

LDtk is the selected initial map editor. Keep map loading and
representation independent of PixiJS.

## 4. Economy

The economy must have both sources and sinks.

Potential sources:

-   Farming.
-   Mining.
-   Hunting.
-   Gathering.
-   Crafting.
-   Trade with external or generated markets, if explicitly modelled.

Potential sinks:

-   Food and material consumption.
-   Equipment durability.
-   Construction.
-   Upkeep.
-   Taxes or fees.
-   Loss through spoilage, damage or destruction.

Model scarcity, labour, transport, storage and access. Avoid unlimited
production and runaway wealth.

Distinguish personal inventories, settlement stockpiles and faction
treasuries. Transfers should have explicit ownership and quantity rules.

## 5. Settlements and structures

Settlements should emerge from actual resource access, population,
construction and social organization. Structures should have
definitions, costs, construction requirements, ownership and operational
effects.

Avoid treating a settlement as only a visual collection of buildings. It
should have meaningful stores, population, production, needs and
history.

## 6. Factions and society

Factions may include guilds, religions, criminal groups, merchant
companies, armies or political organizations.

Membership and leadership should be represented as domain relationships
with clear lifecycle rules. Factions should emerge from shared goals,
interests, loyalties and conflicts rather than being assigned solely for
narrative convenience.

## 7. Combat, injury and death

Combat should use explicit rules for capabilities, equipment, distance,
risk and consequences. Injuries may affect future capability. Death
should be a real simulation outcome and should connect to character
legacy and ownership rules.

Viewer-owned characters should not be exempt from world rules by
default.

## 8. Population scaling

Not every resident needs the same simulation detail at all times.

Potential tiers:

-   **High detail:** viewer characters and currently important
    characters.
-   **Normal detail:** ordinary residents in active settlements.
-   **Background detail:** distant or low-relevance populations
    represented with aggregate updates.

Reduced detail must preserve meaningful outcomes. Background farmers
should still contribute production; background populations should not
become a source of free resources.

Define population caps, NPC replacement, retirement, death, viewer
inactivity and orphaned assets as the simulation grows.

## 9. Content extensibility

Separate systems, behaviours and content definitions:

-   Systems implement mechanics.
-   Behaviours/actions define choices characters can make.
-   Content definitions describe items, creatures, buildings,
    professions and balance.

Adding a new sword should normally require a content definition and
assets, not a rewrite of combat. Version definitions so updates do not
silently invalidate existing world instances.

## 10. Invariants

Add tests for rules such as:

-   Resource and inventory quantities cannot be negative.
-   An item has one authoritative owner/location at a time.
-   Dead characters cannot perform actions.
-   Structures reference valid locations and owners.
-   Faction membership references valid entities.
-   Production and consumption preserve accounting rules.
-   Population counts reconcile with entity state.

## 11. Initial implementation boundary

Milestone 01 includes only a basic grid and movement. Do not implement
pathfinding, economy, combat, settlement simulation or factions until
the core simulation loop and worker communication are functioning.
