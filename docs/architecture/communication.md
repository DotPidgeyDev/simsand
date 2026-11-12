# Communication Architecture

**Status:** Foundational draft\
**Version:** 1.0

## 1. Purpose

Define how the application server, simulation worker, browser and
streaming-platform adapters communicate without sharing ownership of
authoritative gameplay state.

## 2. Communication boundaries

  -----------------------------------------------------------------------
  Boundary                Initial mechanism       Responsibility
  ----------------------- ----------------------- -----------------------
  Server ↔ simulation     Node worker message     Commands, lifecycle,
  worker                  channel                 snapshots, deltas and
                                                  errors

  Browser ↔ server        WebSockets              Initial state,
                                                  incremental updates and
                                                  client requests

  Browser ↔ server APIs   HTTP                    Configuration and
                                                  non-streaming
                                                  operations where
                                                  appropriate

  Platform ↔ server       Platform-specific       Receive chat and
                          SDK/API or connection   platform events

  Server ↔ persistence    In-process persistence  Save and restore
                          boundary                durable world state
  -----------------------------------------------------------------------

The browser never communicates directly with the worker. Platform
adapters never directly mutate simulation state.

## 3. Message categories

Keep these concepts distinct:

-   **Command:** a request for the simulation to attempt an action.
-   **Domain event:** a fact that the simulation says occurred.
-   **State delta:** a compact description of changed state for clients.
-   **Snapshot:** a consistent representation of current state.
-   **Lifecycle message:** worker readiness, shutdown or failure.

A command can fail. A domain event describes an outcome, not an
intention.

## 4. Initial worker protocol

### Server to worker

``` text
world.start
world.pause
world.resume
world.snapshot.request
```

The command envelope should include a protocol version and
correlation/request ID where a response must be matched to a request.

### Worker to server

``` text
world.ready
world.snapshot
world.delta
world.event
world.error
```

These names are initial contract concepts. Exact TypeScript
discriminated-union definitions should be added in `packages/shared`
when implementing the worker.

## 5. Message envelope

Use a consistent envelope with fields such as:

``` ts
type MessageEnvelope<TType extends string, TPayload> = {
  protocolVersion: number;
  type: TType;
  messageId: string;
  correlationId?: string;
  sentAt: number;
  payload: TPayload;
};
```

Use timestamps for diagnostics and transport context, not as the
authoritative simulation clock.

Every incoming message must be validated at the process boundary.
TypeScript types alone do not validate runtime data.

## 6. External command lifecycle

``` text
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

The server performs transport, identity, syntax, permission and abuse
checks. The simulation performs gameplay validation and determines the
actual outcome.

## 7. Command properties

Commands should support:

-   Unique command ID.
-   Issuer identity and source.
-   Target stable entity ID where relevant.
-   Typed parameters.
-   Submission timestamp.
-   Optional expiry or voting-window identifier.
-   Permission context or server-validated actor role.
-   Idempotency/deduplication key where duplicate delivery is possible.

Do not trust a client-provided role or permission claim. The server
derives authorization from authenticated platform or application
identity.

## 8. Domain events

Events are emitted after an authoritative outcome occurs. Example names:

``` text
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

An event should identify its event type, stable event ID, simulation
tick, simulation time, relevant entity IDs and event-specific payload.

Only selected events need durable storage. Transient movement updates
should not become an unbounded event log.

## 9. WebSocket client protocol

On connection:

1.  Authenticate or establish the permitted client role.
2.  Subscribe the connection to the relevant world.
3.  Send a consistent initial snapshot.
4.  Send subsequent deltas and relevant events.
5.  Detect disconnects and release subscriptions.
6.  On reconnect, send a fresh snapshot before further deltas.

The client should be able to detect protocol version mismatch and
request or require a fresh snapshot if it misses updates.

Avoid sending the entire world on every tick. Batch or throttle updates
where appropriate, while preserving important event notifications.

## 10. Platform adapters

Each platform adapter converts platform-specific payloads into a
platform-independent message, for example:

``` ts
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

The command processor should not contain platform-specific parsing
logic. Adding a platform should primarily mean implementing an adapter
and mapping its identities.

## 11. Validation and versioning

-   Use Zod schemas for runtime validation at boundaries.
-   Version message contracts.
-   Reject malformed or unsupported messages clearly.
-   Keep internal ECS component layouts out of public contracts.
-   Prefer stable IDs and domain-level payloads over runtime ECS
    handles.
-   Add compatibility rules before changing persisted or externally
    consumed formats.

## 12. Error handling

Errors should be classified, for example:

-   Invalid message.
-   Unsupported protocol version.
-   Unauthenticated or unauthorized request.
-   Rate limited or duplicate command.
-   Invalid gameplay request.
-   Worker unavailable.
-   Internal simulation failure.

Return useful, safe feedback to the requester. Keep diagnostic detail in
server logs rather than exposing internal stack traces to viewers.

## 13. Initial implementation scope

For Milestone 01, implement only worker lifecycle messages, snapshot
request/response, entity deltas and errors. Define the standard command
envelope and test it without integrating Twitch. Platform adapters come
later.
