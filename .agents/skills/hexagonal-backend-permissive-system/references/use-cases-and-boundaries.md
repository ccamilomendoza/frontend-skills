# Use Cases and Boundaries

Use this reference when designing domain values, smart constructors, ports,
application APIs, inbound handlers and presenters, or outbound persistence and
integration adapters.

## Contents

1. [Result and error values](#result-and-error-values)
2. [Entities and domain behavior](#entities-and-domain-behavior)
3. [Outbound capability ports](#outbound-capability-ports)
4. [Use-case shapes](#use-case-shapes)
5. [Inbound boundaries](#inbound-boundaries)
6. [Outbound boundaries](#outbound-boundaries)
7. [Absence and exception semantics](#absence-and-exception-semantics)

## Result and Error Values

Define a zero-dependency result primitive in `shared/domain/results/`:

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

Represent expected failures as values:

- invalid input shape
- domain invariant violation
- not found
- business authorization refusal
- dependency unavailable
- concurrency conflict
- recognized SDK or database failure

Use literal `type` discriminants and exhaustive switches. Give each port and use
case the smallest honest error union it can produce. Reuse stable shared
technical primitives verbatim, but keep operation-specific business variants
beside the owning operation.

```ts
export type PlaceOrderError =
  | OrderDomainError
  | SaveOrderPortError
  | { readonly type: "PlaceOrderNotAuthorized" };
```

Do not add `UnknownError` to every union. Programming bugs, invalid presenter
output, impossible internal state, and unrecognized library failures are
exceptions handled by one outer framework safety boundary.

## Entities and Domain Behavior

Use readonly object interfaces without methods, decorators, persistence
annotations, or framework types:

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

Model value-like concepts as object interfaces rather than branded primitive
aliases. Put cohesive pure behavior in `domain/services/`; do not use a
`Service` suffix.

### Smart constructors

Define each invariant once in domain:

```ts
export interface MakeOrderArgs {
  readonly id: string;
  readonly totalCents: number;
  readonly currency: string;
}

export type OrderDomainError =
  | { readonly type: "InvalidOrderId" }
  | { readonly type: "InvalidOrderTotal" }
  | {
      readonly type: "UnsupportedCurrency";
      readonly currency: string;
    };

export const makeOrder = (
  args: MakeOrderArgs,
): Result<Order, OrderDomainError> => {
  if (args.id.length === 0) return err({ type: "InvalidOrderId" });
  if (args.totalCents <= 0) return err({ type: "InvalidOrderTotal" });
  if (args.currency !== "USD") {
    return err({
      type: "UnsupportedCurrency",
      currency: args.currency,
    });
  }

  return ok({
    id: { value: args.id },
    total: { cents: args.totalCents, currency: args.currency },
    status: "pending",
  });
};
```

Keep structural validation and business validation distinct:

- Zod proves that untrusted data has the required wire or record shape.
- A smart constructor proves that parsed data represents a valid domain value.

Invoke the same constructor from two boundaries:

- For new or changed inbound values, the use case invokes it.
- When hydrating an existing value returned by an external dependency, the
  outbound adapter invokes it before satisfying the port.

Adapters never reimplement invariants. Use cases do not revalidate values
already promised as valid by a port.

## Outbound Capability Ports

Describe what the core needs in domain language:

```ts
export interface FetchOrderPortRequest {
  readonly orderId: OrderId;
}

export type FetchOrderPortError =
  | DatabaseUnavailable
  | ParseError
  | OrderDomainError
  | {
      readonly type: "OrderNotFound";
      readonly orderId: OrderId;
    };

export type FetchOrderPort = (
  request: FetchOrderPortRequest,
) => Promise<Result<Order, FetchOrderPortError>>;
```

Use one narrow port per capability. Accept one operation-specific request
object. Do not define generic CRUD repositories or expose query builders, ORM
models, transactions, rows, DTOs, schemas, or provider clients.

Keep asynchronous capabilities asynchronous and synchronous capabilities
synchronous. Do not wrap pure clock or ID-generation functions in promises
merely for consistency.

## Use-Case Shapes

Bind stable dependencies in a curried factory and receive execution-time values
through one explicit object:

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

export type PlaceOrder = (
  args: PlaceOrderArgs,
) => Promise<Result<Order, PlaceOrderError>>;

export type PlaceOrderUseCase = (
  dependencies: PlaceOrderDependencies,
) => PlaceOrder;

export const makePlaceOrderUseCase: PlaceOrderUseCase =
  (dependencies) =>
  async (args) => {
    const order = makeOrder({
      id: args.orderId,
      totalCents: args.totalCents,
      currency: args.currency,
    });

    if (!order.ok) return order;
    if (!canPlaceOrder(args.actor, order.value)) {
      return err({ type: "PlaceOrderNotAuthorized" });
    }

    return dependencies.saveOrder({ order: order.value });
  };
```

Pass new or changed request values as primitives in `Args`; let the use case
invoke domain constructors. Already-established context such as a verified
`Actor` may enter as a domain value.

Pass every business-relevant value explicitly. Do not pass a generic
`RequestContext`, framework request, logger, trace span, raw cancellation
signal, dependency container, ORM client, or transaction handle.

Return `Result<T, E>` for synchronous work and `Promise<Result<T, E>>` for
asynchronous work. A dependency-free use case is a direct function; do not
invent an empty `Dependencies` interface or no-op factory.

Treat `application/use-cases/` as the feature's public behavioral surface. A
public use-case contract may include application-owned result projections when
consumers must not import the provider's private domain entity.

## Inbound Boundaries

Organize each inbound mechanism around these roles when needed:

| Folder | Responsibility |
| --- | --- |
| `routes/`, `consumers/`, `schedules/`, `events/`, `commands/` | Register a handler with the runtime |
| `handlers/` | Coordinate parse, map, call, present, validate, and emit |
| `middlewares/` | Technical cross-cutting framework concerns |
| `dtos/` | Raw protocol contract types |
| `schemas/` | Zod schemas for unknown inputs and public outputs |
| `mappers/` | Pure total shape transformations |
| `presenters/` | Exhaustive `Result` to mechanism-outcome translation |

Do not add an inbound port or controller interface in front of a use case. The
use-case callable already is the driving port.

### Handler pipeline

For HTTP:

```text
params + query + headers + body as unknown
  -> safeParse request schema
  -> HttpRequestDto
  -> transform...DtoTo...Args
  -> use case
  -> present...HttpResult
  -> validate success or error response DTO
  -> status + headers + body
  -> framework reply
```

Apply the same shape to messages, WebSocket frames, job payloads, and CLI
arguments. Use `safeParse` for expected input failures. Map a request parse
failure to a validated public outcome.

Output schemas may use `parse`: an invalid presenter DTO is a programming
defect and should reach the outer safety boundary. Validate public success and
error DTOs in every environment.

### DTOs and mappers

Include mechanism and direction in protocol names:

```text
CreateOrderHttpRequestDto
OrderHttpResponseDto
OrderPlacedMessageDto
```

Do not share DTOs or schemas merely because two protocols currently have the
same shape. Mappers transform shapes without protocol policy:

```text
transformCreateOrderHttpRequestDtoToPlaceOrderArgs
transformOrderToOrderHttpResponseDto
```

Keep mappers pure and total. Map new request values to primitive application
arguments rather than constructing new domain entities at the edge.

### Presenters

A presenter interprets the whole operation result:

```text
Result<Order, PlaceOrderError>
  -> { status: 201, body: OrderHttpResponseDto }
   | { status: 403, body: PublicErrorHttpResponseDto }
   | { status: 409, body: PublicErrorHttpResponseDto }
   | { status: 503, body: PublicErrorHttpResponseDto }
```

Map every variant exhaustively. Never expose raw exception messages, database
details, stack traces, provider payloads, or private domain state.

## Outbound Boundaries

Treat every database row, API response, cache value, storage object, or broker
payload as `unknown`:

```text
unknown
  -> Zod Record or Dto schema
  -> validated Record or Dto
  -> total mapper
  -> Make<Entity>Args
  -> make<Entity>
  -> Result<Entity, PortError>
```

Persistence shapes use `Record`; external wire shapes use `Dto`:

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

Name mappers after the explicit boundary:

```text
transformOrderRecordToMakeOrderArgs
transformOrderToOrderRecord
transformStripeChargeDtoToMakeReceiptArgs
```

A read or write returning data must parse the returned value even when this
application originally wrote it. External state can drift independently of
the application's assumptions.

## Absence and Exception Semantics

Let operation names express absence:

- `FetchOrderPort`: missing is a tagged `OrderNotFound` error.
- `FindOrderByExternalIdPort`: missing is `ok(null)`.
- `SearchOrdersPort`: no matches is `ok([])`.

An HTTP presenter normally maps a missing required resource to `404`. Use `204`
for successful completion with no content, not as the default for absence.

Catch and translate only recognized library failures:

```ts
try {
  // SDK or database call
} catch (cause) {
  if (isUniqueViolation(cause)) {
    return err({ type: "OrderAlreadyExists" });
  }
  if (isConnectionFailure(cause)) {
    return err({ type: "DatabaseUnavailable" });
  }
  throw cause;
}
```

One framework-level safety boundary logs unexpected defects and emits a generic
mechanism response. Do not collapse arbitrary exceptions into expected domain
errors.
