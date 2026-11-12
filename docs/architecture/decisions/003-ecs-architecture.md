# ADR 003: Entity Component System

**Status:** Accepted; library choice provisional\
**Date:** 2026-11-08

## Context

The world contains many entities processed by recurring systems:
movement, needs, actions, combat and economy. These systems need to
operate on subsets of entity state without embedding all behaviour in
large character objects.

Some data, such as memories and family trees, is sparse or graph-shaped
and does not naturally fit frequent ECS iteration.

## Decision

Use an ECS architecture for frequently processed runtime state.

Use bitECS as the initial candidate, hidden behind a small internal API.
Keep sparse domain data in associated stores keyed by stable persistent
IDs where that is a better fit.

Persistent IDs must be distinct from transient ECS handles.

## Consequences

Positive:

-   Systems have explicit responsibilities.
-   Entity data can be processed in batches.
-   Components can be composed as simulation requirements grow.
-   Domain logic is less tied to inheritance-heavy object hierarchies.

Trade-offs:

-   ECS can be overcomplicated if every concept is forced into
    components.
-   Debugging requires useful inspection tools.
-   Library-specific APIs must not leak throughout the domain.
-   Snapshot logic must include both ECS and associated domain stores.

## Alternatives considered

-   Object-oriented entity hierarchy: may become difficult to maintain
    as behaviours and combinations grow.
-   Fully custom ECS: unnecessary engineering before requirements are
    proven.
-   bitECS used directly everywhere: simpler initially, but creates
    broad library coupling.

## Revisit conditions

Profile representative workloads and review the abstraction if the
library limits required behaviour or adds more complexity than it
removes.
