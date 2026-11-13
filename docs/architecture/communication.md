# Communication Architecture

**Status:** Active implementation — foundational communication  
**Version:** 1.1  
**Last updated:** 2026-11-12

## 1. Purpose

Define how the application server, simulation worker, browser and future streaming-platform adapters communicate without sharing ownership of authoritative gameplay state.

The communication architecture separates simulation execution from networking and presentation.

The simulation worker owns authoritative gameplay state. The application server coordinates communication, while browser clients receive world state and render it.

The current implementation supports worker lifecycle messages, world snapshots, incremental deltas, browser WebSocket connections, and a validated command contract that produces domain events.

A public entry point for commands (HTTP API or platform adapter) and streaming-platform integrations remain future work.

---

## 2. Communication boundaries

| Boundary | Current mechanism | Responsibility | Status |
|---|---|---|---|
| Server ↔ simulation worker | Node.js worker message channel | Lifecycle, snapshots, deltas and errors | Implemented |
| Browser ↔ server | WebSockets (`ws`) | Initial state and incremental updates | Implemented |
| Local tools ↔ server | HTTP (Fastify), `127.0.0.1` only | Read-only inspection of status and entities | Implemented |
| Browser ↔ server APIs | HTTP | Configuration and non-streaming operations | Planned |
| Platform ↔ server | Platform-specific SDK/API or connection | Receive chat and platform events | Planned |
| Server ↔ persistence | `node:sqlite` in the server process | Save and restore durable world state | Implemented — snapshots |

The browser never communicates directly with the worker.

Platform adapters must never directly mutate simulation state.

The server distributes simulation updates but does not own or modify authoritative gameplay state.

### Inspection API

`apps/server/src/inspection-server.ts` is a read-only Fastify server on `127.0.0.1:8767` (`SIMSAND_INSPECT_PORT`). It has no authentication, so it must not be bound to a public interface.

| Route | Source | Response |
|---|---|---|
| `GET /status` | Worker `world.status.request`, plus server state | Uptime, browser clients, last save, and the `SimulationStatus` |
| `GET /entities` | The server's cached snapshot | Tick, count, and each entity's ID and position |
| `GET /entities/:id` | Worker `world.inspect.request` | `EntityInspection` (movement, appearance and character profile), or 404 |

If the worker doesn't answer within 2 seconds, the routes that query it return 503 with `simulation_unavailable`.

### Logging

The server writes timestamped log lines through `apps/server/src/logger.ts`, filtered by `SIMSAND_LOG_LEVEL` (default `info`). Every minute (`SIMSAND_STATUS_INTERVAL_MS`) it logs one status line: tick, population, browser clients, mean and maximum tick time, and last save. If ticks were dropped since the previous report, it also logs a warning. Periodic saves and snapshot receipt are logged at `debug`.

---

## 3. Message categories

Keep these concepts distinct:

- **Command:** A request for the simulation to attempt an action.
- **Domain event:** A fact that the simulation says occurred.
- **State delta:** A compact description of changed state for clients.
- **Snapshot:** A consistent representation of current state.
- **Lifecycle message:** Worker readiness, shutdown or failure.

A command can fail. A domain event describes an outcome, not an intention.

### Current implementation

The current protocol supports:

- Worker lifecycle messages.
- Simulation startup configuration.
- Pause and resume.
- Snapshot requests.
- Full world snapshots.
- Incremental world deltas.
- Simulation errors.
- Commands (`character.create`, `character.remove`) with an applied or rejected result.
- Domain events (`character.created`, `character.removed`) attached to applied results.

---

## 4. Worker protocol

**Status: Implemented — foundational protocol**

Worker communication uses Node.js `worker_threads` message passing.

The message contracts are defined in `packages/shared`.

### Server to worker

| Message | Purpose |
|---|---|
| `world.start` | Initialize and start the simulation |
| `world.pause` | Pause simulation advancement |
| `world.resume` | Resume simulation advancement |
| `world.snapshot.request` | Request a full world snapshot |
| `world.persist.request` | Request the complete state needed to save the world, tagged with a `requestId` |
| `world.command` | A validated `SimulationCommand` for the simulation to apply or reject |
| `world.status.request` | Request the current `SimulationStatus`, tagged with a `requestId` |
| `world.inspect.request` | Request full details for one entity by stable ID, tagged with a `requestId` |

The `world.start` message optionally includes:

- `seed`
- `population`
- `restore`: a `PersistedWorld` to resume instead of generating a new one

Without `restore`, the worker uses `seed` and `population` to generate a new world.

### Worker to server

| Message | Purpose |
|---|---|
| `world.ready` | Indicates that the simulation has initialized |
| `world.snapshot` | Full world state |
| `world.delta` | Incremental entity updates |
| `world.persisted` | The `PersistedWorld` for a `world.persist.request`, with the same `requestId` |
| `world.command.result` | The `CommandResult` for a `world.command`, matched by `commandId` |
| `world.status` | Tick, clock, pause state, population and tick timing for a `world.status.request` |
| `world.inspected` | An `EntityInspection`, or `null` if no entity has that ID |
| `world.error` | Simulation error information |

The current message types are represented as TypeScript discriminated unions.

### Current message contracts

The shared package currently defines the following concepts:

- `ServerToWorkerMessage`
- `WorkerToServerMessage`
- `EntitySnapshot`
- `WorldSnapshot`
- `WorldDelta`
- `PersistedWorld` and `PersistedEntity`
- `CommandRequest`, `SimulationCommand` and `CommandResult`
- `DomainEvent`
- `SimulationStatus` and `EntityInspection`
- `WorldMapData` and `TERRAIN_TYPES`

The exact definitions are maintained in:

`packages/shared/src/index.ts`

The simulation worker and server import these shared types rather than duplicating message definitions.

---

## 5. Message envelope and protocol versioning

**Status: Planned**

The original architecture proposes a standard message envelope:

```ts
type MessageEnvelope<TType extends string, TPayload> = {
  protocolVersion: number;
  type: TType;
  messageId: string;
  correlationId?: string;
  sentAt: number;
  payload: TPayload;
};
```

This standard envelope has not yet been implemented.

For the current foundational implementation, messages use a simpler structure containing:

- `type`
- `data`

A versioned envelope should be introduced when the communication protocol becomes more complex or requires compatibility across independently deployed clients and services.

Use timestamps for diagnostics and transport context, not as the authoritative simulation clock.

TypeScript types alone do not validate runtime data. External command input is validated at runtime (section 6). Other boundaries should add validation when they start accepting untrusted messages.

---

## 6. External command lifecycle

**Status: Partially implemented — contract and gateway, no public entry point yet**

External callers will submit commands through the application server.

The intended lifecycle is:

```text
Platform event / browser request
              |
       Normalize input
              |
     Authenticate identity
              |
 Validate syntax and parameters
              |
  Check permissions and limits
              |
      Create command envelope
              |
       Send to simulation
              |
   Simulation checks world state
              |
        Apply or reject
              |
      Emit result / domain event
              |
    Persist, notify and present result
```

The server performs transport, identity, syntax, permission and abuse checks.

The simulation performs gameplay validation and determines the actual outcome.

### Current implementation

`CommandGateway` (`apps/server/src/command-gateway.ts`) is the server-side entry point. Its `submit(input, issuer)` takes untrusted input plus an issuer identity that the server has already established:

```json
{
  "protocolVersion": 1,
  "command": {
    "type": "character.create",
    "params": { "characterId": "visitor-0001", "x": 32, "y": 32 }
  }
}
```

The gateway checks, in order:

1. `protocolVersion` equals `COMMAND_PROTOCOL_VERSION` (currently 1). Otherwise `unsupported_version`.
2. The command matches a strict Zod schema. Unknown fields, unknown types, malformed IDs and out-of-range values are rejected as `invalid_command`.
3. The issuer's source is permitted to issue the command type. Otherwise `forbidden`.

It then adds a `commandId`, the issuer and `submittedAt`, and sends the command to the worker. The worker handles it between ticks and either applies it or rejects it with a gameplay reason (`character_exists`, `character_not_found`, `out_of_bounds`). If the worker is unavailable or does not reply within 2 seconds, the result is `simulation_unavailable`.

The first command types are:

| Command | Parameters | Allowed sources |
|---|---|---|
| `character.create` | `characterId`, `x`, `y`, optional `velocityX`, `velocityY`, `color` | admin, streamer, system |
| `character.remove` | `characterId` | admin, streamer, system |

Viewers have no command permissions until viewer identity is implemented.

Nothing exposes the gateway to the network yet. The HTTP API, admin tooling and platform adapters will call it once they exist. Rate limits and deduplication are not implemented.

---

## 7. Command properties

**Status: Partially implemented**

`SimulationCommand` currently carries the command ID, issuer source and ID, target stable entity ID, typed parameters and submission timestamp. Expiry, voting windows and deduplication keys are not yet implemented.

Commands should eventually support:

- Unique command ID.
- Issuer identity and source.
- Target stable entity ID where relevant.
- Typed parameters.
- Submission timestamp.
- Optional expiry or voting-window identifier.
- Permission context or server-validated actor role.
- Idempotency/deduplication key where duplicate delivery is possible.

Do not trust a client-provided role or permission claim.

The server must derive authorization from authenticated platform or application identity.

---

## 8. Domain events

**Status: Partially implemented — initial contracts**

Events are emitted after an authoritative outcome occurs.

Example event names:

```text
character.created
character.joined
character.moved
character.stole
character.died
relationship.formed
item.transferred
settlement.founded
faction.created
```

An event should identify:

- Event type.
- Stable event ID.
- Simulation tick.
- Simulation time.
- Relevant entity IDs.
- Event-specific payload.

Only selected events need durable storage. Transient movement updates should not become an unbounded event log.

### Current implementation

`DomainEvent` in `packages/shared` defines `character.created` and `character.removed`. Each event has an `eventId`, `type`, `version` (`DOMAIN_EVENT_VERSION`, currently 1), `tick`, `elapsedSeconds`, `causedByCommandId` when a command caused it, and a typed `payload`.

The simulation emits these events only when a command is applied, and returns them in the applied `CommandResult`. The gateway hands them to an optional `onEvents` callback. Events are not yet persisted, broadcast to browsers or consumed by any feature.

---

## 9. WebSocket client protocol

**Status: Implemented — foundational protocol**

Browser clients communicate with the server using WebSockets.

The current browser WebSocket endpoint listens on port `8766`.

### Connection lifecycle

When a browser connects:

1. The WebSocket server accepts the connection.
2. The server checks whether a cached world snapshot exists.
3. If available, the server sends the latest full snapshot.
4. The client initializes or updates its renderer.
5. Subsequent incremental deltas are broadcast to connected clients.

When a client disconnects, the server logs the disconnection.

The simulation continues independently of browser connections.

### Initial snapshots

A full snapshot includes the static tile map, which the client draws as terrain. Deltas never carry the map.

The server caches the latest full snapshot received from the simulation worker, then folds each broadcast delta into that cache. Deltas carry absolute entity positions, so the cache stays aligned with the worker without a new full snapshot on every tick.

A client that connects later receives this current snapshot, then the same subsequent deltas as every other client. It does not have to reconstruct the world from the startup snapshot plus a partial delta history.

### Reconnection

When the connection closes, the browser client reconnects automatically. Retries start at 500 ms and double up to a 5 second cap. The delay resets after a successful connection.

On each new connection the client ignores deltas until the server's snapshot arrives. It then replaces its whole entity set with that snapshot, so sprites for entities that no longer exist are removed, and resumes applying deltas.

Restarting the server restores the last saved world, and reconnecting clients receive its snapshot.

### Incremental updates

The worker periodically generates deltas containing changed entities.

The server broadcasts these updates to connected browser clients.

The current delta format includes:

- Simulation tick.
- Changed entity snapshots, including newly created entities.
- `removed`: stable IDs of entities that no longer exist.

The browser applies these updates to the PixiJS renderer, destroying the sprites of removed entities. The server applies the same updates to its cached snapshot, so later clients never receive removed entities.

### Current limitations

The following remain future improvements:

- WebSocket authentication and authorization.
- Subscription management for multiple worlds.
- Client-originated commands.
- Protocol version negotiation.
- Sequence numbers and missed-update detection.
- Explicit resynchronization requests.
- Event notifications separate from state deltas.

The client currently assumes that received messages follow the expected protocol.

---

## 10. Platform adapters

**Status: Planned**

Each streaming platform adapter should convert platform-specific payloads into platform-independent messages.

For example:

```ts
type NormalizedChatMessage = {
  platform: "twitch" | "youtube" | "kick";
  platformUserId: string;
  platformUsername: string;
  displayName: string;
  messageId: string;
  text: string;
  receivedAt: number;
};
```

The command processor should not contain platform-specific parsing logic.

Adding a platform should primarily mean implementing an adapter and mapping its identities.

Twitch is the intended initial integration, with YouTube and Kick potentially supported later.

No streaming-platform adapters are currently implemented.

---

## 11. Validation and versioning

**Status: Partially implemented**

The current implementation uses shared TypeScript contracts to keep worker and browser message structures consistent.

External command input is validated with Zod and carries a `protocolVersion`. Domain events carry a `version`. Persisted worlds are checked against their schema version on load. Worker and browser messages are still trusted without runtime validation.

Future requirements:

- Use Zod schemas for runtime validation at boundaries.
- Version message contracts.
- Reject malformed or unsupported messages clearly.
- Keep internal ECS component layouts out of public contracts.
- Prefer stable IDs and domain-level payloads over runtime ECS handles.
- Add compatibility rules before changing persisted or externally consumed formats.

TypeScript provides compile-time checks but does not validate arbitrary runtime data.

This distinction becomes particularly important when accepting browser requests, platform events and persisted data.

---

## 12. Error handling

**Status: Partially implemented**

The current implementation supports basic worker error reporting.

The worker can send a `world.error` message containing an error message.

The server receives and logs worker errors.

The server also listens for worker runtime errors and exit events.

Future error classifications should include:

- Invalid message.
- Unsupported protocol version.
- Unauthenticated or unauthorized request.
- Rate limited or duplicate command.
- Invalid gameplay request.
- Worker unavailable.
- Internal simulation failure.
- Persistence failure.

Return useful, safe feedback to the requester.

Keep diagnostic detail in server logs rather than exposing internal stack traces to viewers.

---

## 13. Initial implementation scope

The initial communication milestone focused on:

- Worker lifecycle messages.
- Simulation startup.
- Pause and resume.
- Snapshot request and response.
- Entity deltas.
- Worker error reporting.
- Browser WebSocket connections.
- Initial snapshots for newly connected clients.
- Broadcasting incremental updates.

### Progress

The foundational communication layer is implemented.

The server can start the simulation worker, receive snapshots and deltas, cache the latest snapshot and broadcast updates to browser clients.

The browser receives the initial snapshot and subsequent deltas and uses them to update the PixiJS renderer.

An end-to-end test (`apps/server/src/headless.e2e.test.ts`) runs the real server on random ports with a temporary database. With no browser attached, it checks that the tick advances. It then connects a WebSocket client, receives the snapshot, disconnects, and checks that the tick keeps advancing. Finally it checks for a clean save and exit on SIGTERM.

The remaining communication work includes:

- Runtime validation for browser messages.
- A versioned envelope for worker and browser messages.
- A public entry point for commands.
- Durable storage and delivery of domain events.
- Livestream platform adapters.

The initial communication milestone does not require implementing Twitch or other platform integrations.

---

## 14. Communication principles

1. Keep authoritative simulation state inside the worker.
2. Keep browser clients and platform adapters separate from simulation internals.
3. Use shared contracts for communication across process boundaries.
4. Distinguish commands, domain events, deltas and snapshots.
5. Send full snapshots for initialization and incremental updates for ongoing state changes.
6. Validate external data at runtime boundaries.
7. Keep protocol complexity proportional to actual requirements.
8. Never treat a requested action as a successful gameplay outcome until the simulation confirms it.
9. Keep network operations outside the simulation tick loop.
10. Version public or persisted contracts before compatibility becomes a problem.

The communication layer should remain simple while the simulation foundation is being developed, but must provide clear boundaries for future commands, events, platform integrations and persistence.