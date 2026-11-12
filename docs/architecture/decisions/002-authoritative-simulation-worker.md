# ADR 002: Dedicated Authoritative Simulation Worker

**Status:** Accepted\
**Date:** 2026-11-08

## Context

The world must continue simulating independently of browser connections.
Network handling, platform integrations and simulation processing have
different workloads and failure characteristics. The browser must not
own gameplay state.

## Decision

Run the authoritative simulation in a dedicated Node.js `worker_thread`.

The worker owns the ECS state, clock, scheduler, simulation systems,
command application and domain-event production. The main application
process owns HTTP, WebSockets, platform adapters and worker lifecycle.

Communication uses typed messages defined in the shared package.

## Consequences

Positive:

-   Simulation continues without browser clients.
-   Clear ownership of gameplay state.
-   Network and platform work are separated from the simulation tick
    loop.
-   A single authoritative world avoids distributed consistency
    problems.

Trade-offs:

-   State crosses a message boundary and must be serialized.
-   Worker lifecycle and error handling require deliberate design.
-   The server must not maintain a competing authoritative state.
-   A worker crash requires restoration from persistence.

## Alternatives considered

-   Simulation on the main Node.js event loop: risks network activity
    delaying simulation ticks.
-   Browser-owned simulation: incompatible with persistence and
    independent world progression.
-   Multiple workers: premature complexity for the initial population
    and one-world target.
-   Separate simulation service: unnecessary operational complexity
    initially.

## Revisit conditions

Reconsider worker topology if profiling demonstrates that one worker
cannot meet targets or if world partitioning becomes a genuine
requirement.
