# Character Simulation Design

**Status:** Conceptual design; mechanics not yet finalized

## 1. Purpose

Characters should feel like individuals with needs, dispositions,
skills, relationships and ambitions. They should make plausible
decisions based on what they know and can actually do.

The design should produce emergent behaviour without requiring an LLM to
decide every action.

## 2. Character data categories

  -----------------------------------------------------------------------
  Category                            Examples
  ----------------------------------- -----------------------------------
  Identity                            Stable ID, name, race/species,
                                      appearance

  Personality                         Aggression, sociability, greed,
                                      ambition, loyalty, curiosity,
                                      courage, honesty, industriousness,
                                      empathy

  Attributes                          Strength, dexterity, intelligence,
                                      wisdom, constitution, perception,
                                      charisma

  Background                          Family, upbringing, wealth, former
                                      occupation, life experience

  Needs                               Hunger, thirst, fatigue, safety,
                                      social interaction, wealth, status,
                                      belonging, purpose

  Skills                              Farming, hunting, crafting, combat,
                                      trading

  Inventory                           Items, equipment, currency

  Relationships                       Friends, family, rivals, enemies

  Memories                            Significant experiences and
                                      interactions

  Goals                               Wealth, revenge, family,
                                      leadership, exploration, belonging
  -----------------------------------------------------------------------

Personality and attributes are distinct. Personality influences
preferences; attributes and skills influence capability and outcomes.

## 3. Utility-based decision making

At decision points, a character evaluates actions available in its
current context.

A conceptual score may combine:

-   Base action utility.
-   Need pressure.
-   Personality modifiers.
-   Long-term goal relevance.
-   Skills and attributes.
-   Environmental conditions.
-   Available resources.
-   Relationship context.
-   Witnesses and social consequences.
-   Risk and expected reward.
-   Cooldowns and recent failures.

This is a design model, not a finalized mathematical formula. Keep the
scoring implementation inspectable and testable.

## 4. Action lifecycle

Actions should have an explicit lifecycle:

``` text
Available
   |
Evaluated
   |
Selected
   |
In progress
   |----> Completed
   |----> Failed
   |----> Interrupted
```

An action definition should specify prerequisites, target requirements,
expected duration, effects, failure conditions and interruption rules.

Commitment is important. Characters should not abandon work every tick
because another action's utility changed slightly.

## 5. Avoiding pathological behaviour

Plan for:

-   Action oscillation: repeatedly switching between work, food and
    rest.
-   Impossible actions: attempting tasks without the required skill,
    item or access.
-   Movement loops: repeatedly navigating toward unreachable targets.
-   Identical behaviour: all characters choosing the same action.
-   Goal abandonment: immediate needs permanently suppressing long-term
    ambitions.
-   Stale targets: continuing actions after a target disappears.

Mitigations:

-   Minimum commitment durations.
-   Interrupt priorities.
-   Cooldowns and failure memory.
-   Explicit prerequisites.
-   Reachability checks.
-   Goal persistence.
-   Controlled seeded randomness.
-   Useful decision logs and inspector tools.

## 6. Immediate needs and long-term goals

Needs create immediate pressure. Goals provide continuity and direction.

Examples of goals:

-   Become wealthy.
-   Start a family.
-   Gain political influence.
-   Seek revenge.
-   Explore unknown territory.
-   Become a respected craftsperson.
-   Protect a settlement.

Goals should influence action evaluation but remain achievable only
through actual world opportunities and character capabilities.

## 7. Knowledge and capability

Characters should not act on information they could not reasonably
possess. A character should not select a trade opportunity, target or
resource it does not know about unless the relevant system explicitly
provides discovery.

Separate:

-   What exists in the world.
-   What a character knows.
-   What a character can reach.
-   What a character is capable of doing.

## 8. Relationships and memories

Use sparse relationship records rather than an all-pairs character
matrix. Create or update relationships when meaningful interactions
occur.

Memories should capture consequential events rather than every ordinary
movement or tick. Possible memory fields include event, participants,
location, time, emotional significance and confidence/relevance.

A memory can influence later decisions, relationship changes and
character summaries.

## 9. Backgrounds and variation

Backgrounds should influence initial circumstances, skills,
relationships, resources and opportunities. They should not dictate a
fixed storyline.

Use seeded generation so the same world seed and configuration can
reproduce initial character generation.

## 10. LLM use

Do not use LLMs in the critical per-tick decision loop.

Possible later uses:

-   Dialogue based on known character state.
-   Biographies grounded in recorded history.
-   Summaries of actual memories and events.
-   Natural-language descriptions of factions and settlements.

Generated text must not create authoritative facts. Any factual claim
should be grounded in simulation state or recorded events.

## 11. Initial implementation boundary

Milestone 01 stored only identity, position, velocity and appearance.
Milestone 02 adds the character profile: a seeded name, the seven
attributes, the ten personality traits, hunger, thirst and fatigue, and
a lifecycle of alive or dead. Fatigue rises with movement and recovers
while the character rests; constitution sets the rate. Hunger and thirst
rise over time, and the world feeds or waters a character once that need
is pressing. Skills, inventory,
relationships, memories and goals stay later.
