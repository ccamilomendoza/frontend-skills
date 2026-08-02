# Hexagonal Backend — Permissive: Worked Examples

These examples use an `orders` feature to show the complete boundary pipeline,
then add permissive cross-module composition, a multi-write transaction, and a
message-consumer outcome.

## Contents

1. [HTTP to domain to Postgres](#1-http-to-domain-to-postgres)
2. [Permissive cross-module composition](#2-permissive-cross-module-composition)
3. [Multi-write transaction](#3-multi-write-transaction)
4. [Message acknowledgment outcome](#4-message-acknowledgment-outcome)

## 1. HTTP to domain to Postgres

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
    inbound/
      http/
        routes/create-order-route.ts
        handlers/create-order-http-handler.ts
        dtos/create-order-http-request-dto.ts
        dtos/order-http-response-dto.ts
        schemas/create-order-http-request-dto-schema.ts
        schemas/order-http-response-dto-schema.ts
        mappers/create-order-http-request-dto-to-place-order-args.ts
        mappers/order-to-order-http-response-dto.ts
        presenters/place-order-http-result.ts
    outbound/
      persistence/
        postgres/
          adapters/save-order-postgres-adapter.ts
          records/order-record.ts
          schemas/order-record-schema.ts
          mappers/order-record-to-make-order-args.ts
```

Framework and client interfaces below are illustrative project-specific
infrastructure types.

### Shared `Result`

```ts
// modules/shared/domain/results/result.ts
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

### Domain entity

```ts
// domain/entities/order.ts
export interface OrderId {
  readonly value: string;
}

export interface CustomerId {
  readonly value: string;
}

export interface Money {
  readonly cents: number;
  readonly currency: string;
}

export interface Order {
  readonly id: OrderId;
  readonly customerId: CustomerId;
  readonly total: Money;
  readonly status: "pending";
}
```

### Domain smart constructor

```ts
// domain/services/order-creation.ts
import { err, ok, type Result } from
  "../../../shared/domain/results/result";
import type { Order } from "../entities/order";

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
  | { readonly type: "UnsupportedCurrency"; readonly currency: string };

export const makeOrder = (
  args: MakeOrderArgs,
): Result<Order, OrderDomainError> => {
  if (args.id.length === 0) return err({ type: "InvalidOrderId" });
  if (args.customerId.length === 0)
    return err({ type: "InvalidCustomerId" });
  if (args.totalCents <= 0) return err({ type: "InvalidOrderTotal" });
  if (args.currency !== "USD")
    return err({ type: "UnsupportedCurrency", currency: args.currency });

  return ok({
    id: { value: args.id },
    customerId: { value: args.customerId },
    total: { cents: args.totalCents, currency: args.currency },
    status: "pending",
  });
};
```

### Narrow persistence port

```ts
// domain/ports/save-order-port.ts
import type { Result } from
  "../../../shared/domain/results/result";
import type {
  DatabaseUnavailable,
  ParseError,
} from "../../../shared/domain/errors/infrastructure";
import type { Order } from "../entities/order";
import type { OrderDomainError } from "../services/order-creation";

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

### Application use case

```ts
// application/use-cases/place-order.ts
import { err, type Result } from
  "../../../shared/domain/results/result";
import type { Actor } from
  "../../../shared/domain/entities/actor";
import type { Order } from "../../domain/entities/order";
import type {
  SaveOrderPort,
  SaveOrderPortError,
} from "../../domain/ports/save-order-port";
import {
  makeOrder,
  type OrderDomainError,
} from "../../domain/services/order-creation";

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

export type PlaceOrderUseCase = (
  dependencies: PlaceOrderDependencies,
) => PlaceOrder;

export const makePlaceOrderUseCase: PlaceOrderUseCase =
  (dependencies) =>
  async (args) => {
    const order = makeOrder({
      id: args.orderId,
      customerId: args.customerId,
      totalCents: args.totalCents,
      currency: args.currency,
    });

    if (!order.ok) return order;

    if (args.actor.customerId.value !== order.value.customerId.value)
      return err({ type: "PlaceOrderNotAuthorized" });

    return dependencies.saveOrder({ order: order.value });
  };
```

New request values stay primitive until the use case invokes `makeOrder`.
`actor` is already-established authenticated context.

### Postgres record, schema, and mapper

```ts
// outbound/persistence/postgres/records/order-record.ts
export interface OrderRecord {
  readonly id: string;
  readonly customer_id: string;
  readonly total_cents: number;
  readonly currency: string;
  readonly status: "pending";
}
```

```ts
// outbound/persistence/postgres/schemas/order-record-schema.ts
import { z } from "zod";
import type { OrderRecord } from "../records/order-record";

export const orderRecordSchema = z.object({
  id: z.string(),
  customer_id: z.string(),
  total_cents: z.number().int(),
  currency: z.string(),
  status: z.literal("pending"),
}) satisfies z.ZodType<OrderRecord>;
```

```ts
// outbound/persistence/postgres/mappers/order-record-to-make-order-args.ts
import type { MakeOrderArgs } from
  "../../../../../domain/services/order-creation";
import type { OrderRecord } from "../records/order-record";

export const transformOrderRecordToMakeOrderArgs = (
  record: OrderRecord,
): MakeOrderArgs => ({
  id: record.id,
  customerId: record.customer_id,
  totalCents: record.total_cents,
  currency: record.currency,
});
```

### Postgres adapter

```ts
// outbound/persistence/postgres/adapters/save-order-postgres-adapter.ts
import { err } from
  "../../../../../../shared/domain/results/result";
import type { SaveOrderPort } from
  "../../../../../domain/ports/save-order-port";
import { makeOrder } from
  "../../../../../domain/services/order-creation";
import { orderRecordSchema } from "../schemas/order-record-schema";
import { transformOrderRecordToMakeOrderArgs } from
  "../mappers/order-record-to-make-order-args";

export interface SaveOrderPostgresAdapterDependencies {
  readonly database: DatabaseClient;
}

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
      if (!parsed.success)
        return err({
          type: "ParseError",
          issues: parsed.error.issues.map(String),
        });

      return makeOrder(
        transformOrderRecordToMakeOrderArgs(parsed.data),
      );
    } catch (cause) {
      if (isUniqueViolation(cause))
        return err({ type: "OrderAlreadyExists" });
      if (isDatabaseUnavailable(cause))
        return err({ type: "DatabaseUnavailable" });
      throw cause;
    }
  };
```

The adapter parses the returned row even though this application wrote it.

### HTTP request contract

```ts
// inbound/http/dtos/create-order-http-request-dto.ts
export interface CreateOrderHttpRequestDto {
  readonly body: {
    readonly orderId: string;
    readonly customerId: string;
    readonly totalCents: number;
    readonly currency: string;
  };
}
```

```ts
// inbound/http/schemas/create-order-http-request-dto-schema.ts
import { z } from "zod";
import type { CreateOrderHttpRequestDto } from
  "../dtos/create-order-http-request-dto";

export const createOrderHttpRequestDtoSchema = z.object({
  body: z.object({
    orderId: z.string(),
    customerId: z.string(),
    totalCents: z.number().int(),
    currency: z.string(),
  }),
}) satisfies z.ZodType<CreateOrderHttpRequestDto>;
```

```ts
// inbound/http/mappers/create-order-http-request-dto-to-place-order-args.ts
import type { Actor } from
  "../../../../../shared/domain/entities/actor";
import type { PlaceOrderArgs } from
  "../../../../application/use-cases/place-order";
import type { CreateOrderHttpRequestDto } from
  "../dtos/create-order-http-request-dto";

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

### HTTP response contract and mapper

```ts
// inbound/http/dtos/order-http-response-dto.ts
export interface OrderHttpResponseDto {
  readonly id: string;
  readonly customerId: string;
  readonly totalCents: number;
  readonly currency: string;
  readonly status: "pending";
}

export interface PublicErrorHttpResponseDto {
  readonly code: string;
  readonly message: string;
}
```

```ts
// inbound/http/schemas/order-http-response-dto-schema.ts
import { z } from "zod";
import type {
  OrderHttpResponseDto,
  PublicErrorHttpResponseDto,
} from "../dtos/order-http-response-dto";

export const orderHttpResponseDtoSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  totalCents: z.number().int().positive(),
  currency: z.string(),
  status: z.literal("pending"),
}) satisfies z.ZodType<OrderHttpResponseDto>;

export const publicErrorHttpResponseDtoSchema = z.object({
  code: z.string(),
  message: z.string(),
}) satisfies z.ZodType<PublicErrorHttpResponseDto>;
```

```ts
// inbound/http/mappers/order-to-order-http-response-dto.ts
import type { Order } from "../../../../domain/entities/order";
import type { OrderHttpResponseDto } from
  "../dtos/order-http-response-dto";

export const transformOrderToOrderHttpResponseDto = (
  order: Order,
): OrderHttpResponseDto => ({
  id: order.id.value,
  customerId: order.customerId.value,
  totalCents: order.total.cents,
  currency: order.total.currency,
  status: order.status,
});
```

### HTTP presenter

```ts
// inbound/http/presenters/place-order-http-result.ts
import type {
  PlaceOrderError,
} from "../../../../application/use-cases/place-order";
import type { Order } from "../../../../domain/entities/order";
import type { Result } from
  "../../../../../shared/domain/results/result";
import { assertNever } from
  "../../../../../shared/domain/results/assert-never";
import type {
  OrderHttpResponseDto,
  PublicErrorHttpResponseDto,
} from "../dtos/order-http-response-dto";
import { transformOrderToOrderHttpResponseDto } from
  "../mappers/order-to-order-http-response-dto";
import {
  orderHttpResponseDtoSchema,
  publicErrorHttpResponseDtoSchema,
} from "../schemas/order-http-response-dto-schema";

export type PlaceOrderHttpOutcome =
  | {
      readonly status: 201;
      readonly body: OrderHttpResponseDto;
    }
  | {
      readonly status: 400 | 403 | 409 | 422 | 500 | 503;
      readonly body: PublicErrorHttpResponseDto;
    };

const presentError = (
  status: 400 | 403 | 409 | 422 | 500 | 503,
  code: string,
  message: string,
): PlaceOrderHttpOutcome => ({
  status,
  body: publicErrorHttpResponseDtoSchema.parse({ code, message }),
});

export const presentPlaceOrderHttpResult = (
  result: Result<Order, PlaceOrderError>,
): PlaceOrderHttpOutcome => {
  if (result.ok)
    return {
      status: 201,
      body: orderHttpResponseDtoSchema.parse(
        transformOrderToOrderHttpResponseDto(result.value),
      ),
    };

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

export const presentInvalidCreateOrderHttpRequest =
  (): PlaceOrderHttpOutcome =>
    presentError(400, "INVALID_REQUEST", "Request is invalid");
```

The presenter validates both success and public error DTOs. A failed output
parse throws to the framework safety boundary.

### HTTP handler and route

```ts
// inbound/http/handlers/create-order-http-handler.ts
import type { PlaceOrder } from
  "../../../../application/use-cases/place-order";
import { transformCreateOrderHttpRequestDtoToPlaceOrderArgs } from
  "../mappers/create-order-http-request-dto-to-place-order-args";
import {
  presentInvalidCreateOrderHttpRequest,
  presentPlaceOrderHttpResult,
} from
  "../presenters/place-order-http-result";
import { createOrderHttpRequestDtoSchema } from
  "../schemas/create-order-http-request-dto-schema";

export interface CreateOrderHttpHandlerDependencies {
  readonly placeOrder: PlaceOrder;
}

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

```ts
// inbound/http/routes/create-order-route.ts
export const registerCreateOrderRoute = (
  http: HttpServer,
  handler: HttpHandler,
): void => {
  http.post("/orders", handler);
};
```

### Module-owned composition

```ts
// infrastructure/compositions/register-orders-http.ts
export interface RegisterOrdersHttpDependencies {
  readonly database: DatabaseClient;
  readonly http: HttpServer;
}

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

The feature owns its wiring. Returning the bound public use case allows
`src/main/` to inject it into another module when necessary.

## 2. Permissive cross-module composition

Suppose `checkout` needs the current user.

### User's public use case

```ts
// modules/user/application/use-cases/fetch-current-user.ts
export interface FetchCurrentUserArgs {
  readonly actor: Actor;
}

export interface CurrentUser {
  readonly id: string;
  readonly verified: boolean;
}

export type FetchCurrentUser = (
  args: FetchCurrentUserArgs,
) => Promise<Result<CurrentUser, FetchCurrentUserError>>;

export type FetchCurrentUserUseCase = (
  dependencies: FetchCurrentUserDependencies,
) => FetchCurrentUser;
```

`CurrentUser` is part of the application use-case contract. Checkout does not
import user's private domain entity.

### Checkout imports the public behavior

```ts
// modules/checkout/application/use-cases/start-checkout.ts
import type {
  FetchCurrentUser,
  FetchCurrentUserError,
} from "../../../user/application/use-cases/fetch-current-user";

export interface StartCheckoutDependencies {
  readonly fetchCurrentUser: FetchCurrentUser;
  readonly saveCheckout: SaveCheckoutPort;
}

export type StartCheckoutError =
  | FetchCurrentUserError
  | SaveCheckoutPortError
  | { readonly type: "UserNotVerified" };

export const makeStartCheckoutUseCase =
  (dependencies: StartCheckoutDependencies) =>
  async (
    args: StartCheckoutArgs,
  ): Promise<Result<Checkout, StartCheckoutError>> => {
    const user = await dependencies.fetchCurrentUser({
      actor: args.actor,
    });

    if (!user.ok) return user;
    if (!user.value.verified)
      return err({ type: "UserNotVerified" });

    return dependencies.saveCheckout({
      checkout: makeCheckout(args),
    });
  };
```

### Minimal process root

```ts
// main/entries/api.ts
const database = makeDatabasePool(config);
const http = makeHttpServer(config);

const userModule = registerUserHttp({ database, http });

registerCheckoutHttp({
  database,
  http,
  fetchCurrentUser: userModule.fetchCurrentUser,
});

registerOrdersHttp({ database, http });

await http.start();
```

`main/` passes the bound public function. It does not construct checkout's
repositories or handlers. The dependency is `checkout → user`; user must not
depend on checkout.

## 3. Multi-write transaction

An approval must update an order and append an audit entry atomically.

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

The infrastructure runner supplies both ports bound to the same concrete
transaction. `ConcurrencyConflict` from `saveOrder` returns `err`, causing the
runner to roll back the audit write as well.

## 4. Message acknowledgment outcome

An inventory consumer processes an `OrderPlaced` message.

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

`InsufficientInventory` is a completed business decision; retrying does not
create stock. The application may emit a separate reservation-refused event.

The framework consumer alone touches broker APIs:

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
