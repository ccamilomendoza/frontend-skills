# Use Cases and Adapters

Use this reference when designing functional application APIs, ports, smart
constructors, `Result` errors, or external-data adapters.

## Contents

1. [Result and errors](#result-and-errors)
2. [Use-case shapes](#use-case-shapes)
3. [Read and write boundaries](#read-and-write-boundaries)
4. [External-data pipeline](#external-data-pipeline)
5. [Query-library integration](#query-library-integration)
6. [Cross-module injection](#cross-module-injection)

## Result and Errors

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

Represent expected failures as values. Use literal `type` discriminants and
match exhaustively. Define each operation's union from only the variants it can
actually produce.

Define stable technical primitives once:

```ts
export interface NetworkError {
  readonly type: "NetworkError";
  readonly status?: number;
}

export interface ParseError {
  readonly type: "ParseError";
  readonly issues: readonly string[];
}
```

Use them verbatim. Add a new tagged business variant instead of extending or
reshaping a shared primitive.

## Use-Case Shapes

### Dependency-bound mutation

Bind stable dependencies in an outer factory and accept execution values in the
returned function:

```ts
export interface ProcessPaymentDependencies {
  readonly hasProcessedPayment: HasProcessedPaymentPort;
  readonly chargePayment: ChargePaymentPort;
}

export type ProcessPaymentError =
  | HasProcessedPaymentPortError
  | ChargePaymentPortError
  | {
      readonly type: "OrderAlreadyProcessed";
      readonly orderId: OrderId;
    };

export type ProcessPaymentUseCase = (
  dependencies: ProcessPaymentDependencies,
) => (
  request: ChargePaymentPortRequest,
) => Promise<Result<Receipt, ProcessPaymentError>>;

export const makeProcessPaymentUseCase: ProcessPaymentUseCase =
  ({ hasProcessedPayment, chargePayment }) =>
  async ({ orderId, amount }) => {
    const processed = await hasProcessedPayment({ orderId });

    if (!processed.ok) return err(processed.error);
    if (processed.value) {
      return err({
        type: "OrderAlreadyProcessed",
        orderId,
      });
    }

    return chargePayment({ orderId, amount });
  };
```

### Dependency-bound query

Keep the application callable independent of UI request libraries:

```ts
export interface FetchUserDependencies {
  readonly fetchUser: FetchUserPort;
}

export type FetchUserUseCase = (
  dependencies: FetchUserDependencies,
) => (
  request: FetchUserPortRequest,
) => Promise<Result<User, FetchUserPortError>>;

export const makeFetchUserUseCase: FetchUserUseCase =
  ({ fetchUser }) =>
  (request) =>
    fetchUser(request);
```

The use case reuses the port request type directly. The UI adapter may bind the
request later to create `() => Promise<Result<...>>`.

### Zero-dependency use case

Export a direct function when only pure domain behavior is coordinated:

```ts
export interface PrepareCheckoutArgs {
  readonly cart: Cart;
  readonly wallet: Wallet;
}

export type PrepareCheckoutUseCase = (
  args: PrepareCheckoutArgs,
) => Result<PreparedCheckout, PrepareCheckoutError>;

export const prepareCheckoutUseCase: PrepareCheckoutUseCase = ({ cart, wallet }) => {
  if (!canCheckout(cart, wallet)) {
    return err({ type: "InsufficientFunds" });
  }

  return ok({
    cart,
    total: calculateCheckoutTotal(cart),
  });
};
```

Do not create an empty dependencies type or no-op factory.

## Read and Write Boundaries

Invoke one domain constructor from two different callers without duplicating its
rules:

- On reads, the adapter parses external data, maps it, and invokes the smart
  constructor before satisfying the port.
- On writes, the use case invokes the smart constructor on user/application
  arguments before sending a valid entity to a persistence port.

```ts
export const makeRegisterUserUseCase =
  ({ saveUser }: RegisterUserDependencies) =>
  async (args: RegisterUserArgs) => {
    const user = makeUser(args);
    if (!user.ok) return user;

    return saveUser({ user: user.value });
  };
```

Do not revalidate a domain value after a port has already promised it.

## External-Data Pipeline

Keep raw inputs typed as `unknown` until Zod parses them:

```ts
export interface ReceiptDto {
  readonly id: string;
  readonly order_id: string;
  readonly charged_cents: number;
  readonly currency: string;
}

export const receiptDtoSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  charged_cents: z.number().int(),
  currency: z.string(),
}) satisfies z.ZodType<ReceiptDto>;
```

Map only after parsing:

```ts
export const transformReceiptDtoToMakeReceiptArgs = (
  { id, order_id, charged_cents, currency }: ReceiptDto,
): MakeReceiptArgs => ({
  id: { value: id },
  orderId: { value: order_id },
  charged: {
    cents: charged_cents,
    currency,
  },
});
```

Implement the port in a fat adapter:

```ts
export interface StripeChargePaymentAdapterDependencies {
  readonly http: HttpClient;
}

export const makeStripeChargePaymentAdapter =
  (
    { http }: StripeChargePaymentAdapterDependencies,
  ): ChargePaymentPort =>
  async (request) => {
    const response = await http.post("/charges", request);

    if (!response.ok) {
      return err({
        type: "NetworkError",
        status: response.status,
      });
    }

    const parsed = receiptDtoSchema.safeParse(response.body);
    if (!parsed.success) {
      return err({
        type: "ParseError",
        issues: parsed.error.issues.map(String),
      });
    }

    return makeReceipt(
      transformReceiptDtoToMakeReceiptArgs(parsed.data),
    );
  };
```

Zod proves the wire shape. The mapper performs structural conversion. The
domain constructor proves business validity.

## Query-Library Integration

Adapt the application callable inside UI infrastructure:

```ts
export const useFetchUser = (request: FetchUserPortRequest) => {
  const query = useQuery({
    queryKey: userQueryKey(request),
    queryFn: () => fetchUser(request),
  });

  // Return a curated UI contract.
};
```

This keeps TanStack Query, SWR, or any equivalent library out of application
contracts. If a project intentionally standardizes bound no-argument query use
cases, document that as a local architecture decision rather than presenting it
as framework-independent necessity.

## Cross-Module Injection

Suppose `checkout` needs behavior owned by `users`.

`checkout/application` may import the public `FetchCurrentUserUseCase` type:

```ts
export interface StartCheckoutDependencies {
  readonly fetchCurrentUser: (
    args: FetchCurrentUserArgs,
  ) => Promise<Result<CurrentUser, FetchCurrentUserError>>;
}
```

A neutral composition root can access both modules' private infrastructure:

```ts
const fetchCurrentUser = makeFetchCurrentUserUseCase({
  fetchUser: makeHttpFetchUserAdapter({ http }),
  fetchSession: makeStorageFetchSessionAdapter({ storage }),
});

const startCheckout = makeStartCheckoutUseCase({
  fetchCurrentUser,
});
```

The compile-time import establishes the allowed module edge. Functional
dependency injection supplies the runtime implementation. Keep both explicit.
