# Hexagonal Backend — Permissive: Reference

Read `SKILL.md` first. This reference expands the layer rules, boundary
pipelines, functional shapes, composition model, and optional reliable-messaging
pattern.

## Contents

1. [Dependency model](#1-dependency-model)
2. [Domain layer](#2-domain-layer)
3. [Application layer](#3-application-layer)
4. [Inbound infrastructure](#4-inbound-infrastructure)
5. [Outbound infrastructure](#5-outbound-infrastructure)
6. [Transactions and concurrency](#6-transactions-and-concurrency)
7. [Module interaction and shared](#7-module-interaction-and-shared)
8. [Hybrid composition](#8-hybrid-composition)
9. [Result, errors, and exceptions](#9-result-errors-and-exceptions)
10. [Optional domain events and outbox](#10-optional-domain-events-and-outbox)
11. [Enforcement sketch](#11-enforcement-sketch)

## 1. Dependency model

Each feature is a bounded context:

```text
infrastructure → application → domain
```

Dependencies point inward. The allowed responsibilities are:

| Layer | Owns | Must not own |
|---|---|---|
| Domain | Entities, invariants, pure behavior, outbound capability ports | Zod, framework types, I/O, orchestration |
| Application | Use-case orchestration, authorization decisions, operation errors | Protocol status, request objects, ORM clients |
| Infrastructure | Parsing, frameworks, I/O, adapters, presenters, registration, composition | Business invariants |

Within infrastructure:

```text
compositions/
inbound/<mechanism>/
outbound/<capability>/<provider>/
```

- `inbound/` means an external mechanism drives the application.
- `outbound/` means the application calls an external capability.
- `compositions/` is the only module-local place that may construct both sides.

Group inbound code by invocation mechanism. Its subtree may contain one concrete
framework/provider directly; add a provider scope only when multiple
implementations coexist. Group outbound code by capability and then provider.
HTTP and message DTOs remain separate even when their fields happen to match.

## 2. Domain layer

### Entities

Use readonly object interfaces with no methods:

```ts
export interface OrderId {
  readonly value: string;
}

export interface Money {
  readonly cents: number;
  readonly currency: string;
}

export interface Order {
  readonly id: OrderId;
  readonly total: Money;
  readonly status: "pending" | "paid" | "cancelled";
}
```

Value-like concepts are also object interfaces, not branded primitive aliases.
Behavior lives in pure functions.

### Smart constructors and invariants

Define business invariants once in domain:

```ts
export interface MakeOrderArgs {
  readonly id: string;
  readonly totalCents: number;
  readonly currency: string;
}

export type OrderDomainError =
  | { readonly type: "InvalidOrderId" }
  | { readonly type: "InvalidOrderTotal" }
  | { readonly type: "UnsupportedCurrency"; readonly currency: string };

export const makeOrder = (
  args: MakeOrderArgs,
): Result<Order, OrderDomainError> => {
  if (args.id.length === 0) return err({ type: "InvalidOrderId" });
  if (args.totalCents <= 0) return err({ type: "InvalidOrderTotal" });
  if (args.currency !== "USD")
    return err({ type: "UnsupportedCurrency", currency: args.currency });

  return ok({
    id: { value: args.id },
    total: { cents: args.totalCents, currency: args.currency },
    status: "pending",
  });
};
```

Keep structural validation and business validation distinct:

- Zod answers whether external data has the required wire shape.
- Smart constructors answer whether the data represents a valid domain value.

Invoke the same smart constructor at two different boundaries:

- **New or changed inbound values:** the use case invokes it.
- **Hydrating an existing entity from an outbound read:** the adapter invokes
  it before satisfying the port contract.

Adapters never reimplement invariants; use cases do not revalidate entities
already returned by a port.

### Domain services

Place cohesive pure behavior in `domain/services/`. Do not use a `Service`
suffix.

```ts
export const canRefundOrder = (actor: Actor, order: Order): boolean =>
  actor.customerId.value === order.customerId.value &&
  order.status === "paid";
```

The moment behavior requires I/O, it becomes application orchestration backed
by a port.

### Outbound capability ports

Ports describe what the core needs, not the shape of a database or SDK:

```ts
export interface FetchOrderPortRequest {
  readonly orderId: OrderId;
}

export type FetchOrderPortError =
  | DatabaseUnavailable
  | ParseError
  | OrderDomainError
  | { readonly type: "OrderNotFound"; readonly orderId: OrderId };

export type FetchOrderPort = (
  request: FetchOrderPortRequest,
) => Promise<Result<Order, FetchOrderPortError>>;
```

Use one narrow port per capability. Do not define `Repository<T>` or expose
query builders, ORM models, database transactions, rows, DTOs, or Zod types.

## 3. Application layer

### Use-case shape

Bind stable dependencies in a curried factory. Receive operation data at
execution time:

```ts
export interface PlaceOrderDependencies {
  readonly saveOrder: SaveOrderPort;
}

export interface PlaceOrderArgs {
  readonly actor: Actor;
  readonly orderId: string;
  readonly totalCents: number;
  readonly currency: string;
}

export type PlaceOrderError =
  | OrderDomainError
  | SaveOrderPortError
  | { readonly type: "PlaceOrderNotAuthorized" };

export type PlaceOrderUseCase = (
  dependencies: PlaceOrderDependencies,
) => (
  args: PlaceOrderArgs,
) => Promise<Result<Order, PlaceOrderError>>;
```

Keep return types honest:

- Synchronous work returns `Result<T, E>`.
- Asynchronous work returns `Promise<Result<T, E>>`.
- A dependency-free use case is a direct function; do not create an empty
  `Dependencies` interface.

### Application arguments

Inbound mappers produce primitive `Args` for newly supplied or changed values.
The use case invokes domain constructors:

```ts
const order = makeOrder({
  id: args.orderId,
  totalCents: args.totalCents,
  currency: args.currency,
});

if (!order.ok) return order;
```

Already-established context may enter as a domain value. The canonical example
is a verified `Actor` created by authentication infrastructure.

Do not pass a generic `RequestContext`, framework request, logger, client IP,
trace span, raw cancellation signal, or dependency container. Pass each
business-relevant value explicitly. If client IP becomes a legal audit
requirement, add that specific value to that use case's `Args`.

### Authentication and authorization

Split the responsibilities:

1. Inbound infrastructure extracts and verifies credentials.
2. It parses verified claims and creates a framework-free `Actor`.
3. The handler passes `actor` explicitly to the use case.
4. The use case decides whether the actor may perform the operation.
5. Reusable pure authorization rules live in domain services.

Middleware may reject invalid credentials. It must not decide business
authorization.

## 4. Inbound infrastructure

### Mechanism-first roles

Under each inbound mechanism, use these roles when needed:

| Folder | Responsibility |
|---|---|
| `routes/`, `consumers/`, `schedules/`, `events/`, `commands/` | Register a handler with the runtime |
| `handlers/` | Coordinate parse → map → use case → present → emit |
| `middlewares/` | Technical cross-cutting framework concerns |
| `dtos/` | Raw protocol contract types |
| `schemas/` | Zod schemas for all unknown inputs and public outputs |
| `mappers/` | Pure total shape transformations |
| `presenters/` | Exhaustive `Result` → mechanism-outcome translation |

Do not create an inbound port/controller interface in front of a use case. The
use-case function type already is the driving port.

### Handler pipeline

For HTTP:

```text
params + query + headers + body as unknown
  → safeParse request schema
  → HttpRequestDto
  → transform...DtoTo...Args
  → use case
  → present...HttpResult
  → validate success/error response DTO
  → status + headers + body
  → framework reply
```

Apply the same structure to queue messages, WebSocket frames, job payloads, and
CLI arguments.

Use `safeParse` for expected input failure. A request parse error becomes a
validated public mechanism outcome. Output schemas may use `parse`: a presenter
producing an invalid public DTO is a programming defect and belongs at the
outer safety boundary.

### Mappers and presenters

Mappers transform shapes without protocol policy:

```ts
transformCreateOrderHttpRequestDtoToPlaceOrderArgs
transformOrderToOrderHttpResponseDto
```

Presenters interpret the whole operation result:

```ts
Result<Order, PlaceOrderError>
  → { status: 201, body: OrderHttpResponseDto }
  | { status: 403, body: PublicErrorHttpResponseDto }
  | { status: 409, body: PublicErrorHttpResponseDto }
  | { status: 503, body: PublicErrorHttpResponseDto }
```

Map exhaustively. Never expose raw infrastructure exception messages, database
details, stack traces, or private domain state.

### Middleware

Middleware may handle:

- Authentication
- Request/message IDs
- Tracing
- Generic logging
- CORS and protocol security headers
- Body size and rate limits

Middleware must not:

- Invoke use cases
- Apply business invariants
- Enforce business authorization
- Replace operation-specific Zod schemas
- Map use-case errors

### Cancellation and deadlines

Keep client disconnects, technical timeouts, and `AbortSignal` in
infrastructure. Bind request-scoped outbound adapters to the signal when
cancellation matters. Do not put the signal in application `Args`.

A deadline enters application/domain only when it has business meaning, such as
an auction close or payment cutoff.

### Message outcomes

Message presenters return a broker-neutral outcome:

```ts
export type MessageHandlingOutcome =
  | { readonly type: "Acknowledge" }
  | { readonly type: "Retry"; readonly delayMs?: number }
  | { readonly type: "Reject"; readonly reason: string };
```

Map each use-case error deliberately:

- Successful processing → `Acknowledge`
- Temporary dependency failure → `Retry`
- Permanently invalid message/command → `Reject`
- A valid business refusal may still → `Acknowledge`

The consumer translates this outcome into the broker API: ack/nack, offset
commit, visibility change, or dead-letter routing. Use cases know none of these.
`delayMs` expresses retry intent; the provider adapter must implement it using
capabilities the chosen broker actually supports.

## 5. Outbound infrastructure

### Fat read adapter

Treat every dependency response as `unknown`:

```text
unknown
  → Zod Record/Dto schema
  → validated Record/Dto
  → total mapper
  → Make<Entity>Args
  → make<Entity>
  → Result<Entity, PortError>
```

Persistence shapes use `Record`; external wire shapes use `Dto`.

```ts
export interface OrderRecord {
  readonly id: string;
  readonly total_cents: number;
  readonly currency: string;
  readonly status: string;
  readonly revision: number;
}

export const orderRecordSchema = z.object({
  id: z.string(),
  total_cents: z.number().int(),
  currency: z.string(),
  status: z.string(),
  revision: z.number().int().nonnegative(),
}) satisfies z.ZodType<OrderRecord>;
```

Mapper names expose the boundary:

```ts
transformOrderRecordToMakeOrderArgs
transformOrderToOrderRecord
transformStripeChargeDtoToMakeReceiptArgs
```

### Exceptions

Wrap only expected library failures:

```ts
try {
  // SDK/database call
} catch (cause) {
  if (isUniqueViolation(cause))
    return err({ type: "OrderAlreadyExists" });
  if (isConnectionFailure(cause))
    return err({ type: "DatabaseUnavailable" });
  throw cause;
}
```

Do not convert arbitrary defects into an `UnknownError` variant. One outer
framework safety boundary logs unexpected failures and emits a generic
mechanism response.

### Absence semantics

Let the operation name state whether absence is expected:

- `FetchOrderPort` → missing is `OrderNotFound` in the error union.
- `FindOrderByExternalIdPort` → missing is `ok(null)`.
- `SearchOrdersPort` → no matches is `ok([])`.

An HTTP presenter normally maps required-resource `NotFound` to `404`.
`204` represents successful completion with no content; it is not the default
for a missing required resource.

## 6. Transactions and concurrency

### Transaction ownership

The use case decides which work must be atomic. Infrastructure owns the
transaction mechanism. Domain functions and inbound handlers own neither.

Inject a functional transaction runner that supplies transaction-bound
capabilities:

```ts
export type RunInTransactionPort<Capabilities, TransactionError> =
  <T, E>(
    work: (
      capabilities: Capabilities,
    ) => Promise<Result<T, E>>,
  ) => Promise<Result<T, E | TransactionError>>;
```

Place this port in the owning feature's `domain/ports/`. If a real second module
needs the identical zero-dependency generic type, promote only that generic type
to `shared/domain/ports/`. Keep the operation-specific capability bundle beside
the owning use case and the concrete runner adapter under the relevant outbound
provider.

Use it from application code:

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

The runner:

1. Opens the concrete transaction.
2. Builds port implementations bound to it.
3. Invokes the callback.
4. Commits only for `Result.ok`.
5. Forces rollback for `Result.err`.
6. Rolls back thrown exceptions.
7. Translates expected transaction-library failures.
8. Rethrows unexpected defects.

Many database APIs commit when a callback merely returns `Result.err`; adapters
must explicitly trigger rollback and then restore the error value. Never expose
an ORM transaction object or use ambient/global transaction state in the core.

### Optimistic concurrency

Use revisions when mutable aggregates can suffer lost updates:

```ts
export interface VersionedOrder {
  readonly order: Order;
  readonly revision: Revision;
}

export interface SaveOrderPortRequest {
  readonly order: Order;
  readonly expectedRevision: Revision;
}
```

The adapter performs one atomic conditional update:

```sql
UPDATE orders
SET status = ?, revision = revision + 1
WHERE id = ? AND revision = ?;
```

If no row is updated because the revision changed, return a tagged
`ConcurrencyConflict`. The use case decides whether retry is safe. Do not impose
revisions on immutable, append-only, or otherwise concurrency-safe data.

## 7. Module interaction and shared

### Feature → feature

A feature may import only another feature's `application/use-cases/**`.

When checkout needs user behavior:

1. Checkout imports the user use-case type/factory.
2. Checkout declares the bound function as a dependency.
3. Composition injects it.
4. User must not depend back on checkout.

“Import directly” refers to the public use-case type/factory at source level.
The consuming application declares that function as a dependency; hybrid
composition supplies the already-bound runtime function. It does not mean the
consumer constructs or imports sibling infrastructure.

The dependency graph must remain acyclic. If `A → B` and `B → A` appears,
change ownership, extract eligible pure logic to `shared`, or invert one
direction through an appropriate shared port.

Do not import sibling entities, services, ports, DTOs, schemas, adapters,
handlers, or compositions.

### Shared leaf kernel

`shared` is a dependency sink. Everyone may import it; it imports no feature at
runtime.

Eligible contents:

- `Result` and helpers
- Shared technical error primitives
- Stable shared IDs/value concepts
- Genuinely shared pure domain logic
- Generic leaf ports such as `Clock`
- Generic technical infrastructure foundations

Forbidden contents:

- Use cases
- Runtime orchestration
- Feature repositories or integrations
- Feature handlers/presenters
- Feature DTOs and message contracts

Use the rule of two: start code in its owning feature and promote only after a
real second consumer appears. Prefer duplication when bounded contexts model a
similar concept differently. “Reusable” alone is not enough; shared code must
remain a stable leaf with no runtime fan-out.

## 8. Hybrid composition

### Module-owned wiring

Each feature owns construction under `infrastructure/compositions/`:

```text
modules/orders/infrastructure/compositions/
  compose-order-use-cases.ts
  register-order-http.ts
  register-order-consumers.ts
```

Module composition may import:

- Its own application/domain/infrastructure
- Shared code
- Public sibling use-case functions/types supplied as explicit dependencies

It must not construct or import sibling infrastructure.

### Minimal process root

`src/main/` owns only application-wide runtime concerns:

```text
main/
  entries/
    api.ts
    worker.ts
    cli.ts
```

An entry point may:

- Create shared database, HTTP, broker, and storage clients
- Call module composition/registration functions
- Pass one module's public bound use case to another module's composition
- Start and stop the process

It must not contain business rules, request schemas, DTO mappers, presenters,
repository implementations, or use-case error mapping.

```ts
const database = makeDatabasePool(config);
const broker = makeBrokerClient(config);
const http = makeHttpServer(config);

const users = composeUsersModule({ database, http });

composeCheckoutModule({
  database,
  http,
  fetchCurrentUser: users.fetchCurrentUser,
});

await http.start();
```

The root may import module compositions as an explicit boundary exception.
Modules never import `main/`.

## 9. Result, errors, and exceptions

Keep the shared result zero-dependency:

```ts
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({
  ok: true,
  value,
});

export const err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error,
});
```

Each port and use case defines only the errors it can actually produce:

```ts
export type PlaceOrderError =
  | OrderDomainError
  | SaveOrderPortError
  | { readonly type: "PlaceOrderNotAuthorized" };
```

Use literal `type` discriminants and exhaustive switches:

```ts
export const assertNever = (value: never): never => {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
};
```

Expected failures are values:

- Invalid request shape
- Domain invariant violation
- Not found
- Authorization refusal
- Dependency unavailable
- Concurrency conflict
- Known SDK/database failures

Unexpected defects are exceptions:

- Impossible presenter output
- Programming bugs
- Unrecognized library failures
- Violated internal assumptions

Do not add an `UnknownError` escape hatch to every union.

## 10. Optional domain events and outbox

Use this pattern only when asynchronous side effects must be reliable.

### Domain event as a value

Add `domain/events/` only when needed:

```ts
export interface OrderPlaced {
  readonly type: "OrderPlaced";
  readonly eventId: EventId;
  readonly orderId: OrderId;
  readonly occurredAt: Instant;
}
```

Domain behavior may return the new state and immutable event values:

```ts
Result<
  {
    readonly order: Order;
    readonly events: readonly OrderPlaced[];
  },
  PlaceOrderDomainError
>
```

Domain code never publishes through a broker or global event bus.

### Transactional outbox

When aggregate persistence and publication intent must be atomic, save both
through one transaction-bound capability bundle:

```ts
runInTransaction(async ({ saveOrder, appendOutboxEvent }) => {
  const saved = await saveOrder({ order });
  if (!saved.ok) return saved;

  return appendOutboxEvent({ event: orderPlaced });
});
```

An infrastructure worker:

1. Fetches pending outbox records.
2. Zod-parses each record.
3. Maps the domain event to a provider-specific message DTO.
4. Zod-validates the DTO.
5. Publishes it.
6. Marks the outbox record published.

Assume at-least-once delivery. A crash between publishing and marking can
produce duplicates, so consumers need idempotent operation semantics or
deduplication. Keep broker acknowledgment decisions in message presenters.

Prefer direct synchronous use-case/port coordination when these reliability and
decoupling requirements do not exist.

## 11. Enforcement sketch

Use `eslint-plugin-boundaries`, `no-restricted-imports`, and a cycle detector.
Enforce:

- `domain/**` imports only its own domain and allowed `shared/domain/**`.
- `application/**` imports its own domain, shared domain, and sibling
  `application/use-cases/**` only.
- `inbound/**` may import its own application/domain/shared and framework
  packages, but not `outbound/**`.
- `outbound/**` may import its own domain/shared and provider packages, but not
  `inbound/**` or application orchestration.
- `compositions/**` may import both sides of its own feature and receive sibling
  public use cases.
- `main/**` imports module compositions, never deep feature adapters or domain
  internals.
- Feature-to-feature imports target only the owner's
  `application/use-cases/**`.
- `shared/**` imports no feature module.
- Zod appears only in infrastructure.
- The feature dependency graph is acyclic.
- No barrel `index.ts` files.
- No loose layer-root files.
- Concept folders are plural; mechanism/provider scope names are exempt.
- No empty speculative folders are scaffolded.
