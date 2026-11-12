# Contributing to Simsand

This document describes the development conventions, architectural boundaries and testing expectations for Simsand.

The project is in early development. These conventions are intended to keep the codebase consistent and maintainable as new simulation systems are introduced.

---

## 1. Development environment

### Requirements

- Node.js 24.x
- pnpm 12.18.0
- Git
- TypeScript

### Initial setup

```bash
git clone <repository-url>
cd simsand
pnpm install
```

### Running the project

Start the server:

```bash
pnpm --filter @simsand/server dev
```

Start the browser client in a separate terminal:

```bash
pnpm --filter @simsand/client dev
```

---

## 2. Project structure

The project uses a pnpm monorepo.

```text
simsand/
├── apps/
│   ├── client/
│   └── server/
│
├── packages/
│   ├── shared/
│   └── simulation/
│
└── ...
```

### Package responsibilities

| Package | Responsibility |
|---|---|
| `apps/client` | Browser application, PixiJS rendering and user-facing interfaces |
| `apps/server` | Server lifecycle, worker management and client communication |
| `packages/simulation` | ECS, simulation state, entities, systems and world logic |
| `packages/shared` | Shared types, interfaces and communication contracts |

### Architectural boundaries

These boundaries are important:

- Simulation logic must not depend on PixiJS, browser APIs or presentation code.
- The browser must not directly modify authoritative simulation state.
- The server coordinates the simulation but should not become the home of gameplay logic.
- Shared packages should contain contracts and common definitions, not implementation-specific ECS internals.
- New functionality should be added to the package that owns that responsibility.

Avoid introducing dependencies between packages unless there is a clear architectural reason.

---

## 3. TypeScript conventions

- Use TypeScript for application and simulation code.
- Enable strict type checking.
- Prefer explicit interfaces for public contracts.
- Use `import type` for type-only imports.
- Use ES modules.
- Keep functions focused on a single responsibility.
- Avoid `any` unless