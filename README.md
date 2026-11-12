# Fantasy World --- Architecture Documentation

**Status:** Foundational draft\
**Version:** 1.0\
**Date:** 2026-11-08

This documentation defines the initial technical direction for a
persistent, autonomous fantasy world designed for livestream
participation.

## Start here

-   [Architecture overview](architecture/overview.md)
-   [Simulation architecture](architecture/simulation.md)
-   [Communication architecture](architecture/communication.md)
-   [Persistence architecture](architecture/persistence.md)
-   [Viewer identity and character
    ownership](architecture/viewer-identity.md)
-   [Architecture decisions](architecture/decisions/README.md)
-   [Implementation roadmap](roadmap/milestones.md)

## Design documents

-   [Character simulation](design/character-simulation.md)
-   [World simulation](design/world-simulation.md)
-   [World director and storytelling](design/storytelling.md)

## How to use these documents

These documents are a working baseline, not a promise that every future
feature is already designed. They distinguish settled decisions,
provisional choices and unresolved questions. When implementation
reveals a better approach, update the relevant document and record
consequential changes as an Architecture Decision Record (ADR).

The first implementation should remain deliberately small: start the
server, run an authoritative simulation worker, create a simple grid,
simulate 20 entities and render them in a browser. Do not build all
future systems before this vertical slice works.
