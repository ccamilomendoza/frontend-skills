# Worked Examples

Use these examples to connect folder placement, adapter hydration,
cross-feature imports, and `shared` governance.

## Contents

1. [Payment read boundary](#payment-read-boundary)
2. [Cross-module checkout composition](#cross-module-checkout-composition)
3. [The two shared channels](#the-two-shared-channels)

## Payment Read Boundary

```text
src/modules/payments/
  domain/
    entities/receipt.ts
    ports/charge-payment-port.ts
    services/receipt-creation.ts
  application/
    use-cases/process-payment.ts
  infrastructure/
    server/
      adapters/stripe-charge-payment-adapter.ts
      dtos/receipt-dto.ts
      mappers/receipt-dto-to-make-receipt-args.ts
      schemas/receipt-dto-schema.ts
    ui/
```

Declare the domain value in `src/modules/payments/domain/entities/receipt.ts`:

```ts
export interface ReceiptId {
  readonly value: string;
}

export interface OrderId {
  readonly value: string;
}

export interface Money {
  readonly cents: number;
  readonly currency: string;
}

export interface Receipt {
  readonly id: ReceiptId;
  readonly orderId: OrderId;
  readonly charged: Money;
}
```

Put invariant-preserving behavior in
`src/modules/payments/domain/services/receipt-creation.ts`:

```ts
import type { Money, OrderId, Receipt, ReceiptId } from "../entities/receipt";

export interface MakeReceiptArgs {
  readonly id: ReceiptId;
  readonly orderId: OrderId;
  readonly charged: Money;
}

export type ReceiptDomainError =
  | { readonly type: "MissingReceiptId" }
  | {
      readonly type: "InvalidReceiptAmount";
      readonly amount: Money;
    };

export const hasPositiveAmount = (amount: Money): boolean =>
  amount.cents > 0;

export const makeReceipt = (
  args: MakeReceiptArgs,
): Result<Receipt, ReceiptDomainError> => {
  if (args.id.value.length === 0) {
    return err({ type: "MissingReceiptId" });
  }

  if (!hasPositiveAmount(args.charged)) {
    return err({
      type: "InvalidReceiptAmount",
      amount: args.charged,
    });
  }

  return ok(args);
};
```

Declare the capability in domain terms:

```ts
export interface ChargePaymentPortRequest {
  readonly orderId: OrderId;
  readonly amount: Money;
}

export type ChargePaymentPortError =
  | NetworkError
  | ParseError
  | ReceiptDomainError
  | { readonly type: "CardDeclined"; readonly reason: string };

export type ChargePaymentPort = (
  request: ChargePaymentPortRequest,
) => Promise<Result<Receipt, ChargePaymentPortError>>;
```

Validate the wire value and hydrate the domain:

```ts
export const receiptDtoSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  charged_cents: z.number().int(),
  currency: z.string(),
});

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

The adapter is responsible for external trust and hydration. The use case sees
only `Receipt` and `ChargePaymentPortError`.

## Cross-Module Checkout Composition

Let `users` own current-user lookup and publish its application callable:

```ts
// modules/users/application/use-cases/fetch-current-user.ts
export type FetchCurrentUserUseCase = (
  dependencies: FetchCurrentUserDependencies,
) => (
  args: FetchCurrentUserArgs,
) => Promise<Result<CurrentUser, FetchCurrentUserError>>;
```

Let `checkout` depend on that behavior:

```ts
// modules/checkout/application/use-cases/start-checkout.ts
import type {
  FetchCurrentUserArgs,
  FetchCurrentUserError,
} from "@/modules/users/application/use-cases/fetch-current-user";

export interface StartCheckoutDependencies {
  readonly fetchCurrentUser: (
    args: FetchCurrentUserArgs,
  ) => Promise<Result<CurrentUser, FetchCurrentUserError>>;
}

export interface StartCheckoutArgs {
  readonly cartId: CartId;
  readonly sessionId: SessionId;
}

export const makeStartCheckoutUseCase =
  ({ fetchCurrentUser }: StartCheckoutDependencies) =>
  async ({ cartId, sessionId }: StartCheckoutArgs) => {
    const user = await fetchCurrentUser({
      sessionId,
    });

    if (!user.ok) return err(user.error);
    if (!user.value.isVerified) {
      return err({ type: "UserNotVerified" } as const);
    }

    return makeCheckout({
      cartId,
      userId: { value: user.value.id },
    });
  };
```

Compose private adapters from the neutral app root:

```ts
// modules/app/infrastructure/ui/compositions/checkout-composition.ts
const fetchCurrentUser = makeFetchCurrentUserUseCase({
  fetchUser: makeHttpFetchUserAdapter({ http }),
  fetchSession: makeStorageFetchSessionAdapter({ storage }),
});

export const startCheckout = makeStartCheckoutUseCase({
  fetchCurrentUser,
});
```

The graph is `checkout -> users -> shared`. Keep `users` from importing
`checkout`.

## The Two Shared Channels

### Pure domain logic

After a genuine second consumer appears, place eligible pure cross-context
logic in `shared/domain/services/`:

```ts
export const canCheckout = (
  cart: Cart,
  wallet: Wallet,
): boolean => wallet.balance.cents >= cart.total.cents;
```

The function accepts all inputs explicitly and performs no runtime fan-out.

### Design-system UI

Create generic presentation primitives directly in shared UI:

```text
modules/shared/infrastructure/ui/
  buttons/button.tsx
  dialogs/dialog.tsx
  inputs/text-input.tsx
```

Feature UI may import these primitives. It may not import another feature's
private UI merely because a component appears reusable. Promote a
feature-flavored component only when ownership and a second consumer justify
the move.
