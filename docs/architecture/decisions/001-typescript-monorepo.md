# ADR 001: TypeScript Monorepo

**Status:** Accepted\
**Date:** 2026-11-08

## Context

The project has a server, browser client, simulation engine and shared
communication contracts. These components benefit from shared language,
validation schemas and type definitions, but must remain architecturally
separated.

The initial project is being built by a small team or individual and
should avoid unnecessary infrastructure.

## Decision

Use TypeScript across the initial application and simulation code,
organized as a pnpm monorepo.

Initial packages:

-   `apps/server`
-   `apps/client`
-   `packages/simulation`
-   `packages/shared`

Use shared TypeScript configuration and root scripts for development,
build, typecheck and tests.

## Consequences

Positive:

-   Shared language and tooling.
-   Easier reuse of message contracts and validation schemas.
-   Straightforward local development.
-   Clear package boundaries without separate repositories.

Trade-offs:

-   TypeScript types do not provide runtime validation; boundary schemas
    are still required.
-   A monorepo can become tightly coupled unless dependency rules are
    enforced.
-   CPU-heavy simulation may eventually require profiling or a different
    runtime.

## Alternatives considered

-   Separate repositories: more coordination and versioning overhead at
    this stage.
-   JavaScript: weaker compile-time guarantees for complex domain and
    message contracts.
-   Rust simulation from the start: adds implementation and integration
    cost before a bottleneck is demonstrated.

## Revisit conditions

Reconsider language or repository boundaries if profiling, team
structure or deployment requirements demonstrate a concrete need.
