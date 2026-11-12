# ADR 004: Commands and Domain Events

**Status:** Accepted\
**Date:** 2026-11-08

## Context

The system receives requests from viewers, the streamer, the browser and
internal processes. Requests may be invalid or impossible. The system
also needs to communicate facts about what actually happened to
persistence, presentation and other systems.

Treating requests and outcomes as the same message would blur authority
and make auditing difficult.

## Decision

Use separate concepts:

-   **Commands** request that the simulation attempt an operation.
-   **Domain events** record authoritative outcomes.
-   **State deltas** communicate changed state to clients.
-   **Snapshots** provide a consistent full state representation.

The server validates identity, permissions, syntax and rate limits. The
simulation validates gameplay rules and applies or rejects commands.
Events are emitted only after authoritative outcomes.

Use typed, versioned contracts and runtime validation at process
boundaries.

## Consequences

Positive:

-   External messages cannot directly mutate world state.
-   Failed requests are distinct from successful outcomes.
-   Events can feed persistence, chronicle, memories and notifications.
-   Platform integrations remain independent of simulation logic.

Trade-offs:

-   Requires explicit contracts and command-result handling.
-   Event payloads need versioning.
-   Not every event should be persisted; retention policy is required.

## Alternatives considered

-   Direct state mutation from server handlers: weakens simulation
    authority and creates coupling.
-   Treat all messages as events: confuses intent with fact.
-   Full event sourcing from day one: unnecessary complexity for the
    initial vertical slice.

## Revisit conditions

Review the contract if command throughput, replay requirements, multiple
consumers or distributed deployment introduce new constraints.
