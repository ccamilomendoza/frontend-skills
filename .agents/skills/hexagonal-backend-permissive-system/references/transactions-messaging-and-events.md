# Transactions, Messaging, and Events

Use this reference when a use case requires atomic writes, optimistic
concurrency, broker-aware delivery behavior, reliable asynchronous side
effects, idempotency, domain events, or a transactional outbox.

## Contents

1. [Transaction ownership](#transaction-ownership)
2. [Functional transaction runners](#functional-transaction-runners)
3. [Optimistic concurrency](#optimistic-concurrency)
4. [Message handling outcomes](#message-handling-outcomes)
5. [Domain events](#domain-events)
6. [Transactional outbox](#transactional-outbox)
7. [Reliability decisions](#reliability-decisions)

## Transaction Ownership

The use case decides which work must be atomic because atomicity is part of the
operation's application policy. Infrastructure owns how a concrete transaction
opens, commits, rolls back, and binds clients. Domain functions and inbound
handlers own neither.

Do not pass ORM clients, database sessions, transaction handles, or ambient
transaction state into application code. Inject a capability that supplies a
transaction-bound port bundle instead.

Keep `RunInTransactionPort` in the owning module's `domain/ports/`. Promote the
identical zero-dependency generic type to `shared/domain/ports/` only after a
real second module consumes it. Keep operation-specific capability bundles
beside their owning use cases.

## Functional Transaction Runners

Define the mechanism-independent capability:

```ts
export type RunInTransactionPort<Capabilities, TransactionError> =
  <T, E>(
    work: (
      capabilities: Capabilities,
    ) => Promise<Result<T, E>>,
  ) => Promise<Result<T, E | TransactionError>>;
```

Declare the exact bundle one operation needs:

```ts
export interface PlaceOrderTransactionCapabilities {
  readonly saveOrder: SaveOrderPort;
  readonly appendAuditEntry: AppendAuditEntryPort;
}

export interface PlaceOrderDependencies {
  readonly runInTransaction: RunInTransactionPort<
    PlaceOrderTransactionCapabilities,
    TransactionError
  >;
}
```

Use it from application code:

```ts
return dependencies.runInTransaction(
  async ({ saveOrder, appendAuditEntry }) => {
    const saved = await saveOrder({ order });
    if (!saved.ok) return saved;

    return appendAuditEntry({
      entry: makeOrderPlacedAuditEntry(order),
    });
  },
);
```

The concrete runner must:

1. Open the provider transaction.
2. Build all supplied ports against that transaction.
3. Invoke the callback.
4. Commit only for `Result.ok`.
5. Force rollback for `Result.err`.
6. Roll back thrown exceptions.
7. Translate recognized transaction-library failures.
8. Rethrow unexpected defects.

Many database callback APIs commit when the callback merely returns
`Result.err`. The adapter must explicitly signal rollback and then restore the
original error value. Verify this behavior against the actual provider API; do
not assume returning an error value rolls back.

The concrete runner belongs under the relevant outbound provider. Keep all
transaction-bound adapters in that provider subtree so one bundle cannot
silently mix transactional and non-transactional clients.

## Optimistic Concurrency

Apply optimistic concurrency when a mutable aggregate follows a
read-modify-write flow and lost updates are possible. Do not impose revisions
on immutable, append-only, or otherwise concurrency-safe data.

Expose the revision in domain terms:

```ts
export interface VersionedOrder {
  readonly order: Order;
  readonly revision: Revision;
}

export interface SaveOrderPortRequest {
  readonly order: Order;
  readonly expectedRevision: Revision;
}

export type SaveOrderPortError =
  | DatabaseUnavailable
  | {
      readonly type: "ConcurrencyConflict";
      readonly orderId: OrderId;
    };
```

The adapter performs one atomic conditional update:

```sql
UPDATE orders
SET status = ?, revision = revision + 1
WHERE id = ? AND revision = ?;
```

If no row is updated because the revision changed, return the tagged conflict.
The use case decides whether retry is safe. Do not hide a retry loop in the
adapter: retry policy depends on whether rerunning domain decisions and side
effects is valid.

When concurrency protection participates in a larger transaction, a conflict
must return `Result.err` so the runner rolls back every write in the bundle.

## Message Handling Outcomes

Keep broker policy in inbound infrastructure. A message presenter translates a
use-case result into a provider-neutral outcome:

```ts
export type MessageHandlingOutcome =
  | { readonly type: "Acknowledge" }
  | { readonly type: "Retry"; readonly delayMs?: number }
  | { readonly type: "Reject"; readonly reason: string };
```

Map each operation error deliberately:

- Successful processing -> `Acknowledge`
- Temporary dependency failure -> `Retry`
- Permanently invalid message or command -> `Reject`
- Completed business refusal that cannot improve on retry -> usually
  `Acknowledge`

The consumer alone translates that outcome into broker APIs such as ack/nack,
offset commit, visibility changes, or dead-letter routing. Use cases and domain
code know nothing about these mechanisms.

```ts
const outcome = presentReserveInventoryMessageResult(result);

switch (outcome.type) {
  case "Acknowledge":
    broker.ack(message);
    return;
  case "Retry":
    broker.retry(message, outcome.delayMs);
    return;
  case "Reject":
    broker.reject(message, outcome.reason);
    return;
}
```

`delayMs` expresses retry intent. The provider adapter must implement it only
through capabilities the chosen broker actually supports. Validate inbound
message DTOs and outbound message DTOs with separate Zod schemas.

Scheduled jobs, WebSocket events, and CLI commands follow the same architectural
rule: the mechanism registers and emits; a handler parses, maps, calls, and
presents; the use case remains mechanism-free.

## Domain Events

Use domain events only when immutable facts materially improve coordination or
reliable asynchronous delivery. Add `domain/events/` only when real event code
exists.

Model an event as a value:

```ts
export interface OrderPlaced {
  readonly type: "OrderPlaced";
  readonly eventId: EventId;
  readonly orderId: OrderId;
  readonly occurredAt: Instant;
}
```

Domain behavior may return new state together with event values:

```ts
Result<
  {
    readonly order: Order;
    readonly events: readonly OrderPlaced[];
  },
  PlaceOrderDomainError
>
```

Domain code never publishes through a broker, event bus, global registry, or
framework callback. The application decides what to persist or dispatch.

Prefer direct synchronous use-case or port coordination when reliability,
decoupling, and independent consumption do not justify an event flow.

## Transactional Outbox

Use an outbox when aggregate persistence and publication intent must be atomic.
Save both through one transaction-bound capability bundle:

```ts
return runInTransaction(
  async ({ saveOrder, appendOutboxEvent }) => {
    const saved = await saveOrder({ order });
    if (!saved.ok) return saved;

    return appendOutboxEvent({ event: orderPlaced });
  },
);
```

An infrastructure worker then:

1. Fetches pending outbox records.
2. Parses each record with Zod.
3. Hydrates or maps the domain event as required.
4. Maps the event to a provider-specific message DTO.
5. Validates the outbound DTO with Zod.
6. Publishes it.
7. Marks the record as published.

Assume at-least-once delivery. A crash between publish and mark can duplicate a
message. Give consumers idempotent operation semantics or explicit
deduplication keyed by a stable event or command ID.

Keep storage records, broker DTOs, schemas, and provider clients in
infrastructure. Keep the domain event free of retry counters, topic names,
partition keys, headers, and broker acknowledgment state.

## Reliability Decisions

Choose the smallest mechanism that satisfies the actual requirement:

| Requirement | Prefer |
| --- | --- |
| One atomic provider write | Direct port call |
| Several atomic writes in one provider | Transaction runner with a narrow bundle |
| Lost-update protection | Revision plus conditional update |
| Immediate required cross-feature result | Direct public use-case dependency |
| Best-effort asynchronous side effect | Provider adapter or job, if loss is acceptable |
| Persistence and publication must be atomic | Transactional outbox |
| Duplicate delivery is possible | Idempotent use case or deduplication |

Do not adopt events, retries, transactions, or an outbox merely for abstraction
purity. Each mechanism adds failure modes and operational state that the
application must intentionally own.
