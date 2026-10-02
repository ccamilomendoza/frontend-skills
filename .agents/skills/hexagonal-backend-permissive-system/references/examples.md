# Worked Examples

Use these examples to connect folder placement, domain hydration, inbound and
outbound validation, permissive cross-module composition, transactions, and
message outcomes.

## Contents

1. [Order creation from HTTP to Postgres](#order-creation-from-http-to-postgres)
2. [Permissive cross-module composition](#permissive-cross-module-composition)
3. [Atomic approval with optimistic concurrency](#atomic-approval-with-optimistic-concurrency)
4. [Message acknowledgment outcome](#message-acknowledgment-outcome)

## Order Creation from HTTP to Postgres

### Feature tree

```text
src/modules/orders/
  domain/
    entities/order.ts
    ports/save-order-port.ts
    services/order-creation.ts
  application/
    use-cases/place-order.ts
  infrastructure/
    compositions/register-orders-http.ts
    inbound/http/
      routes/create-order-route.ts
      handlers/create-order-http-handler.ts
      dtos/create-order-http-request-dto.ts
      dtos/order-http-response-dto.ts
      schemas/create-order-http-request-dto-schema.ts
      schemas/order-http-response-dto-schema.ts
      mappers/create-order-http-request-dto-to-place-order-args.ts
      mappers/order-to-order-http-response-dto.ts
      presenters/place-order-http-result.ts
    outbound/persistence/postgres/
      adapters/save-order-postgres-adapter.ts
      records/order-record.ts
      schemas/order-record-schema.ts
      mappers/order-record-to-make-order-args.ts
```

### Domain value and constructor

```ts
export interface Order {
  readonly id: OrderId;
  readonly customerId: CustomerId;
  readonly total: Money;
  readonly status: "pending";
}

export interface MakeOrderArgs {
  readonly id: string;
  readonly customerId: string;
  readonly totalCents: number;
  readonly currency: string;
}

export type OrderDomainError =
  | { readonly type: "InvalidOrderId" }
  | { readonly type: "InvalidCustomerId" }
  | { readonly type: "InvalidOrderTotal" }
  | {
      readonly type: "UnsupportedCurrency";
      readonly currency: string;
    };

export const makeOrder = (
  args: MakeOrderArgs,
): Result<Order, OrderDomainError> => {
  if (args.id.length === 0) return err({ type: "InvalidOrderId" });
  if (args.customerId.length === 0) {
    return err({ type: "InvalidCustomerId" });
  }
  if (args.totalCents <= 0) return err({ type: "InvalidOrderTotal" });
  if (args.currency !== "USD") {
    return err({
      type: "UnsupportedCurrency",
      currency: args.currency,
    });
  }

  return ok({
    id: { value: args.id },
    customerId: { value: args.customerId },
    total: { cents: args.totalCents, currency: args.currency },
    status: "pending",
  });
};
```

### Port and use case

```ts
export interface SaveOrderPortRequest {
  readonly order: Order;
}

export type SaveOrderPortError =
  | DatabaseUnavailable
  | ParseError
  | OrderDomainError
  | { readonly type: "OrderAlreadyExists" };

export type SaveOrderPort = (
  request: SaveOrderPortRequest,
) => Promise<Result<Order, SaveOrderPortError>>;
```

```ts
export interface PlaceOrderDependencies {
  readonly saveOrder: SaveOrderPort;
}

export interface PlaceOrderArgs {
  readonly actor: Actor;
  readonly orderId: string;
  readonly customerId: string;
  readonly totalCents: number;
  readonly currency: string;
}

export type PlaceOrderError =
  | OrderDomainError
  | SaveOrderPortError
  | { readonly type: "PlaceOrderNotAuthorized" };

export type PlaceOrder = (
  args: PlaceOrderArgs,
) => Promise<Result<Order, PlaceOrderError>>;

export const makePlaceOrderUseCase =
  (dependencies: PlaceOrderDependencies): PlaceOrder =>
  async (args) => {
    const order = makeOrder({
      id: args.orderId,
      customerId: args.customerId,
      totalCents: args.totalCents,
      currency: args.currency,
    });

    if (!order.ok) return order;
    if (args.actor.customerId.value !== order.value.customerId.value) {
      return err({ type: "PlaceOrderNotAuthorized" });
    }

    return dependencies.saveOrder({ order: order.value });
  };
```

New request values remain primitive until the use case calls `makeOrder`.
`actor` is already-established authenticated context.

### Postgres adapter

```ts
export interface OrderRecord {
  readonly id: string;
  readonly customer_id: string;
  readonly total_cents: number;
  readonly currency: string;
  readonly status: "pending";
}

export const orderRecordSchema = z.object({
  id: z.string(),
  customer_id: z.string(),
  total_cents: z.number().int(),
  currency: z.string(),
  status: z.literal("pending"),
}) satisfies z.ZodType<OrderRecord>;

export const transformOrderRecordToMakeOrderArgs = (
  record: OrderRecord,
): MakeOrderArgs => ({
  id: record.id,
  customerId: record.customer_id,
  totalCents: record.total_cents,
  currency: record.currency,
});
```

```ts
export const makeSaveOrderPostgresAdapter =
  (
    dependencies: SaveOrderPostgresAdapterDependencies,
  ): SaveOrderPort =>
  async ({ order }) => {
    try {
      const unknownRecord: unknown =
        await dependencies.database.queryOne(
          `INSERT INTO orders
             (id, customer_id, total_cents, currency, status)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            order.id.value,
            order.customerId.value,
            order.total.cents,
            order.total.currency,
            order.status,
          ],
        );

      const parsed = orderRecordSchema.safeParse(unknownRecord);
      if (!parsed.success) {
        return err({
          type: "ParseError",
          issues: parsed.error.issues.map(String),
        });
      }

      return makeOrder(
        transformOrderRecordToMakeOrderArgs(parsed.data),
      );
    } catch (cause) {
      if (isUniqueViolation(cause)) {
        return err({ type: "OrderAlreadyExists" });
      }
      if (isDatabaseUnavailable(cause)) {
        return err({ type: "DatabaseUnavailable" });
      }
      throw cause;
    }
  };
```

The adapter parses and hydrates the row even though this application wrote it.

### HTTP boundary

```ts
export interface CreateOrderHttpRequestDto {
  readonly body: {
    readonly orderId: string;
    readonly customerId: string;
    readonly totalCents: number;
    readonly currency: string;
  };
}

export const createOrderHttpRequestDtoSchema = z.object({
  body: z.object({
    orderId: z.string(),
    customerId: z.string(),
    totalCents: z.number().int(),
    currency: z.string(),
  }),
}) satisfies z.ZodType<CreateOrderHttpRequestDto>;

export const transformCreateOrderHttpRequestDtoToPlaceOrderArgs = (
  dto: CreateOrderHttpRequestDto,
  actor: Actor,
): PlaceOrderArgs => ({
  actor,
  orderId: dto.body.orderId,
  customerId: dto.body.customerId,
  totalCents: dto.body.totalCents,
  currency: dto.body.currency,
});
```

The presenter exhaustively maps both success and error values and validates the
public DTO it emits:

```ts
export const presentPlaceOrderHttpResult = (
  result: Result<Order, PlaceOrderError>,
): PlaceOrderHttpOutcome => {
  if (result.ok) {
    return {
      status: 201,
      body: orderHttpResponseDtoSchema.parse(
        transformOrderToOrderHttpResponseDto(result.value),
      ),
    };
  }

  switch (result.error.type) {
    case "PlaceOrderNotAuthorized":
      return presentError(403, "NOT_AUTHORIZED", "Order not allowed");
    case "OrderAlreadyExists":
      return presentError(409, "ORDER_EXISTS", "Order already exists");
    case "InvalidOrderId":
    case "InvalidCustomerId":
    case "InvalidOrderTotal":
    case "UnsupportedCurrency":
      return presentError(422, "INVALID_ORDER", "Order is invalid");
    case "DatabaseUnavailable":
      return presentError(503, "UNAVAILABLE", "Please retry later");
    case "ParseError":
      return presentError(500, "INTERNAL_ERROR", "Internal error");
    default:
      return assertNever(result.error);
  }
};
```

The handler remains mechanical:

```ts
export const makeCreateOrderHttpHandler =
  (dependencies: CreateOrderHttpHandlerDependencies) =>
  async (
    request: AuthenticatedHttpRequest,
    reply: HttpReply,
  ): Promise<void> => {
    const parsed = createOrderHttpRequestDtoSchema.safeParse({
      body: request.body,
    });

    if (!parsed.success) {
      const outcome = presentInvalidCreateOrderHttpRequest();
      reply.status(outcome.status).send(outcome.body);
      return;
    }

    const result = await dependencies.placeOrder(
      transformCreateOrderHttpRequestDtoToPlaceOrderArgs(
        parsed.data,
        request.actor,
      ),
    );

    const outcome = presentPlaceOrderHttpResult(result);
    reply.status(outcome.status).send(outcome.body);
  };
```

### Module composition

```ts
export const registerOrdersHttp = (
  dependencies: RegisterOrdersHttpDependencies,
): PlaceOrder => {
  const saveOrder = makeSaveOrderPostgresAdapter({
    database: dependencies.database,
  });
  const placeOrder = makePlaceOrderUseCase({ saveOrder });
  const handler = makeCreateOrderHttpHandler({ placeOrder });

  registerCreateOrderRoute(dependencies.http, handler);
  return placeOrder;
};
```

Returning a bound public use case allows `src/main/` to inject it into another
module without exposing the orders infrastructure.

## Permissive Cross-Module Composition

Suppose `checkout` needs current-user behavior owned by `users`.

```ts
// modules/users/application/use-cases/fetch-current-user.ts
export interface CurrentUser {
  readonly id: string;
  readonly verified: boolean;
}

export type FetchCurrentUser = (
  args: FetchCurrentUserArgs,
) => Promise<Result<CurrentUser, FetchCurrentUserError>>;
```

`CurrentUser` is part of the application contract, so checkout does not import
the user's private domain entity.

```ts
// modules/checkout/application/use-cases/start-checkout.ts
import type {
  FetchCurrentUser,
  FetchCurrentUserError,
} from "../../../users/application/use-cases/fetch-current-user";

export interface StartCheckoutDependencies {
  readonly fetchCurrentUser: FetchCurrentUser;
  readonly saveCheckout: SaveCheckoutPort;
}

export type StartCheckoutError =
  | FetchCurrentUserError
  | SaveCheckoutPortError
  | { readonly type: "UserNotVerified" };
```

The process root supplies the bound callable:

```ts
const database = makeDatabasePool(config);
const http = makeHttpServer(config);

const users = registerUsersHttp({ database, http });

registerCheckoutHttp({
  database,
  http,
  fetchCurrentUser: users.fetchCurrentUser,
});

await http.start();
```

The graph is `checkout -> users -> shared`. `checkout` imports only the public
user use case, and `users` does not depend back on `checkout`.

## Atomic Approval with Optimistic Concurrency

An approval must update an order and append an audit entry atomically:

```ts
export interface ApproveOrderTransactionCapabilities {
  readonly saveOrder: SaveOrderPort;
  readonly appendAuditEntry: AppendAuditEntryPort;
}

export interface ApproveOrderDependencies {
  readonly runInTransaction: RunInTransactionPort<
    ApproveOrderTransactionCapabilities,
    TransactionError
  >;
}

export const makeApproveOrderUseCase =
  (dependencies: ApproveOrderDependencies) =>
  async (
    args: ApproveOrderArgs,
  ): Promise<Result<Order, ApproveOrderError>> => {
    const approved = approveOrder(args.order, args.actor);
    if (!approved.ok) return approved;

    return dependencies.runInTransaction(
      async ({ saveOrder, appendAuditEntry }) => {
        const saved = await saveOrder({
          order: approved.value,
          expectedRevision: args.revision,
        });

        if (!saved.ok) return saved;

        const audited = await appendAuditEntry({
          entry: makeOrderApprovedAuditEntry(
            approved.value,
            args.actor,
          ),
        });

        if (!audited.ok) return audited;
        return ok(approved.value);
      },
    );
  };
```

The infrastructure runner supplies both ports bound to the same transaction.
A `ConcurrencyConflict` returns `Result.err`, so the audit write rolls back as
well.

## Message Acknowledgment Outcome

An inventory consumer maps application results into broker-neutral policy:

```ts
export const presentReserveInventoryMessageResult = (
  result: ReserveInventoryResult,
): MessageHandlingOutcome => {
  if (result.ok) return { type: "Acknowledge" };

  switch (result.error.type) {
    case "DatabaseUnavailable":
      return { type: "Retry", delayMs: 5_000 };
    case "InvalidOrderPlacedMessage":
      return {
        type: "Reject",
        reason: "Message cannot succeed on retry",
      };
    case "InsufficientInventory":
      return { type: "Acknowledge" };
    default:
      return assertNever(result.error);
  }
};
```

`InsufficientInventory` is a completed business decision; retrying cannot
create stock. The application may persist or emit a separate refusal fact when
the workflow requires it. Only the consumer calls broker APIs.
